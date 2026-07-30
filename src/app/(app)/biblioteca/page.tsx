import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionChatCard } from "@/components/chat/section-chat-card";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { formatShortDate } from "@/lib/ui";
import {
  daysSince,
  diskNeedsCheck,
  expiryTone,
  materialHealth,
  resumenEspacio,
  DISK_FULL_PCT,
} from "@/lib/material-health";
import { MOUNT_KEYS, type MountKey } from "@/lib/disco-raiz";
import { mountUsage } from "@/lib/disco-raiz-server";
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

function tb(gb: number): string {
  return `${(gb / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} TB`;
}

// Ocupación EN VIVO de cada montaje (Operaciones_LAB y Entregas_LAB), leída UNA vez por
// carga y compartida por el resumen y por la ficha de cada disco: así el «Espacio libre» de
// arriba y la barra del disco no pueden discrepar.
async function usoDeMontajes(): Promise<Record<MountKey, { usedGB: number; totalGB: number } | null>> {
  const pares = await Promise.all(MOUNT_KEYS.map(async (k) => [k, await mountUsage(k)] as const));
  return Object.fromEntries(pares) as Record<MountKey, { usedGB: number; totalGB: number } | null>;
}

// Capacidad y ocupación EFECTIVAS de un disco: si es un montaje vivo mandan los números del
// disco real; si no, lo anotado a mano.
function medidas(
  d: { capacityGB: number | null; usedGB: number | null; mountKey: string | null },
  uso: Record<MountKey, { usedGB: number; totalGB: number } | null>,
) {
  const live = d.mountKey && d.mountKey in uso ? uso[d.mountKey as MountKey] : null;
  return { capacityGB: live?.totalGB ?? d.capacityGB, usedGB: live?.usedGB ?? d.usedGB, live: Boolean(live) };
}

// Date → "YYYY-MM-DD" en hora LOCAL. `toISOString()` no sirve: convierte a UTC y en Bogotá
// (UTC−5) devolvería el día anterior para cualquier fecha guardada a medianoche.
function fechaISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
  const [nRecursos, discosResumen, proyectosResumen, usoMontajes] = await Promise.all([
    db.libraryAsset.count(),
    db.storageDisk.findMany({
      where: { status: "ACTIVO" },
      select: { id: true, kind: true, status: true, capacityGB: true, usedGB: true, mountKey: true, lastCheckAt: true, createdAt: true },
    }),
    db.project.findMany({
      where: { archivedAt: null },
      select: {
        materialLocations: {
          select: { role: true, diskId: true, expiresAt: true, disk: { select: { kind: true, offsite: true, status: true } } },
        },
      },
    }),
    usoDeMontajes(),
  ]);

  // Espacio: solo cuenta lo que se puede medir (ver resumenEspacio). Un disco con capacidad
  // pero sin ocupación anotada NO se cuenta como vacío — se dice aparte cuántos faltan.
  const espacio = resumenEspacio(discosResumen.map((d) => medidas(d, usoMontajes)));

  const porVerificar = discosResumen.filter((d) =>
    diskNeedsCheck({
      kind: d.kind,
      status: d.status,
      lastCheckDays: daysSince(d.lastCheckAt, now),
      ageDays: daysSince(d.createdAt, now),
    }),
  ).length;

  // Dos preguntas distintas sobre el mismo material: «¿está respaldado?» y «¿hasta cuándo hay
  // que guardarlo?». Se cuentan en una sola pasada, y aparte los proyectos que piden atención
  // por CUALQUIERA de las dos — sin sumar los dos números, que contaría doble a quien falla en
  // ambas. Todo sobre los MISMOS proyectos que pinta el mapa (sin archivar), o el chip diría
  // un número que la tabla de abajo no puede enseñar.
  let nRiesgo = 0;
  let nPorVencer = 0;
  let nAtencionMapa = 0;
  for (const p of proyectosResumen) {
    const nivel = materialHealth(
      p.materialLocations.map((l) => ({
        role: l.role,
        diskId: l.diskId,
        diskKind: l.disk.kind,
        offsite: l.disk.offsite,
        diskRetired: l.disk.status === "RETIRADO",
      })),
    ).level;
    const enRiesgo = nivel === "SIN_RESPALDO" || nivel === "SIN_REGISTRO";
    const vence = p.materialLocations.some((l) => {
      const e = expiryTone(l.expiresAt, now).level;
      return e === "VENCIDO" || e === "PRONTO";
    });
    if (enRiesgo) nRiesgo++;
    if (vence) nPorVencer++;
    if (enRiesgo || vence) nAtencionMapa++;
  }

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
      v: espacio.pct != null ? tb(espacio.libreGB) : "—",
      pie:
        espacio.pct != null
          ? `${espacio.pct} % ocupado${espacio.sinMedir ? ` · ${espacio.sinMedir} sin medir` : ""}`
          : espacio.sinMedir
            ? `${espacio.sinMedir} ${espacio.sinMedir === 1 ? "disco" : "discos"} sin capacidad ni uso anotados`
            : "sin capacidades anotadas",
      tono: espacio.pct != null && espacio.pct >= DISK_FULL_PCT ? "warn" : "ink",
      href: "/biblioteca?tab=discos",
    },
    {
      k: "Material en riesgo",
      v: String(nRiesgo),
      pie: nPorVencer
        ? `${nRiesgo ? "sin respaldo · " : ""}${nPorVencer} por vencer`
        : nRiesgo
          ? "sin respaldo o sin registrar"
          : "todo con respaldo",
      tono: nRiesgo ? "bad" : nPorVencer ? "warn" : "good",
      href: nRiesgo ? "/biblioteca?tab=mapa&riesgo=1" : "/biblioteca?tab=mapa",
    },
  ];

  const conteos: Record<TabKey, number> = {
    recursos: nRecursos,
    discos: discosResumen.length,
    mapa: proyectosResumen.length,
  };
  const avisos: Record<TabKey, number> = { recursos: 0, discos: porVerificar, mapa: nAtencionMapa };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        icon={<IconBiblioteca />}
        title="Biblioteca"
        description="Recursos del estudio, discos y el mapa del material: dónde vive y hasta cuándo."
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
      {tab === "discos" ? <DiscosTab canManage={canManage} now={now} highlightId={disco ?? null} usoMontajes={usoMontajes} /> : null}
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

