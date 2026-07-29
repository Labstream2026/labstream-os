import { NextResponse, type NextRequest } from "next/server";
import { avisarPaginasVencidas } from "@/lib/wiki-health";
import { cronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Avisa a los dueños de las páginas de la wiki que llevan demasiado sin revisarse.
// Lo invoca el Programador del NAS (basta una vez al día). El secreto es OBLIGATORIO también
// para las llamadas locales —el puerto 3200 está publicado en la LAN, así que «viene de
// localhost» es falsificable; ver @/lib/cron-auth—, o sea que SIEMPRE con cabecera:
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3200/api/cron/wiki-stale
// Es idempotente: una página avisada no vuelve a avisar en 30 días, y editarla limpia la marca.
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    const r = await avisarPaginasVencidas();
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
