import { db } from "@/lib/db";
import { bogotaDayStart, duePhrase, daysSince } from "./time";

// "Lo que un productor persigue": entregables por pre-aprobar, clientes sin responder,
// material que no se ha subido y vence, propuestas/cotizaciones por cerrar y facturas
// por cobrar. Todo se acota a lo que ES TUYO (reviewerId/ownerId/createdById), así que
// cada quien solo ve lo que le toca empujar.

export type ChaseItem = { id: string; title: string; detail: string };
export type UserChases = {
  reviewsPending: ChaseItem[]; // entregables que esperan tu pre-aprobación interna
  clientWaiting: ChaseItem[]; // enviados al cliente sin respuesta → haz seguimiento
  noMaterial: ChaseItem[]; // entregable que vence pronto y aún sin material
  proposals: ChaseItem[]; // propuestas/cotizaciones enviadas por cerrar o por vencer
  invoices: ChaseItem[]; // facturas por cobrar
};

export function chaseCount(c: UserChases): number {
  return c.reviewsPending.length + c.clientWaiting.length + c.noMaterial.length + c.proposals.length + c.invoices.length;
}

export function chaseIds(c: UserChases): string[] {
  return [...c.reviewsPending, ...c.clientWaiting, ...c.noMaterial, ...c.proposals, ...c.invoices].map((i) => i.id).sort();
}

const DAY = 24 * 60 * 60 * 1000;
const FOLLOWUP_STALE_DAYS = 3; // sin movimiento → toca hacer seguimiento
const SOON_DAYS = 3; // por vencer

export async function getUserChases(userId: string, now: Date = new Date()): Promise<UserChases> {
  const todayStart = bogotaDayStart(now);
  const soon = new Date(todayStart.getTime() + 5 * DAY); // entregables sin material: 5 días
  const expSoon = new Date(todayStart.getTime() + SOON_DAYS * DAY);
  const staleCut = new Date(now.getTime() - FOLLOWUP_STALE_DAYS * DAY);

  const [reviews, clientSent, noMaterial, proposals, quotes, invoices] = await Promise.all([
    db.deliverable.findMany({
      where: { reviewerId: userId, status: "REVISION_INTERNA" },
      orderBy: { updatedAt: "asc" },
      select: { id: true, name: true, project: { select: { name: true } } },
    }),
    db.deliverable.findMany({
      where: { status: "ENVIADO_CLIENTE", updatedAt: { lt: staleCut }, OR: [{ ownerId: userId }, { reviewerId: userId }] },
      orderBy: { updatedAt: "asc" },
      select: { id: true, name: true, updatedAt: true, project: { select: { name: true } } },
    }),
    db.deliverable.findMany({
      where: { ownerId: userId, dueDate: { gte: todayStart, lte: soon }, versions: { none: {} } },
      orderBy: { dueDate: "asc" },
      select: { id: true, name: true, dueDate: true, project: { select: { name: true } } },
    }),
    db.proposal.findMany({
      where: { createdById: userId, status: "ENVIADA", OR: [{ expiresAt: { lte: expSoon } }, { updatedAt: { lt: staleCut } }] },
      orderBy: { updatedAt: "asc" },
      select: { id: true, title: true, expiresAt: true, updatedAt: true },
    }),
    db.quote.findMany({
      where: { createdById: userId, status: "ENVIADA", OR: [{ validUntil: { lte: expSoon } }, { updatedAt: { lt: staleCut } }] },
      orderBy: { updatedAt: "asc" },
      select: { id: true, title: true, code: true, validUntil: true, updatedAt: true },
    }),
    db.invoice.findMany({
      where: { createdById: userId, OR: [{ status: "VENCIDA" }, { status: "ENVIADA", dueDate: { lt: todayStart } }] },
      orderBy: { dueDate: "asc" },
      select: { id: true, code: true, dueDate: true },
    }),
  ]);

  const proj = (p: { name: string } | null) => (p ? ` · ${p.name}` : "");

  return {
    reviewsPending: reviews.map((d) => ({ id: d.id, title: d.name, detail: `espera tu pre-aprobación${proj(d.project)}` })),
    clientWaiting: clientSent.map((d) => ({ id: d.id, title: d.name, detail: `el cliente no responde hace ${daysSince(d.updatedAt, now)} días${proj(d.project)}` })),
    noMaterial: noMaterial.map((d) => ({ id: d.id, title: d.name, detail: `${d.dueDate ? duePhrase(d.dueDate, now) : "vence pronto"} y aún sin material${proj(d.project)}` })),
    proposals: [
      ...proposals.map((p) => ({ id: p.id, title: p.title, detail: p.expiresAt ? `propuesta ${duePhrase(p.expiresAt, now)}` : `propuesta enviada hace ${daysSince(p.updatedAt, now)} días` })),
      ...quotes.map((q) => ({ id: q.id, title: q.title || q.code, detail: q.validUntil ? `cotización ${duePhrase(q.validUntil, now)}` : `cotización enviada hace ${daysSince(q.updatedAt, now)} días` })),
    ],
    invoices: invoices.map((i) => ({ id: i.id, title: i.code, detail: i.dueDate ? `factura por cobrar (${duePhrase(i.dueDate, now)})` : "factura por cobrar" })),
  };
}

