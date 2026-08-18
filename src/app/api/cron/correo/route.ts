import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { sincronizarCuenta } from "@/lib/correo/imap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sincroniza los buzones conectados aunque nadie tenga la pestaña abierta. Programar en el
// NAS cada 5 min (mismo patrón que el resto de crons; el secreto es OBLIGATORIO):
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3200/api/cron/correo
// En serie a propósito: son buzones del MISMO MailPlus y bombardearlo en paralelo desde su
// propio NAS no le hace bien a nadie.
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const cuentas = await db.mailAccount.findMany({ select: { id: true, email: true } });
  const detalle: Record<string, string> = {};
  let nuevos = 0;
  for (const c of cuentas) {
    const r = await sincronizarCuenta(c.id, { max: 250 });
    nuevos += r.nuevos;
    if (r.error) detalle[c.email] = r.error;
  }
  return NextResponse.json({ ok: true, cuentas: cuentas.length, nuevos, errores: detalle });
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
