import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionChatCard } from "@/components/chat/section-chat-card";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { formatShortDate } from "@/lib/ui";
import { daysSince, materialHealth } from "@/lib/material-health";
import { opsDiskUsage } from "@/lib/nas-ops";
import { IconBiblioteca } from "@/components/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Recursos, type LibRow } from "./recursos";
import { Discos, type DiskRow } from "./discos";
import { Mapa, type MapProject } from "./mapa";

export const dynamic = "force-dynamic";

// Categorías sugeridas en el alta (el equipo puede escribir otras).
const CATEGORIES = ["Música", "Logos", "Stock", "Plantillas", "Fuentes", "Marca", "NAS"];

const TABS = [
  { key: "recursos", label: "Recursos" },
  { key: "discos", label: "Discos" },
  { key: "mapa", label: "Mapa del material" },
] as const;

// Severidad para ordenar el mapa: lo que está en riesgo, arriba.
const HEALTH_ORDER: Record<string, number> = { SIN_RESPALDO: 0, SIN_REGISTRO: 1, PARCIAL: 2, OK: 3 };

export default async function BibliotecaPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; disco?: string }> }) {
  // Acceso a la Biblioteca por permiso (el backfill se lo da al equipo; los clientes no).
  const session = await getSession();
  if (!hasPermission(session, "ver_biblioteca")) redirect("/");
  // Gestionar (añadir/editar/fijar) requiere permiso aparte; ver es suficiente para mirar.
  const canManage = hasPermission(session, "gestionar_biblioteca");

  const { tab: rawTab, q, disco } = await searchParams;
  const tab = TABS.some((t) => t.key === rawTab) ? (rawTab as (typeof TABS)[number]["key"]) : "recursos";
  const now = new Date();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        icon={<IconBiblioteca />}
        title="Biblioteca"
        description="Recursos del estudio, discos y ubicación del material."
      />
      <div className="mt-3"><SectionChatCard section="biblioteca" /></div>

      {/* Pestañas */}
      <div className="mt-6 inline-flex gap-0.5 rounded-lg border border-border bg-accent/50 p-0.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "recursos" ? "/biblioteca" : `/biblioteca?tab=${t.key}`}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium ${
              tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "recursos" ? <RecursosTab canManage={canManage} userId={session!.id} initialQ={q ?? ""} /> : null}
      {tab === "discos" ? <DiscosTab canManage={canManage} now={now} highlightId={disco ?? null} /> : null}
      {tab === "mapa" ? <MapaTab canManage={canManage} now={now} /> : null}
    </div>
  );
}

async function RecursosTab({ canManage, userId, initialQ }: { canManage: boolean; userId: string; initialQ: string }) {
  const [assets, projects, clients] = await Promise.all([
    db.libraryAsset.findMany({
      orderBy: [{ pinned: "desc" }, { category: "asc" }, { createdAt: "desc" }],
      include: {
        uploadedBy: { select: { name: true } },
        project: { select: { name: true } },
        client: { select: { name: true } },
      },
    }),
    // Para el selector de vínculo: proyectos fuera de la papelera, alfabético.
    db.project.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.client.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows: LibRow[] = assets.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    url: a.url,
    category: a.category,
    pinned: a.pinned,
    uploadedById: a.uploadedById,
    uploadedByName: a.uploadedBy?.name ?? null,
    createdAtLabel: formatShortDate(a.createdAt) ?? "",
    projectId: a.projectId,
    projectName: a.project?.name ?? null,
    clientId: a.clientId,
    clientName: a.client?.name ?? null,
  }));

  return (
    <Recursos
      rows={rows}
      canManage={canManage}
      userId={userId}
      projects={projects}
      clients={clients}
      baseCategories={CATEGORIES}
      initialQ={initialQ}
    />
  );
}

async function DiscosTab({ canManage, now, highlightId = null }: { canManage: boolean; now: Date; highlightId?: string | null }) {
  const [disks, nasUsage] = await Promise.all([
    db.storageDisk.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      include: { locations: { select: { projectId: true } } },
    }),
    // Ocupación EN VIVO de Operaciones_LAB (statfs): pinta el disco «Es el NAS» sola.
    // null si el mount no está (dev o deploy sin bind): se usa el valor anotado a mano.
    opsDiskUsage(),
  ]);

  const rows: DiskRow[] = disks.map((d) => {
    const live = d.isNas && nasUsage ? nasUsage : null;
    return {
      id: d.id,
      name: d.name,
      kind: d.kind,
      color: d.color,
      capacityGB: live?.totalGB ?? d.capacityGB,
      usedGB: live?.usedGB ?? d.usedGB,
      liveNas: Boolean(live),
      location: d.location,
      offsite: d.offsite,
      isNas: d.isNas,
      status: d.status,
      notes: d.notes,
      lastCheckDays: daysSince(d.lastCheckAt, now),
      nProjects: new Set(d.locations.map((l) => l.projectId)).size,
      nLocations: d.locations.length,
    };
  });

  return <Discos disks={rows} canManage={canManage} highlightId={highlightId} />;
}

async function MapaTab({ canManage, now }: { canManage: boolean; now: Date }) {
  const [projects, disks] = await Promise.all([
    // Fuera de la papelera; los TERMINADOS se quedan (su respaldo es el que más importa).
    db.project.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        finishedAt: true,
        client: { select: { name: true } },
        materialLocations: {
          include: { disk: { select: { id: true, name: true, color: true, kind: true, offsite: true } } },
        },
      },
    }),
    db.storageDisk.findMany({ where: { status: "ACTIVO" }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
  ]);

  const rows: MapProject[] = projects
    .map((p) => ({
      id: p.id,
      name: p.name,
      clientName: p.client?.name ?? null,
      finished: Boolean(p.finishedAt),
      locations: p.materialLocations.map((l) => ({
        id: l.id,
        role: l.role,
        path: l.path,
        diskId: l.diskId,
        diskName: l.disk.name,
        diskColor: l.disk.color,
        verifiedDays: daysSince(l.verifiedAt, now),
      })),
      health: materialHealth(
        p.materialLocations.map((l) => ({ role: l.role, diskId: l.diskId, diskKind: l.disk.kind, offsite: l.disk.offsite }))
      ),
    }))
    .sort((a, b) => (HEALTH_ORDER[a.health.level] ?? 9) - (HEALTH_ORDER[b.health.level] ?? 9) || a.name.localeCompare(b.name, "es"));

  return <Mapa projects={rows} disks={disks} canManage={canManage} />;
}