async function DiscosTab({ canManage, now, highlightId = null, usoMontajes }: {
  canManage: boolean;
  now: Date;
  highlightId?: string | null;
  // Ocupación EN VIVO de cada montaje (statfs), ya leída para el resumen: pinta sola la barra
  // del disco que ES ese montaje. null si no está montado (el Mac de desarrollo o un deploy
  // sin bind): se usa el valor anotado a mano. Se recibe en vez de volver a leerla para que la
  // fila del disco y el «Espacio libre» de arriba no puedan discrepar.
  usoMontajes: Record<MountKey, { usedGB: number; totalGB: number } | null>;
}) {
  const disks = await db.storageDisk.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: { locations: { select: { projectId: true } } },
  });

  const rows: DiskRow[] = disks.map((d) => {
    const m = medidas(d, usoMontajes);
    const lastCheckDays = daysSince(d.lastCheckAt, now);
    return {
      id: d.id,
      name: d.name,
      kind: d.kind,
      color: d.color,
      capacityGB: m.capacityGB,
      usedGB: m.usedGB,
      liveNas: m.live,
      mountKey: d.mountKey,
      location: d.location,
      offsite: d.offsite,
      status: d.status,
      notes: d.notes,
      lastCheckDays,
      needsCheck: diskNeedsCheck({ kind: d.kind, status: d.status, lastCheckDays, ageDays: daysSince(d.createdAt, now) }),
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
          include: { disk: { select: { id: true, name: true, color: true, kind: true, offsite: true, status: true } } },
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
      locations: p.materialLocations.map((l) => {
        const exp = expiryTone(l.expiresAt, now);
        return {
          id: l.id,
          role: l.role,
          path: l.path,
          notes: l.notes,
          diskId: l.diskId,
          diskName: l.disk.name,
          diskColor: l.disk.color,
          verifiedDays: daysSince(l.verifiedAt, now),
          // "YYYY-MM-DD" en hora LOCAL (no toISOString, que desplaza el día en zonas al
          // oeste de Greenwich y haría que el <input type=date> mostrara la víspera).
          expiresOn: l.expiresAt ? fechaISO(l.expiresAt) : null,
          expiresDays: exp.days,
          expiresLabel: exp.label,
          expiresLevel: exp.level,
        };
      }),
      health: materialHealth(
        p.materialLocations.map((l) => ({
          role: l.role,
          diskId: l.diskId,
          diskKind: l.disk.kind,
          offsite: l.disk.offsite,
          // Un disco retirado ya no es una copia viva: no debe dar el «3-2-1 ✓».
          diskRetired: l.disk.status === "RETIRADO",
        })),
      ),
    }))
    .sort((a, b) => (HEALTH_ORDER[a.health.level] ?? 9) - (HEALTH_ORDER[b.health.level] ?? 9) || a.name.localeCompare(b.name, "es"));

  return <Mapa projects={rows} disks={disks} canManage={canManage} initialRiesgo={soloRiesgo} />;
}
