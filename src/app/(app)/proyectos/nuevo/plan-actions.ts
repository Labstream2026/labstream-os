"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { resolveTemplate } from "@/lib/provisioning";
import { programarPlantilla } from "@/lib/plantillas/calendario";
import { capacidadSemana, claveDia, festivosDeVentana, lunesDe, repartirCarga, semanasDesde } from "@/lib/carga/semanal";
import { todayInputValue } from "@/lib/today";

// ── Previsualizar el plan de una plantilla ANTES de crear ───────────────────
// Con la fecha de entrega (y la de rodaje si la plantilla la usa) se calcula el cronograma
// completo hacia atrás, y para cada tarea con ROL se sugiere a la persona de ese rol que
// esté MÁS LIBRE la semana en que cae — reusando el mismo motor de carga del Inicio, para
// que «libre» signifique aquí lo mismo que allá. Los choques se dicen antes de crear, no
// después de que reventaron: rodaje encima de otra cita, editora que quedaría pasada, plazo
// que no alcanza.

export type FilaPlan = {
  title: string;
  role: string | null;
  inicio: string | null; // YYYY-MM-DD
  fin: string | null;
  estimatedMinutes: number | null;
  sugeridoId: string | null;
  sugeridoNombre: string | null;
  /** Advertencia de ESTA fila («Camilo ya tiene un rodaje ese día»), null si no hay. */
  choque: string | null;
};

export type PlanPreview = {
  ok: boolean;
  error?: string;
  necesitaRodaje: boolean;
  avisos: string[];
  filas: FilaPlan[];
  entregables: { name: string; fecha: string }[];
  equipo: { id: string; nombre: string; roleKey: string | null }[];
};

const VACIO: PlanPreview = { ok: false, necesitaRodaje: false, avisos: [], filas: [], entregables: [], equipo: [] };

