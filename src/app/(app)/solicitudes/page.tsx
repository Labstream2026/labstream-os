import { redirect } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { formatBogota } from "@/lib/bogota-time";
import { REQUEST_TYPES, REQUEST_STATUS } from "@/lib/client-portal";
import { ClientPortalNav } from "@/components/client-portal-nav";
import { cn } from "@/lib/utils";
import { NewRequest } from "./new-request";

export const dynamic = "force-dynamic";

// ── Solicitudes del cliente ──
// Pedir cosas sin chat: cada solicitud nace como tarea del equipo y aquí el cliente ve su
// estado (Recibida → En curso → Resuelta) y la respuesta, sin perseguir a nadie.
export default async function SolicitudesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "cliente") redirect("/");

  const [projects, requests] = await Promise.all([
    db.project.findMany({
      where: { AND: [accessibleProjectWhere(session), { finishedAt: null }] },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, emoji: true },
    }),
    db.clientRequest.findMany({
      where: { createdById: session.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        title: true,
        details: true,
        status: true,
        responseNote: true,
        resolvedAt: true,
        resolvedById: true,
        createdAt: true,
        project: { select: { name: true } },
      },
    }),
  ]);

  // Nombre de quien resolvió (ids sueltos a propósito en el modelo; se resuelven aquí).
  const resolverIds = [...new Set(requests.map((r) => r.resolvedById).filter(Boolean))] as string[];
  const resolvers = resolverIds.length
    ? new Map(
        (await db.user.findMany({ where: { id: { in: resolverIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
      )
    : new Map<string, string>();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <MessageSquarePlus className="size-6 text-primary" /> Solicitudes al equipo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pide un cambio, material nuevo, haz una pregunta o agenda una reunión. Cada solicitud queda con su estado — sin perseguir a nadie.
        </p>
      </header>

      <ClientPortalNav active="solicitudes" />

      <NewRequest projects={projects.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji }))} />

      <section className="mt-6">
        <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Tus solicitudes {requests.length ? `· ${requests.length}` : ""}
        </h2>
        {requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Aún no has enviado solicitudes. Cuando envíes una, aquí verás su estado y la respuesta del equipo.
          </div>
        ) : (
          <div className="space-y-2.5">
            {requests.map((r) => {
              const meta = REQUEST_TYPES[r.type] ?? { label: r.type, emoji: "📝" };
              const st = REQUEST_STATUS[r.status] ?? { label: r.status, className: "bg-muted text-muted-foreground" };
              const resolved = r.status === "RESUELTA";
              return (
                <article
                  key={r.id}
                  className={cn("flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm", resolved && "opacity-75")}
                >
                  <span className="text-lg">{meta.emoji}</span>
                  <div className="min-w-52 flex-1">
                    <p className="text-sm font-semibold">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.project.name} · {meta.label} · {formatBogota(r.createdAt, { day: "numeric", month: "short" })}
                      {resolved && r.resolvedAt
                        ? ` · resuelta el ${formatBogota(r.resolvedAt, { day: "numeric", month: "short" })}${r.resolvedById && resolvers.get(r.resolvedById) ? ` por ${resolvers.get(r.resolvedById)}` : ""}`
                        : ""}
                    </p>
                    {r.details ? <p className="mt-1.5 whitespace-pre-line text-sm text-foreground/80">{r.details}</p> : null}
                    {r.responseNote ? (
                      <div className="mt-2 rounded-r-lg border-l-[3px] border-primary bg-muted/50 px-3 py-2 text-sm">
                        <span className="font-semibold text-primary">Equipo:</span> {r.responseNote}
                      </div>
                    ) : null}
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium", st.className)}>{st.label}</span>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
