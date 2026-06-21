import { NextResponse, type NextRequest } from "next/server";
import { runRecurringTasks } from "@/lib/recurring";
import { cronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Materializa las tareas recurrentes que tocan hoy. Lo invoca el Programador de tareas del
// NAS una vez al día (p. ej. 6:00):  curl http://localhost:3200/api/cron/recurring-tasks
// Local del NAS sin secreto; externas exigen Authorization: Bearer $CRON_SECRET (cron-auth).
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    const summary = await runRecurringTasks();
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
