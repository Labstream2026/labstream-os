import { db } from "@/lib/db";
import { bogotaWeekStart } from "./time";

// Datos del cierre de semana (viernes): qué se cerró esta semana, por persona y horas.

export type UserWeek = { completed: number; minutes: number };

export async function getUserWeekStats(userId: string, now: Date = new Date()): Promise<UserWeek> {
  const weekStart = bogotaWeekStart(now);
  const [completed, mins] = await Promise.all([
    db.task.count({ where: { completedAt: { gte: weekStart, lte: now }, OR: [{ assigneeId: userId }, { ownerId: userId }] } }),
    db.timeEntry.aggregate({ _sum: { minutes: true }, where: { userId, spentOn: { gte: weekStart } } }),
  ]);
  return { completed, minutes: mins._sum.minutes ?? 0 };
}

export type TeamWeek = { completedTotal: number; topClosers: { name: string; count: number }[] };

export async function getTeamWeekStats(now: Date = new Date()): Promise<TeamWeek> {
  const weekStart = bogotaWeekStart(now);
  const rows = await db.task.findMany({
    where: { completedAt: { gte: weekStart, lte: now } },
    select: { assignee: { select: { name: true } } },
  });
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.assignee?.name) continue;
    counts.set(r.assignee.name, (counts.get(r.assignee.name) ?? 0) + 1);
  }
  const topClosers = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return { completedTotal: rows.length, topClosers };
}
