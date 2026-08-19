import { db } from "@/lib/db";
import { getTaskLabels } from "@/lib/workflow-labels";
import { inAliveProjectWhere } from "@/lib/project-access";
import { APPS_EDICION, proyectoEdicionDe } from "@/lib/rastreo/edicion";
import { repartirCierre, type Sugerencia, type TareaCierre } from "./reparto";

// ── Los datos de «Cerrar el día» ─────────────────────────────────────────────
// Todo es del PROPIO usuario y de HOY (día de Bogotá): lo que midió su sensor, lo que ya
// anotó (cronómetro o a mano) y sus tareas candidatas. No pide ningún permiso — ver los
// números de uno mismo es autoservicio, igual que el cronómetro.

export type FilaEvidencia = { label: string; seg: number; texto: string };

export type TareaDelDia = {
  id: string;
  titulo: string;
  emoji: string | null;
  proyecto: string | null;
  cliente: string | null;
  completadaHoy: boolean;
  venceHoy: boolean;
  /** Minutos ya anotados HOY en esta tarea (cronómetro o manual). */
  yaMin: number;
  /** Sugerencia del reparto (0 = sin sugerencia). */
  sugeridoMin: number;
  motivo: string | null;
};

export type DatosCierre = {
  fechaTxt: string; // «martes 19 de agosto»
  /** El sensor midió algo hoy (hay equipo vinculado reportando). */
  conSensor: boolean;
  sensorSeg: number;
  sensorTxt: string;
  pctActivo: number | null;
  anotadoMin: number;
  anotadoTxt: string;
  /** Lo medido que aún no está en el parte de horas (nunca negativo). */
  restanteMin: number;
  restanteTxt: string;
  cuentas: FilaEvidencia[];
  edicion: FilaEvidencia[];
  apps: FilaEvidencia[];
  tareas: TareaDelDia[];
  /** Ya hay anotaciones de un cierre anterior hoy (se puede volver a cerrar: solo suma). */
  yaCerrado: boolean;
};

const horas1 = (seg: number) => `${(seg / 3600).toFixed(1).replace(".", ",")} h`;
export const minutosTxt = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
};

// Día de HOY en Bogotá: su ventana en UTC (Bogotá es UTC-5 fijo, sin horario de verano) y
// su ancla de mediodía para spentOn — la misma que usan el cronómetro y logTime.
export function ventanaHoyBogota(ahora = new Date()): { ymd: string; desde: Date; hasta: Date; noon: Date } {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(ahora);
  const desde = new Date(`${ymd}T05:00:00.000Z`);
  return { ymd, desde, hasta: new Date(desde.getTime() + 24 * 3600 * 1000), noon: new Date(`${ymd}T12:00:00.000Z`) };
}

