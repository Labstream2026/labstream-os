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
    // RECLAMO ATÓMICO antes de notificar: el cron frecuente y el diario (red de seguridad) pueden
    // solaparse y leer la misma nota como pendiente. El updateMany condicionado a reminderSentAt=null
    // solo deja ganar a UNO. Además marca ANTES de notificar (si el mark fallara después del notify,
    // la nota se re-notificaría en cada barrido → spam); aquí solo se notifica si se ganó el reclamo.
    const claim = await db.note.updateMany({ where: { id: n.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (claim.count !== 1) continue; // otro barrido ya lo reclamó
    const body = n.content.trim().replace(/\s+/g, " ").slice(0, 140) || undefined;
    await notify(n.createdById, { type: "note", title: `⏰ Recordatorio: ${n.title}`, body, link: "/notas" }).catch(() => null);
    sent++;
  }
  return { due: due.length, sent };
}
