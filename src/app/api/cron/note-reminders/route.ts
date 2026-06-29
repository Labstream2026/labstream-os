import { NextResponse, type NextRequest } from "next/server";
import { dispatchDueNoteReminders } from "@/lib/note-reminders";
import { cronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dispara los recordatorios de notas cuya fecha ya llegó. Lo invoca el Programador del NAS
// cada pocos minutos:  curl http://localhost:3200/api/cron/note-reminders
// Local del NAS sin secreto; externas exigen Authorization: Bearer $CRON_SECRET (cron-auth).
// (Como red de seguridad, el cron diario recurring-tasks también lo ejecuta.)
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    const r = await dispatchDueNoteReminders();
    return NextResponse.json({ ok: true, ...r });
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
