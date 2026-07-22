import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Salud del proceso ──
// Para diagnosticar la página de error del Synology («no se encuentra la página»): esa página
// aparece cuando el proxy de DSM no encuentra la app — casi siempre porque el contenedor se
// REINICIÓ (OOM, uncaughtException, deploy). Este endpoint delata los reinicios sin entrar al
// NAS: si `upSec` es pequeño cuando alguien acaba de ver el error, hubo reinicio — y la causa
// exacta queda en `docker logs` gracias a registerProcessDiagnostics (instrumentation.ts).
// Sin datos sensibles y sin sesión a propósito: solo dice «estoy vivo, hace cuánto arranqué
// y si alcanzo la base de datos».
export async function GET() {
  const dbOk = await db.$queryRaw`SELECT 1`.then(
    () => true,
    () => false,
  );
  return NextResponse.json(
    {
      ok: dbOk,
      upSec: Math.floor(process.uptime()),
      db: dbOk,
    },
    { status: dbOk ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
