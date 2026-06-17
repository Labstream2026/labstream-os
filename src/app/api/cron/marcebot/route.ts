import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { runMarcebot } from "@/lib/marcebot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Comparación en tiempo constante (evita fugas por timing). Distinta longitud → false.
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// Marcebot: revisa pendientes y manda notificaciones por DM. Lo invoca el Programador
// de tareas del NAS cada hora:  curl -H "Authorization: Bearer $CRON_SECRET" \
//   http://localhost:3200/api/cron/marcebot
// Protegido por CRON_SECRET (mismo secreto que el resto de crons). SOLO por cabecera.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return safeEqual(header, secret);
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
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
