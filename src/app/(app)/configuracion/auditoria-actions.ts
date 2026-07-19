"use server";

import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { noAutorizado } from "@/lib/authz-error";
import { GROUP_PREFIXES } from "./auditoria-groups";

// ── Acciones de servidor del panel de Auditoría (feed paginado + vista por persona) ──
// Solo para quien tiene el permiso `ver_actividad` (igual que el panel).

export type AuditFeedRow = {
  id: string;
  action: string;
  summary: string;
  when: string; // ISO
  ip: string | null;
  userId: string | null;
  userName: string | null;
  userInitials: string | null;
  userColor: string | null;
  projectName: string | null;
  clientName: string | null;
};

async function requireAudit() {
  const session = await getSession();
  if (!session || !hasPermission(session, "ver_actividad")) noAutorizado();
  return session!;
}

function feedWhere(f: { userId?: string; group?: string; from?: string; to?: string }) {
  const where: Record<string, unknown> = {};
  if (f.userId) where.userId = f.userId;
  if (f.group && GROUP_PREFIXES[f.group]) {
    where.OR = GROUP_PREFIXES[f.group].map((p) => ({ action: { startsWith: p } }));
  }
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: new Date(f.from) } : {}),
      ...(f.to ? { lt: new Date(f.to) } : {}),
    };
  }
  return where;
}

const rowSelect = {
  id: true,
  action: true,
  summary: true,
  createdAt: true,
  ip: true,
  userId: true,
  actorName: true,
  user: { select: { name: true, initials: true, avatarColor: true } },
  project: { select: { name: true } },
  client: { select: { name: true } },
} as const;

type RawRow = {
  id: string;
  action: string;
  summary: string;
  createdAt: Date;
  ip: string | null;
  userId: string | null;
  actorName: string | null;
  user: { name: string; initials: string | null; avatarColor: string | null } | null;
  project: { name: string } | null;
  client: { name: string } | null;
};

function toRow(a: RawRow): AuditFeedRow {
  return {
    id: a.id,
    action: a.action,
    summary: a.summary,
    when: a.createdAt.toISOString(),
    ip: a.ip,
    userId: a.userId,
    userName: a.user?.name ?? a.actorName ?? null,
    userInitials: a.user?.initials ?? null,
    userColor: a.user?.avatarColor ?? null,
    projectName: a.project?.name ?? null,
    clientName: a.client?.name ?? null,
  };
}

// Página del feed (50 por tanda, cursor = id de la última fila vista).
export async function getAuditPage(f: {
  cursor?: string;
  userId?: string;
  group?: string;
  from?: string;
  to?: string;
}): Promise<{ rows: AuditFeedRow[]; nextCursor: string | null }> {
  await requireAudit();
  const rows = await db.activityLog.findMany({
    where: feedWhere(f),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    select: rowSelect,
  });
  return {
    rows: rows.map(toRow),
    nextCursor: rows.length === 50 ? rows[rows.length - 1].id : null,
  };
}

// Día de una persona (hora de Bogotá): filas ASC del día + conteos de su semana (L→D)
// para las barras de navegación.
export async function getUserDay(
  userId: string,
  ymd: string, // "2026-07-18" (día de Bogotá)
): Promise<{ rows: AuditFeedRow[]; week: { ymd: string; count: number }[] }> {
  await requireAudit();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return { rows: [], week: [] };

  const dayStart = new Date(`${ymd}T00:00:00.000-05:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const rows = await db.activityLog.findMany({
    where: { userId, createdAt: { gte: dayStart, lt: dayEnd } },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: rowSelect,
  });

  // Semana de ese día (lunes → domingo, en Bogotá) con el total por día.
  const base = new Date(`${ymd}T12:00:00.000-05:00`);
  const dow = (base.getUTCDay() + 6) % 7; // 0 = lunes
  const monday = new Date(dayStart.getTime() - dow * 24 * 3600 * 1000);
  const week: { ymd: string; count: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const s = new Date(monday.getTime() + i * 24 * 3600 * 1000);
    const e = new Date(s.getTime() + 24 * 3600 * 1000);
    const count = await db.activityLog.count({ where: { userId, createdAt: { gte: s, lt: e } } });
    // El "ymd" de cada barra sale del instante local Bogotá (UTC-5 fijo).
    const label = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(s.getTime() + 12 * 3600 * 1000));
    week.push({ ymd: label, count });
  }
  return { rows: rows.map(toRow), week };
}
