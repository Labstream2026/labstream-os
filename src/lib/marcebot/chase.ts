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
export type TeamEscalation = {
  staleTasks: number; // tareas abiertas sin tocar en 7+ días
  awaitingInternal: number; // entregables esperando pre-aprobación
  awaitingClient: number; // enviados al cliente sin respuesta (3+ días)
  proposalsOpen: number; // propuestas enviadas sin cerrar
  invoicesOverdue: number; // facturas vencidas
};

export async function getTeamEscalation(openKeys: string[], now: Date = new Date()): Promise<TeamEscalation> {
  const todayStart = bogotaDayStart(now);
  const staleCut = new Date(now.getTime() - 7 * DAY);
  const clientStaleCut = new Date(now.getTime() - 3 * DAY);

  const [staleTasks, awaitingInternal, awaitingClient, proposalsOpen, invoicesOverdue] = await Promise.all([
    db.task.count({ where: { status: { in: openKeys }, completedAt: null, updatedAt: { lt: staleCut } } }),
    db.deliverable.count({ where: { status: "REVISION_INTERNA" } }),
    db.deliverable.count({ where: { status: "ENVIADO_CLIENTE", updatedAt: { lt: clientStaleCut } } }),
    db.proposal.count({ where: { status: "ENVIADA" } }),
    db.invoice.count({ where: { OR: [{ status: "VENCIDA" }, { status: "ENVIADA", dueDate: { lt: todayStart } }] } }),
  ]);

  return { staleTasks, awaitingInternal, awaitingClient, proposalsOpen, invoicesOverdue };
}
