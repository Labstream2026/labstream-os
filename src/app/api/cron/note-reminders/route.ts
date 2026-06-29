import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { cronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dispara los recordatorios de notas cuya fecha ya llegó. Lo invoca el Programador del NAS
// cada pocos minutos:  curl http://localhost:3200/api/cron/note-reminders
// Local del NAS sin secreto; externas exigen Authorization: Bearer $CRON_SECRET (cron-auth).
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    const now = new Date();
    const due = await db.note.findMany({
      where: { remindAt: { lte: now }, reminderSentAt: null },
      select: { id: true, title: true, content: true, createdById: true },
      take: 200,
    });
    let sent = 0;
    for (const n of due) {
      const body = n.content.trim().replace(/\s+/g, " ").slice(0, 140) || undefined;
      await notify(n.createdById, { type: "note", title: `⏰ Recordatorio: ${n.title}`, body, link: "/notas" }).catch(() => null);
      await db.note.update({ where: { id: n.id }, data: { reminderSentAt: now } }).catch(() => null);
      sent++;
    }
    return NextResponse.json({ ok: true, due: due.length, sent });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
