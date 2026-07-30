import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight, Cloud, HardDrive, MapPin, QrCode, Server, Unplug } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import {
  daysSince,
  diskNeedsCheck,
  expiryTone,
  materialHealth,
  DISK_FULL_PCT,
  DISK_KIND_LABEL,
  ROLE_LABEL,
} from "@/lib/material-health";
import { isMountKey, MOUNT_LABEL, MOUNT_DESC, mountHref } from "@/lib/disco-raiz";
import { listarNivelMontaje, mountDir, mountReady, mountUsage } from "@/lib/disco-raiz-server";
import { formatBogotaDate } from "@/lib/bogota-time";
import { cn } from "@/lib/utils";
import { ExploradorDisco } from "./explorador-disco";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const disk = await db.storageDisk.findUnique({ where: { id }, select: { name: true } });
  return { title: disk ? `${disk.name} · Discos` : "Disco" };
}

function tb(gb: number | null): string {
  if (gb == null) return "—";
  return `${(gb / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} TB`;
}

export default async function DiscoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!hasPermission(session, "ver_biblioteca")) redirect("/");
  const canManage = hasPermission(session, "gestionar_biblioteca");

  const { id } = await params;
  const disk = await db.storageDisk.findUnique({
    where: { id },
    include: {
      locations: {
        orderBy: [{ project: { name: "asc" } }, { role: "asc" }],
        include: { project: { select: { id: true, name: true, finishedAt: true, client: { select: { name: true } } } } },
      },
    },
  });
  if (!disk) notFound();

  const now = new Date();
  const montaje = isMountKey(disk.mountKey) ? disk.mountKey : null;
  // Un montaje puede estar configurado pero caído (NAS apagado, bind mount mal puesto): se
  // pregunta al disco antes de prometer que se puede navegar.
  const [montado, uso] = montaje ? await Promise.all([mountReady(montaje), mountUsage(montaje)]) : [false, null];
  // La raíz del disco se lee AQUÍ, en el servidor: la ficha llega con las carpetas puestas.
  // Si el montaje falla justo ahora, la ficha sigue sirviendo (se cae solo el explorador).
  const nivelRaiz = montaje && montado ? await listarNivelMontaje(montaje, "").catch(() => null) : null;

  const capacityGB = uso?.totalGB ?? disk.capacityGB;
  const usedGB = uso?.usedGB ?? disk.usedGB;
  const pct = capacityGB && usedGB != null ? Math.min(100, Math.round((usedGB / capacityGB) * 100)) : null;
  const lastCheckDays = daysSince(disk.lastCheckAt, now);
  const pideCheck = diskNeedsCheck({
    kind: disk.kind,
    status: disk.status,
    lastCheckDays,
    ageDays: daysSince(disk.createdAt, now),
  });

  // El catálogo: lo que el equipo registró que vive en este disco, agrupado por proyecto.
  // Es la misma información del mapa del material, leída por DISCO en vez de por proyecto.
  const porProyecto = new Map<string, { id: string; name: string; client: string | null; finished: boolean; filas: typeof disk.locations }>();
  for (const l of disk.locations) {
    const p = porProyecto.get(l.projectId);
    if (p) p.filas.push(l);
    else porProyecto.set(l.projectId, {
      id: l.projectId,
      name: l.project.name,
      client: l.project.client?.name ?? null,
      finished: Boolean(l.project.finishedAt),
      filas: [l],
    });
  }
  const proyectos = [...porProyecto.values()];

  // La salud 3-2-1 de cada proyecto NO se puede calcular con lo de este disco solo: hace falta
  // dónde más vive ese material. Se traen todas las ubicaciones de esos proyectos.
  const salud = new Map<string, ReturnType<typeof materialHealth>>();
  if (proyectos.length > 0) {
    const todas = await db.materialLocation.findMany({
      where: { projectId: { in: proyectos.map((p) => p.id) } },
      select: { projectId: true, role: true, diskId: true, disk: { select: { kind: true, offsite: true, status: true } } },
    });
    const agrupadas = new Map<string, { role: string; diskId: string; diskKind: string; offsite: boolean; diskRetired: boolean }[]>();
    for (const l of todas) {
      const arr = agrupadas.get(l.projectId) ?? [];
      arr.push({ role: l.role, diskId: l.diskId, diskKind: l.disk.kind, offsite: l.disk.offsite, diskRetired: l.disk.status === "RETIRADO" });
      agrupadas.set(l.projectId, arr);
    }
    for (const [pid, locs] of agrupadas) salud.set(pid, materialHealth(locs));
  }

  const retirado = disk.status === "RETIRADO";
  const saludCls: Record<string, string> = {
    OK: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    PARCIAL: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    SIN_RESPALDO: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    SIN_REGISTRO: "bg-muted text-muted-foreground",
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      {/* Migas */}
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/biblioteca" className="rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground">Biblioteca</Link>
        <ChevronRight className="size-3.5" />
        <Link href="/biblioteca?tab=discos" className="rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground">Discos</Link>
        <ChevronRight className="size-3.5" />
        <span className="px-1.5 py-0.5 font-medium text-foreground">{disk.name}</span>
      </nav>

      {/* Cabecera del disco */}
      <div className={cn("mt-4 rounded-xl border border-border bg-card", retirado && "opacity-75")}>
        <div className="flex flex-wrap items-start gap-4 p-4">
          <span className="h-11 w-3 shrink-0 rounded" style={{ background: disk.color ?? "#94a3b8" }} />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {disk.name}
              <span className="rounded border border-border bg-background px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                {DISK_KIND_LABEL[disk.kind] ?? disk.kind}
              </span>
              {montaje ? (
                montado ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                    <Server className="size-3" /> montado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    <Unplug className="size-3" /> no responde
                  </span>
                )
              ) : null}
              {retirado ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">retirado</span> : null}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {disk.location ? <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {disk.location}</span> : null}
              {disk.offsite ? <span>fuera del estudio</span> : null}
              {disk.kind === "NUBE" ? <span className="inline-flex items-center gap-1"><Cloud className="size-3" /> nube</span> : null}
              <span className={cn(pideCheck && "font-semibold text-amber-600 dark:text-amber-400")}>
                {lastCheckDays == null
                  ? "Nunca verificado"
                  : lastCheckDays === 0
                    ? "Verificado hoy"
                    : `Verificado hace ${lastCheckDays < 60 ? `${lastCheckDays} días` : `${Math.floor(lastCheckDays / 30)} meses`}`}
              </span>
            </p>
            {disk.notes ? <p className="mt-1.5 text-xs text-muted-foreground">{disk.notes}</p> : null}
          </div>

          <div className="min-w-44">
            {pct != null ? (
              <>
                <div className="mb-1 flex justify-between gap-3 text-xs">
                  <span className="text-muted-foreground"><b className="font-semibold text-foreground">{tb(usedGB)}</b> / {tb(capacityGB)}</span>
                  <span className={pct >= DISK_FULL_PCT ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>{pct} %</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-accent">
                  <div className={cn("h-full rounded-full", pct >= 95 ? "bg-red-500" : pct >= DISK_FULL_PCT ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} />
                </div>
                {uso ? <p className="mt-1 text-[10px] text-muted-foreground">leído del disco en vivo</p> : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{capacityGB ? `${tb(capacityGB)} · sin uso anotado` : "capacidad sin anotar"}</p>
            )}
          </div>

          <Link
            href={`/biblioteca/discos/${disk.id}/etiqueta`}
            target="_blank"
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Etiqueta QR imprimible"
          >
            <QrCode className="size-4" />
          </Link>
        </div>

        {/* La RAÍZ: qué es este disco para la app */}
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 border-t border-border px-4 py-2 text-xs",
            montaje && montado ? "bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-200" : "bg-muted/40 text-muted-foreground",
          )}
        >
          <HardDrive className="size-3.5 shrink-0" />
          {montaje ? (
            <>
              <span>
                Raíz: <b className="font-semibold">{MOUNT_LABEL[montaje]}</b>
                <span className="ml-1 opacity-70">{mountDir(montaje) || "sin configurar en este despliegue"}</span>
              </span>
              {montado ? (
                <Link href={mountHref(montaje)} className="ml-auto font-medium hover:underline">Abrir para trabajar →</Link>
              ) : (
                <span className="ml-auto">{MOUNT_DESC[montaje]}</span>
              )}
            </>
          ) : (
            <span>
              Este disco no está montado en la app: no se pueden listar sus archivos. Abajo está lo que el equipo registró que guarda.
              {canManage ? <span className="ml-1 opacity-80">Si es una carpeta que la app tiene montada, dísele cuál al editarlo.</span> : null}
            </span>
          )}
        </div>
      </div>

      {/* Contenido: carpetas reales si está montado */}
      {montaje && montado && nivelRaiz ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Carpetas del disco</h2>
          <ExploradorDisco
            diskId={disk.id}
            raizNombre={MOUNT_LABEL[montaje]}
            hrefBase={montaje === "OPS" ? "/operaciones?path=" : "/galeria?rel="}
            inicial={nivelRaiz}
          />
        </section>
      ) : null}

      {/* Catálogo del material registrado */}
      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Material registrado</h2>
          <span className="text-xs text-muted-foreground">
            {proyectos.length === 0
              ? "nada registrado todavía"
              : `${proyectos.length} ${proyectos.length === 1 ? "proyecto" : "proyectos"} · ${disk.locations.length} ${disk.locations.length === 1 ? "ubicación" : "ubicaciones"}`}
          </span>
          <Link href="/biblioteca?tab=mapa" className="ml-auto text-xs font-medium text-primary hover:underline">
            Registrar material en el mapa →
          </Link>
        </div>

        {proyectos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nadie ha registrado material en este disco. Se hace desde el mapa del material, anotando en qué disco vive
            cada parte de un proyecto.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {proyectos.map((p) => {
                const h = salud.get(p.id);
                return (
                  <li key={p.id} className="px-4 py-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Link href={`/proyectos/${p.id}`} className="text-sm font-semibold hover:text-primary">{p.name}</Link>
                      {p.client ? <span className="text-xs text-muted-foreground">· {p.client}</span> : null}
                      {p.finished ? <span className="rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">terminado</span> : null}
                      {h ? (
                        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold", saludCls[h.level])} title={`${h.copies} copias · ${h.media} soportes · ${h.offsite} fuera`}>
                          {h.label}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.filas.map((l) => {
                        const exp = expiryTone(l.expiresAt, now);
                        const vDias = daysSince(l.verifiedAt, now);
                        return (
                          <span key={l.id} className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                              {ROLE_LABEL[l.role] ?? l.role}
                            </span>
                            {l.path ? <span className="truncate font-mono text-[11px] text-muted-foreground">{l.path}</span> : null}
                            <span className={cn("text-[11px]", vDias == null || vDias >= 180 ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                              {vDias == null ? "sin confirmar" : vDias === 0 ? "confirmado hoy" : `confirmado hace ${vDias < 60 ? `${vDias} días` : `${Math.floor(vDias / 30)} meses`}`}
                            </span>
                            {l.expiresAt ? (
                              <span
                                className={cn(
                                  "text-[11px]",
                                  exp.level === "VENCIDO" || exp.level === "PRONTO" ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                                )}
                                title={formatBogotaDate(l.expiresAt) ?? undefined}
                              >
                                {exp.label}
                              </span>
                            ) : null}
                          </span>
                        );
                      })}
                    </div>
                    {p.filas.some((l) => l.notes) ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {p.filas.filter((l) => l.notes).map((l) => l.notes).join(" · ")}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
              Las rutas son lo que alguien escribió a mano: la app no puede comprobarlas mientras el disco no esté
              montado. «Confirmado» es la última vez que alguien dijo que el material sigue ahí.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
