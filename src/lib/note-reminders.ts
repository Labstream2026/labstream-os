import { db } from "@/lib/db";
import { notify } from "@/lib/notify";

// Despacha los recordatorios de notas vencidos: notifica al dueño y marca reminderSentAt para
// no repetir. Reutilizable desde la ruta dedicada (/api/cron/note-reminders, frecuente) y como
// red de seguridad desde el cron diario (recurring-tasks), para que funcione aunque no se haya
// programado un job frecuente en el NAS.
export async function dispatchDueNoteReminders(now: Date = new Date()): Promise<{ due: number; sent: number }> {
  const due = await db.note.findMany({
    where: { remindAt: { lte: now }, reminderSentAt: null },
    select: { id: true, title: true, content: true, createdById: true },
    take: 500,
  });
  let sent = 0;
  for (const n of due) {
    const body = n.content.trim().replace(/\s+/g, " ").slice(0, 140) || undefined;
    await notify(n.createdById, { type: "note", title: `⏰ Recordatorio: ${n.title}`, body, link: "/notas" }).catch(() => null);
    await db.note.update({ where: { id: n.id }, data: { reminderSentAt: now } }).catch(() => null);
    sent++;
  }
  return { due: due.length, sent };
}