export async function previsualizarPlan(
  templateKey: string,
  entrega: string,
  rodaje: string | null,
): Promise<PlanPreview> {
  const session = await getSession();
  if (!session || session.role === "cliente" || session.role === "demo") return { ...VACIO, error: "Sin permiso." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrega)) return { ...VACIO, error: "Falta la fecha de entrega." };
  if (rodaje && !/^\d{4}-\d{2}-\d{2}$/.test(rodaje)) return { ...VACIO, error: "La fecha de rodaje no es válida." };

  const tpl = await resolveTemplate(db, templateKey);
  if (!tpl) return { ...VACIO, error: "Esa plantilla no existe." };
  const tareasTpl = tpl.content.tasks ?? [];
  const necesitaRodaje = tareasTpl.some((t) => t.ancla === "rodaje");

  const hoy = todayInputValue();
  const plan = programarPlantilla(tareasTpl, { entrega, rodaje, hoy });

  // ── Disponibilidad real para sugerir gente ──
  // La ventana de semanas cubre del hoy al fin del plan (con techo de cordura): el mismo
  // motor del Inicio reparte lo YA asignado, y la capacidad descuenta festivos y citas.
  const finMax = plan.tareas.reduce((m, t) => (t.fin && t.fin > m ? t.fin : m), hoy);
  const nSemanas = Math.min(12, Math.max(1, Math.round((new Date(`${finMax}T12:00:00Z`).getTime() - new Date(`${hoy}T12:00:00Z`).getTime()) / (7 * 86_400_000)) + 2));
  const semanas = semanasDesde(new Date(), nSemanas);
  const festivos = festivosDeVentana(semanas);
  const finVentana = new Date(`${semanas[semanas.length - 1]}T00:00:00.000Z`);
  finVentana.setUTCDate(finVentana.getUTCDate() + 7);

  const [usuarios, tareasAbiertas, eventosDb] = await Promise.all([
    db.user.findMany({
      where: { active: true, isSystemBot: false, isGuest: false, role: { isNot: { key: "cliente" } } },
      select: { id: true, name: true, weeklyCapacityHours: true, role: { select: { key: true } } },
      orderBy: { name: "asc" },
    }),
    db.task.findMany({
      where: { completedAt: null, assigneeId: { not: null }, estimatedMinutes: { not: null }, OR: [{ projectId: null }, { project: { archivedAt: null, finishedAt: null } }] },
      select: { assigneeId: true, projectId: true, estimatedMinutes: true, startDate: true, dueDate: true },
    }),
    db.calendarEvent.findMany({
      where: { start: { gte: new Date(`${semanas[0]}T00:00:00.000Z`), lt: finVentana } },
      select: { start: true, end: true, allDay: true, title: true, attendees: { select: { userId: true, status: true } } },
    }),
  ]);
  const eventos = eventosDb.flatMap((e) =>
    e.attendees.filter((a) => a.status !== "DECLINED").map((a) => ({ userId: a.userId, start: e.start, end: e.end, allDay: e.allDay })),
  );
  const carga = repartirCarga(
    tareasAbiertas.map((t) => ({ assigneeId: t.assigneeId!, projectId: t.projectId, estimatedMinutes: t.estimatedMinutes!, startDate: t.startDate, dueDate: t.dueDate })),
    semanas,
    festivos,
  );
  // Días con cita/rodaje por persona, para el choque duro de «ese mismo día».
  const diasOcupados = new Map<string, Set<string>>();
  for (const e of eventos) {
    const set = diasOcupados.get(e.userId) ?? new Set<string>();
    set.add(claveDia(e.start));
    diasOcupados.set(e.userId, set);
  }

  const setSemanas = new Set(semanas);
  // Lo que este MISMO plan le va sumando a cada persona por semana: sugerir a la más libre
  // pieza por pieza sin esto acumularía todo el proyecto en la misma persona «libre».
  const sumadoPorPlan = new Map<string, Map<string, number>>();

  const filas: FilaPlan[] = plan.tareas.map((t) => {
    if (!t.role || !t.fin) {
      return { title: t.title, role: t.role, inicio: t.inicio, fin: t.fin, estimatedMinutes: t.estimatedMinutes, sugeridoId: null, sugeridoNombre: null, choque: null };
    }
    const candidatos = usuarios.filter((u) => u.role?.key === t.role);
    if (!candidatos.length) {
      return { title: t.title, role: t.role, inicio: t.inicio, fin: t.fin, estimatedMinutes: t.estimatedMinutes, sugeridoId: null, sugeridoNombre: null, choque: `No hay nadie con el rol «${t.role}».` };
    }
    const lunes = lunesDe(t.fin);
    const enVentana = setSemanas.has(lunes);
    let mejor: { u: (typeof candidatos)[number]; ocupadoMin: number; capMin: number } | null = null;
    for (const u of candidatos) {
      const base = enVentana ? (carga.get(u.id)?.get(lunes)?.totalMin ?? 0) : 0;
      const propio = sumadoPorPlan.get(u.id)?.get(lunes) ?? 0;
      const cap = enVentana ? capacidadSemana(u.weeklyCapacityHours || 40, lunes, festivos, eventos, u.id).capacidadMin : (u.weeklyCapacityHours || 40) * 60;
      const ocupadoMin = base + propio;
      if (!mejor || ocupadoMin / Math.max(cap, 1) < mejor.ocupadoMin / Math.max(mejor.capMin, 1)) mejor = { u, ocupadoMin, capMin: cap };
    }
    const s = mejor!;
    // Lo que esta tarea pesa se anota para las siguientes sugerencias del mismo plan.
    if (t.estimatedMinutes) {
      const porSemana = sumadoPorPlan.get(s.u.id) ?? new Map<string, number>();
      porSemana.set(lunes, (porSemana.get(lunes) ?? 0) + t.estimatedMinutes);
      sumadoPorPlan.set(s.u.id, porSemana);
    }
    let choque: string | null = null;
    const quedariaMin = s.ocupadoMin + (t.estimatedMinutes ?? 0);
    if (diasOcupados.get(s.u.id)?.has(t.fin) && t.role === "camarografo") {
      choque = `${s.u.name.split(" ")[0]} ya tiene un rodaje o cita ese mismo día.`;
    } else if (quedariaMin > s.capMin && s.capMin > 0) {
      choque = `${s.u.name.split(" ")[0]} quedaría en ${Math.round(quedariaMin / 60)} h de ${Math.round(s.capMin / 60)} esa semana.`;
    }
    return { title: t.title, role: t.role, inicio: t.inicio, fin: t.fin, estimatedMinutes: t.estimatedMinutes, sugeridoId: s.u.id, sugeridoNombre: s.u.name, choque };
  });

  const { sumarHabiles } = await import("@/lib/plantillas/calendario");
  const entregables = (tpl.content.deliverables ?? []).map((d) => ({
    name: d.name,
    fecha: sumarHabiles(entrega, d.offsetDias ?? 0, festivos),
  }));

  return {
    ok: true,
    necesitaRodaje,
    avisos: plan.avisos,
    filas,
    entregables,
    equipo: usuarios.map((u) => ({ id: u.id, nombre: u.name, roleKey: u.role?.key ?? null })),
  };
}
