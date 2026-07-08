import { NextResponse, type NextRequest } from "next/server";
import { sweepReminders } from "@/lib/reminders";
import { cronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Barrido de recordatorios con cadencia fina (OPCIONAL). El barrido normal ya corre con el
// sondeo de la campana (~20 s con gente conectada) y con el cron de Marcebot (cada 2 h).
// Si quieres puntualidad exacta también de madrugada, programa en el NAS cada 5 min:
//   curl http://localhost:3200/api/cron/reminders
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    const summary = await sweepReminders({ force: true });
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