export async function datosCierre(userId: string, ahora = new Date()): Promise<DatosCierre> {
  const { desde, hasta, noon } = ventanaHoyBogota(ahora);
  const { statuses } = await getTaskLabels();
  const openKeys = statuses.filter((s) => !s.isDone).map((s) => s.key);
  const doneKeys = statuses.filter((s) => s.isDone).map((s) => s.key);

  const [bloques, porCuenta, bloquesEdicion, porApp, anotadasHoy, abiertas, completadasHoy, clientes] = await Promise.all([
    db.workBlock.aggregate({
      where: { userId, startedAt: { gte: desde, lt: hasta } },
      _sum: { seconds: true, activeSecs: true },
    }),
    db.workBlock.groupBy({
      by: ["clientId"],
      where: { userId, startedAt: { gte: desde, lt: hasta } },
      _sum: { seconds: true },
    }),
    db.workBlock.findMany({
      where: {
        userId,
        startedAt: { gte: desde, lt: hasta },
        OR: APPS_EDICION.map((n) => ({ app: { contains: n, mode: "insensitive" as const } })),
      },
      select: { app: true, title: true, seconds: true },
      orderBy: { startedAt: "desc" },
      take: 5000,
    }),
    db.workBlock.groupBy({
      by: ["app"],
      where: { userId, startedAt: { gte: desde, lt: hasta } },
      _sum: { seconds: true },
    }),
    // Lo YA anotado hoy (cronómetro, manual o un cierre anterior): la resta del restante.
    db.timeEntry.findMany({
      where: { userId, spentOn: noon },
      select: { taskId: true, minutes: true, note: true },
    }),
    // Candidatas: mis tareas ABIERTAS en proyectos vivos (mismo filtro que Mis tareas)…
    db.task.findMany({
      where: {
        status: { in: openKeys },
        OR: [{ assigneeId: userId }, { ownerId: userId }],
        AND: [inAliveProjectWhere],
      },
      select: {
        id: true, title: true, dueDate: true,
        project: { select: { name: true, emoji: true, clientId: true, client: { select: { name: true } } } },
      },
      orderBy: [{ dueDate: "asc" }],
      take: 40,
    }),
    // …más las que COMPLETÉ hoy: el día se cierra después de terminar cosas, y justo esas
    // son las que más merecen sus horas.
    db.task.findMany({
      where: {
        status: { in: doneKeys },
        OR: [{ assigneeId: userId }, { ownerId: userId }],
        completedAt: { gte: desde, lt: hasta },
      },
      select: {
        id: true, title: true, dueDate: true,
        project: { select: { name: true, emoji: true, clientId: true, client: { select: { name: true } } } },
      },
      orderBy: [{ completedAt: "desc" }],
      take: 20,
    }),
    db.client.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
  ]);

  const nombreCliente = new Map(clientes.map((c) => [c.id, c.name]));
  const sensorSeg = bloques._sum.seconds ?? 0;
  const activo = bloques._sum.activeSecs ?? 0;
  const anotadoMin = anotadasHoy.reduce((s, e) => s + e.minutes, 0);
  const restanteMin = Math.max(0, Math.round(sensorSeg / 60) - anotadoMin);

  // Evidencia: cuentas, proyectos de edición y apps del día (top corto, es un recordatorio).
  const cuentas: FilaEvidencia[] = porCuenta
    .map((r) => ({
      label: r.clientId ? nombreCliente.get(r.clientId) ?? "Otra cuenta" : "Sin atribuir",
      seg: r._sum.seconds ?? 0,
      texto: horas1(r._sum.seconds ?? 0),
    }))
    .filter((f) => f.seg > 0)
    .sort((a, b) => b.seg - a.seg)
    .slice(0, 6);

  const edicionM = new Map<string, { label: string; seg: number }>();
  for (const b of bloquesEdicion) {
    const p = proyectoEdicionDe(b.app, b.title);
    if (!p) continue;
    const clave = p.proyecto.toLowerCase();
    const e = edicionM.get(clave) ?? { label: p.proyecto, seg: 0 };
    e.seg += b.seconds;
    edicionM.set(clave, e);
  }
  const edicion: FilaEvidencia[] = [...edicionM.values()]
    .map((e) => ({ label: e.label, seg: e.seg, texto: horas1(e.seg) }))
    .sort((a, b) => b.seg - a.seg)
    .slice(0, 6);

  const apps: FilaEvidencia[] = porApp
    .map((r) => ({ label: r.app, seg: r._sum.seconds ?? 0, texto: horas1(r._sum.seconds ?? 0) }))
    .sort((a, b) => b.seg - a.seg)
    .slice(0, 5);

  // Tareas del día: completadas hoy primero (son las protagonistas del cierre), luego las
  // abiertas por entrega. Sin duplicados (una tarea completada hoy no reaparece abierta).
  const vistos = new Set<string>();
  const candidatas: (typeof abiertas[number] & { completadaHoy: boolean })[] = [];
  for (const t of completadasHoy) {
    vistos.add(t.id);
    candidatas.push({ ...t, completadaHoy: true });
  }
  for (const t of abiertas) {
    if (vistos.has(t.id)) continue;
    candidatas.push({ ...t, completadaHoy: false });
  }

  const paraReparto: TareaCierre[] = candidatas.map((t) => ({
    id: t.id,
    clientId: t.project?.clientId ?? null,
    proyectoNombre: t.project?.name ?? null,
    completadaHoy: t.completadaHoy,
    venceMs: t.dueDate ? t.dueDate.getTime() : null,
  }));

  const sugerencias: Sugerencia[] = repartirCierre({
    restanteMin,
    cuentas: porCuenta.map((r) => ({ clientId: r.clientId, seg: r._sum.seconds ?? 0 })),
    edicion: [...edicionM.values()].map((e) => ({ proyecto: e.label, seg: e.seg })),
    tareas: paraReparto,
    nombreCliente,
  });
  const sugeridaDe = new Map(sugerencias.map((s) => [s.taskId, s]));

  const yaMinDe = new Map<string, number>();
  for (const e of anotadasHoy) yaMinDe.set(e.taskId, (yaMinDe.get(e.taskId) ?? 0) + e.minutes);

  const hoyMs = noon.getTime();
  const tareas: TareaDelDia[] = candidatas.map((t) => ({
    id: t.id,
    titulo: t.title,
    emoji: t.project?.emoji ?? null,
    proyecto: t.project?.name ?? null,
    cliente: t.project?.client?.name ?? null,
    completadaHoy: t.completadaHoy,
    venceHoy: t.dueDate ? Math.abs(t.dueDate.getTime() - hoyMs) < 12 * 3600 * 1000 : false,
    yaMin: yaMinDe.get(t.id) ?? 0,
    sugeridoMin: sugeridaDe.get(t.id)?.minutos ?? 0,
    motivo: sugeridaDe.get(t.id)?.motivo ?? null,
  }));

  const fechaTxt = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" }).format(ahora);

  return {
    fechaTxt,
    conSensor: sensorSeg > 0,
    sensorSeg,
    sensorTxt: horas1(sensorSeg),
    pctActivo: sensorSeg > 0 ? Math.round((activo / sensorSeg) * 100) : null,
    anotadoMin,
    anotadoTxt: minutosTxt(anotadoMin),
    restanteMin,
    restanteTxt: minutosTxt(restanteMin),
    cuentas,
    edicion,
    apps,
    tareas,
    yaCerrado: anotadasHoy.some((e) => e.note === "Cierre del día"),
  };
}
