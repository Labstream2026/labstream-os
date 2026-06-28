import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runPendingMediaJobs } from "@/lib/media-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sondea los trabajos de medios (video) en curso y entrega los que ya terminaron. Es la RED DE
// SEGURIDAD del sondeo activo (que corre tras crear el job): si el contenedor se reinició mientras
// un video se generaba, este cron lo recupera. Idempotente (claim atómico en runPendingMediaJobs).
// Auth: Authorization: Bearer $CRON_SECRET. También se invoca desde /api/cron/marcebot.
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    const r = await runPendingMediaJobs();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
