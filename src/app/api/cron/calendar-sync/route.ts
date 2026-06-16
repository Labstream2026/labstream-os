import { NextResponse, type NextRequest } from "next/server";
import { syncAllCalendars } from "@/lib/calendar-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sondeo (pull) de los calendarios Synology conectados. Lo invoca el Programador de
// tareas del NAS cada ~5 min:  curl -H "Authorization: Bearer $CRON_SECRET" \
//   http://localhost:3200/api/cron/calendar-sync
// Protegido por CRON_SECRET para que nadie más lo dispare.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sin secreto configurado, el endpoint queda cerrado
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const q = req.nextUrl.searchParams.get("key");
  return header === secret || q === secret;
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
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