// ── Escalación de equipo (para roles administrativos) ──
// Cada métrica trae también su DETALLE (mismos filtros que el contador) para que la
// tarjeta del Inicio pueda desplegar los ítems y enlazar a su destino.
export type EscItem = { id: string; title: string; project: string | null; projectId: string | null };
export type TeamEscalation = {
  staleTasks: number; // tareas abiertas sin tocar en 7+ días
  awaitingInternal: number; // entregables esperando pre-aprobación
  awaitingClient: number; // enviados al cliente sin respuesta (3+ días)
  proposalsOpen: number; // propuestas enviadas sin cerrar
  invoicesOverdue: number; // facturas vencidas
  staleTasksList: EscItem[];
  awaitingInternalList: EscItem[];
  awaitingClientList: EscItem[];
  proposalsOpenList: EscItem[];
  invoicesOverdueList: EscItem[];
};

// ── Escalación al líder del proyecto ──
// Si alguien de TU proyecto (tú eres el lead) va atrasado, te llega para que aprietes.
const INACTIVE_PROJECT = ["CERRADO", "CANCELADO"];
export type LeadEscalation = { project: string; total: number; byPerson: { name: string; count: number }[] };

export async function getLeadEscalations(userId: string, openKeys: string[], now: Date = new Date()): Promise<LeadEscalation[]> {
  const todayStart = bogotaDayStart(now);
  const projects = await db.project.findMany({
    where: { leadId: userId, status: { notIn: INACTIVE_PROJECT as never } },
    select: { id: true, name: true },
  });
  if (!projects.length) return [];
  const nameById = new Map(projects.map((p) => [p.id, p.name] as const));

  // Tareas atrasadas de OTROS (no las mías, que ya veo en mi propio resumen).
  const tasks = await db.task.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      status: { in: openKeys },
      dueDate: { lt: todayStart },
      NOT: { assigneeId: userId },
    },
    select: { projectId: true, assignee: { select: { name: true } } },
  });

  const byProject = new Map<string, Map<string, number>>();
  for (const t of tasks) {
    if (!t.projectId) continue;
    const people = byProject.get(t.projectId) ?? new Map<string, number>();
    const who = t.assignee?.name ?? "Sin responsable";
    people.set(who, (people.get(who) ?? 0) + 1);
    byProject.set(t.projectId, people);
  }

  const out: LeadEscalation[] = [];
  for (const [pid, people] of byProject) {
    const byPerson = [...people.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    out.push({ project: nameById.get(pid) ?? "Proyecto", total: byPerson.reduce((s, p) => s + p.count, 0), byPerson });
  }
  return out.sort((a, b) => b.total - a.total);
}

export function leadEscalationKeys(list: LeadEscalation[]): string[] {
  return list.flatMap((e) => e.byPerson.map((p) => `${e.project}:${p.name}:${p.count}`)).sort();
}

export async function getTeamEscalation(openKeys: string[], now: Date = new Date()): Promise<TeamEscalation> {
  const todayStart = bogotaDayStart(now);
  const staleCut = new Date(now.getTime() - 7 * DAY);
  const clientStaleCut = new Date(now.getTime() - 3 * DAY);

  // findMany (no count) con los MISMOS filtros: el contador es .length (idéntico) y además
  // se obtienen los ids/proyectos para los chips desplegables de la tarjeta del Inicio.
  const [staleTasks, awaitingInternal, awaitingClient, proposalsOpen, invoicesOverdue] = await Promise.all([
    db.task.findMany({
      where: { status: { in: openKeys }, completedAt: null, updatedAt: { lt: staleCut } },
      orderBy: { updatedAt: "asc" },
      select: { id: true, title: true, project: { select: { id: true, name: true } } },
    }),
    db.deliverable.findMany({
      where: { status: "REVISION_INTERNA" },
      orderBy: { updatedAt: "asc" },
      select: { id: true, name: true, project: { select: { id: true, name: true } } },
    }),
    db.deliverable.findMany({
      where: { status: "ENVIADO_CLIENTE", updatedAt: { lt: clientStaleCut } },
      orderBy: { updatedAt: "asc" },
      select: { id: true, name: true, project: { select: { id: true, name: true } } },
    }),
    db.proposal.findMany({
      where: { status: "ENVIADA" },
      orderBy: { updatedAt: "asc" },
      select: { id: true, title: true },
    }),
    db.invoice.findMany({
      where: { OR: [{ status: "VENCIDA" }, { status: "ENVIADA", dueDate: { lt: todayStart } }] },
      orderBy: { dueDate: "asc" },
      select: { id: true, code: true },
    }),
  ]);

  return {
    staleTasks: staleTasks.length,
    awaitingInternal: awaitingInternal.length,
    awaitingClient: awaitingClient.length,
    proposalsOpen: proposalsOpen.length,
    invoicesOverdue: invoicesOverdue.length,
    staleTasksList: staleTasks.map((t) => ({ id: t.id, title: t.title, project: t.project?.name ?? null, projectId: t.project?.id ?? null })),
    awaitingInternalList: awaitingInternal.map((d) => ({ id: d.id, title: d.name, project: d.project?.name ?? null, projectId: d.project?.id ?? null })),
    awaitingClientList: awaitingClient.map((d) => ({ id: d.id, title: d.name, project: d.project?.name ?? null, projectId: d.project?.id ?? null })),
    proposalsOpenList: proposalsOpen.map((p) => ({ id: p.id, title: p.title, project: null, projectId: null })),
    invoicesOverdueList: invoicesOverdue.map((i) => ({ id: i.id, title: i.code, project: null, projectId: null })),
  };
}
