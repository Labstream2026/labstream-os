import { NextResponse, type NextRequest } from "next/server";
import { syncAllCalendars } from "@/lib/calendar-sync";
import { cronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sondeo (pull) de los calendarios Synology conectados. Lo invoca el Programador de
// tareas del NAS:  curl http://localhost:3200/api/cron/calendar-sync
// Las llamadas locales del NAS se aceptan sin secreto; las externas exigen
// `Authorization: Bearer $CRON_SECRET`. Ver @/lib/cron-auth.
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    const summary = await syncAllCalendars();
    return NextResponse.json({ ok: true, ...summary });
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
