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
import { Resumen, type ResumenDato } from "./resumen";

export const dynamic = "force-dynamic";

// Categorías sugeridas en el alta (el equipo puede escribir otras).
const CATEGORIES = ["Música", "Logos", "Stock", "Plantillas", "Fuentes", "Marca", "NAS"];

const TABS = [
  { key: "recursos", label: "Recursos" },
  { key: "discos", label: "Discos" },
  { key: "mapa", label: "Mapa del material" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// Severidad para ordenar el mapa: lo que está en riesgo, arriba.
const HEALTH_ORDER: Record<string, number> = { SIN_RESPALDO: 0, SIN_REGISTRO: 1, PARCIAL: 2, OK: 3 };

// Un disco lleva demasiado sin verificarse a los seis meses (mismo umbral que el recordatorio).
const VERIF_DIAS = 180;

function tb(gb: number): string {
  return `${(gb / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} TB`;
}

export default async function BibliotecaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; disco?: string; riesgo?: string }>;
}) {
  // Acceso a la Biblioteca por permiso (el backfill se lo da al equipo; los clientes no).
  const session = await getSession();
  if (!hasPermission(session, "ver_biblioteca")) redirect("/");
  // Gestionar (añadir/editar/fijar) requiere permiso aparte; ver es suficiente para mirar.
  const canManage = hasPermission(session, "gestionar_biblioteca");

  const { tab: rawTab, q, disco, riesgo } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : "recursos";
  const now = new Date();

  // ── Resumen: se calcula SIEMPRE, sea cual sea la pestaña ────────────────────────────────
  // Es la respuesta a las preguntas que antes obligaban a entrar y salir de las tres
  // pestañas: cuánto hay, cuánto espacio queda y qué material está en riesgo.
  const [nRecursos, discosResumen, proyectosResumen, nasUsage] = await Promise.all([
    db.libraryAsset.count(),
    db.storageDisk.findMany({
      where: { status: "ACTIVO" },
      select: { id: true, capacityGB: true, usedGB: true, isNas: true, lastCheckAt: true },
    }),
    db.project.findMany({
      where: { archivedAt: null },
      select: { materialLocations: { select: { role: true, diskId: true, disk: { select: { kind: true, offsite: true } } } } },
    }),
    opsDiskUsage(),
  ]);

  let capacidad = 0;
  let usado = 0;
  let sinCapacidad = 0;
  for (const d of discosResumen) {
    const live = d.isNas && nasUsage ? nasUsage : null;
    const cap = live?.totalGB ?? d.capacityGB;
    if (cap == null) { sinCapacidad++; continue; }
    capacidad += cap;
    usado += Math.min(cap, live?.usedGB ?? d.usedGB ?? 0);
  }
  const libre = Math.max(0, capacidad - usado);
  const pctUsado = capacidad > 0 ? Math.round((usado / capacidad) * 100) : null;

  const porVerificar = discosResumen.filter(
    (d) => now.getTime() - (d.lastCheckAt?.getTime() ?? 0) > VERIF_DIAS * 86400000,
  ).length;

  const nRiesgo = proyectosResumen.filter((p) => {
    const nivel = materialHealth(
      p.materialLocations.map((l) => ({ role: l.role, diskId: l.diskId, diskKind: l.disk.kind, offsite: l.disk.offsite })),
    ).level;
    return nivel === "SIN_RESPALDO" || nivel === "SIN_REGISTRO";
  }).length;

  const datos: ResumenDato[] = [
    { k: "Recursos", v: String(nRecursos), pie: "enlaces, Drive y rutas", href: "/biblioteca" },
    {
      k: "Discos activos",
      v: String(discosResumen.length),
      pie: porVerificar ? `${porVerificar} sin verificar` : "todos verificados",
      tono: porVerificar ? "warn" : "good",
      href: "/biblioteca?tab=discos",
    },
    {
      k: "Espacio libre",
      v: capacidad > 0 ? tb(libre) : "—",
      pie: capacidad > 0 ? `${pctUsado} % ocupado${sinCapacidad ? ` · ${sinCapacidad} sin medir` : ""}` : "sin capacidades anotadas",
      tono: pctUsado != null && pctUsado >= 85 ? "warn" : "ink",
      href: "/biblioteca?tab=discos",
    },
    {
      k: "Material en riesgo",
      v: String(nRiesgo),
      pie: nRiesgo ? "sin respaldo o sin registrar" : "todo con respaldo",
      tono: nRiesgo ? "bad" : "good",
      href: nRiesgo ? "/biblioteca?tab=mapa&riesgo=1" : "/biblioteca?tab=mapa",
    },
  ];

  const conteos: Record<TabKey, number> = {
    recursos: nRecursos,
    discos: discosResumen.length,
    mapa: proyectosResumen.length,
  };
  const avisos: Record<TabKey, number> = { recursos: 0, discos: porVerificar, mapa: nRiesgo };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        icon={<IconBiblioteca />}
        title="Biblioteca"
        description="Recursos del estudio, discos y ubicación del material."
      />

      <Resumen datos={datos} />

      <div className="mt-3"><SectionChatCard section="biblioteca" /></div>

      {/* Pestañas: con el conteo de lo que hay dentro y, si algo pide atención, su aviso. */}
      <div className="mt-6 inline-flex items-center gap-1 rounded-lg bg-muted p-1">
        {TABS.map((t) => {
          const activa = tab === t.key;
          const aviso = avisos[t.key];
          return (
            <Link
              key={t.key}
              href={t.key === "recursos" ? "/biblioteca" : `/biblioteca?tab=${t.key}`}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activa ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span className="tabular-nums text-xs opacity-60">{conteos[t.key]}</span>
              {aviso > 0 ? (
                <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold tabular-nums text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  {aviso}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {tab === "recursos" ? <RecursosTab canManage={canManage} userId={session!.id} initialQ={q ?? ""} /> : null}
      {tab === "discos" ? <DiscosTab canManage={canManage} now={now} highlightId={disco ?? null} nasUsage={nasUsage} /> : null}
      {tab === "mapa" ? <MapaTab canManage={canManage} now={now} soloRiesgo={riesgo === "1"} /> : null}
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
    createdAtMs: a.createdAt.getTime(),
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

async function DiscosTab({ canManage, now, highlightId = null, nasUsage }: {
  canManage: boolean;
  now: Date;
  highlightId?: string | null;
  // Ocupación EN VIVO de Operaciones_LAB (statfs), ya leída para el resumen: pinta el disco
  // «Es el NAS» sola. null si el mount no está (dev o deploy sin bind): se usa el valor
  // anotado a mano. Se recibe en vez de volver a leerla para que la tarjeta del disco y el
  // «Espacio libre» de arriba no puedan discrepar.
  nasUsage: { usedGB: number; totalGB: number } | null;
}) {
  const disks = await db.storageDisk.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: { locations: { select: { projectId: true } } },
  });

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

async function MapaTab({ canManage, now, soloRiesgo }: { canManage: boolean; now: Date; soloRiesgo: boolean }) {
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

  return <Mapa projects={rows} disks={disks} canManage={canManage} initialRiesgo={soloRiesgo} />;
}
