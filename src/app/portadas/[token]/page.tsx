import type * as React from "react";
import { db } from "@/lib/db";
import { verifyCoversToken } from "@/lib/review-token";
import { photoViewSrc, photoDownloadSrc } from "@/lib/deliverable-photo";
import { Logo } from "@/components/brand/logo";
import { EntityEmoji } from "@/components/icons/marks";
import { CoversGallery, type PublicCover, type CoverGroup } from "./covers-gallery";

// Sala PÚBLICA del banco de portadas: el cliente ve las portadas del proyecto (vinculadas o
// sueltas), aprueba / pide cambios, elige la ganadora en los grupos A/B y descarga las
// aprobadas. Sin cuenta: la autorización es el token firmado por proyecto.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mismo tema carbón de la sala de revisión (variables copiadas de review/[token]).
const ROOM_VARS = {
  "--background": "240 6% 7%",
  "--foreground": "0 0% 95%",
  "--card": "240 6% 9%",
  "--card-foreground": "0 0% 95%",
  "--popover": "240 6% 9%",
  "--popover-foreground": "0 0% 95%",
  "--primary": "25 95% 53%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "240 5% 15%",
  "--secondary-foreground": "0 0% 92%",
  "--muted": "240 5% 14%",
  "--muted-foreground": "240 5% 66%",
  "--accent": "240 5% 16%",
  "--accent-foreground": "0 0% 95%",
  "--border": "240 5% 20%",
  "--input": "240 5% 24%",
  "--ring": "25 95% 53%",
} as React.CSSProperties;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark relative min-h-screen overflow-x-clip bg-background text-foreground" style={ROOM_VARS}>
      <div aria-hidden className="pointer-events-none absolute -top-32 right-[-10%] size-96 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-6rem] left-[-8%] size-80 rounded-full bg-primary/10 blur-3xl" />
      {children}
    </div>
  );
}

function Unavailable({ msg }: { msg: string }) {
  return (
    <Shell>
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.05] p-8 backdrop-blur-xl">
          <Logo className="mx-auto h-6" />
          <h1 className="mt-4 text-xl font-bold">Enlace no disponible</h1>
          <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
        </div>
      </div>
    </Shell>
  );
}

export default async function CoversPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const projectId = verifyCoversToken(token);
  if (!projectId) return <Unavailable msg="Este enlace de portadas no es válido. Pide uno nuevo a tu productor." />;

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      emoji: true,
      archivedAt: true,
      coversRevokedAt: true,
      client: { select: { name: true } },
      covers: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: { deliverable: { select: { id: true, number: true, name: true } } },
      },
    },
  });
  if (!project || project.archivedAt) return <Unavailable msg="Este enlace de portadas ya no está disponible." />;
  if (project.coversRevokedAt) return <Unavailable msg="El equipo revocó este enlace. Pide uno nuevo a tu productor." />;

  const toPub = (c: (typeof project.covers)[number]): PublicCover => ({
    id: c.id,
    name: c.name,
    src: photoViewSrc({ fileAssetId: c.fileAssetId, url: null }, 900),
    full: photoDownloadSrc({ fileAssetId: c.fileAssetId, url: null }),
    decision: c.decision,
    decisionBy: c.decisionBy,
    decisionNote: c.decisionNote,
  });

  // Agrupa por video vinculado (los grupos con 2+ portadas son A/B: se elige la ganadora);
  // las sueltas van en su propia sección al final.
  const byDeliverable = new Map<string, { deliverable: NonNullable<(typeof project.covers)[number]["deliverable"]>; covers: PublicCover[] }>();
  const loose: PublicCover[] = [];
  for (const c of project.covers) {
    if (c.deliverable) {
      const g = byDeliverable.get(c.deliverable.id) ?? { deliverable: c.deliverable, covers: [] };
      g.covers.push(toPub(c));
      byDeliverable.set(c.deliverable.id, g);
    } else {
      loose.push(toPub(c));
    }
  }
  const groups: CoverGroup[] = [
    ...[...byDeliverable.values()].map((g) => ({
      deliverable: { number: g.deliverable.number, name: g.deliverable.name },
      covers: g.covers,
    })),
    ...(loose.length ? [{ deliverable: null, covers: loose }] : []),
  ];

  return (
    <Shell>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-white/[0.04] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3.5">
          <Logo className="h-6" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Portadas · <EntityEmoji value={project.emoji} /> {project.name}</p>
            <p className="truncate text-xs text-muted-foreground">{project.client ? project.client.name : "Revisión de portadas"}</p>
          </div>
          <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">🖼️ {project.covers.length}</span>
        </div>
      </header>
      <main className="relative mx-auto max-w-5xl px-6 py-6">
        {project.covers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Aún no hay portadas para revisar. En cuanto el equipo las suba, las verás aquí.
          </div>
        ) : (
          <CoversGallery token={token} groups={groups} />
        )}
      </main>
    </Shell>
  );
}
