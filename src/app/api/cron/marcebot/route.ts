import { NextResponse, type NextRequest } from "next/server";
import { runMarcebot } from "@/lib/marcebot";
import { cronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Marcebot: revisa pendientes y manda notificaciones por DM. Lo invoca el Programador
// de tareas del NAS cada 2 horas:  curl http://localhost:3200/api/cron/marcebot
// Las llamadas locales del NAS se aceptan sin secreto; las externas exigen
// `Authorization: Bearer $CRON_SECRET`. Ver @/lib/cron-auth.
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    const summary = await runMarcebot();
    return NextResponse.json(summary);
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
