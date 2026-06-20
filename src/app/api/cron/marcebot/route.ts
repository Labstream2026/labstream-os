import { NextResponse, type NextRequest } from "next/server";
import { runMarcebot } from "@/lib/marcebot";
import { syncAllCalendars } from "@/lib/calendar-sync";
import { cronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Marcebot: revisa pendientes y manda notificaciones por DM. Lo invoca el Programador
// de tareas del NAS cada 2 horas:  curl http://localhost:3200/api/cron/marcebot
// Las llamadas locales del NAS se aceptan sin secreto; las externas exigen
// `Authorization: Bearer $CRON_SECRET`. Ver @/lib/cron-auth.
// Además, aprovechamos este cron (que ya está programado en el NAS) para SINCRONIZAR los
// calendarios de Synology de todo el equipo, así la sync automática funciona sin tener que
// crear una tarea aparte. (Hay también /api/cron/calendar-sync para una cadencia más fina.)
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    const summary = await runMarcebot();
    const calendars = await syncAllCalendars().catch((e) => ({ error: e instanceof Error ? e.message : "error" }));
    return NextResponse.json({ ...summary, calendars });
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
