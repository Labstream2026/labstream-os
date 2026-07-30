import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientAbortCount } from "@/instrumentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Qué versión está sirviendo ──
// public/version.txt lo escribe claude-job.sh antes de construir (commit + fecha UTC), y el
// Dockerfile lo hornea en la imagen. Sirve para responder «¿entró el deploy?» sin entrar al NAS:
// se compara con el último commit de main. Nació de un rato entero creyendo que el deploy no
// funcionaba —porque la pestaña nueva no aparecía— cuando en realidad sí había entrado.
// Se lee UNA vez por proceso: es un archivo de la imagen, no cambia sin reiniciar el contenedor.
let versionCache: { commit: string; builtAt: string | null } | null = null;
async function version(): Promise<{ commit: string; builtAt: string | null }> {
  if (versionCache) return versionCache;
  try {
    const txt = await readFile(path.join(process.cwd(), "public", "version.txt"), "utf8");
    const [commit, builtAt] = txt.trim().split("\n");
    versionCache = { commit: (commit ?? "").trim() || "desconocido", builtAt: builtAt?.trim() || null };
  } catch {
    // Sin el archivo (imagen construida antes de esto, o build local): se dice, no se inventa.
    // A propósito NO se cachea el fallo: si el archivo aparece después, se lee. Cachearlo dejaba
    // el endpoint diciendo «sin-version-txt» para siempre aunque el archivo ya estuviera ahí.
    return { commit: "sin-version-txt", builtAt: null };
  }
  return versionCache;
}

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
  const v = await version();
  return NextResponse.json(
    {
      ok: dbOk,
      upSec: Math.floor(process.uptime()),
      db: dbOk,
      // Commit que está sirviendo y cuándo se construyó: comparar con main responde «¿entró el
      // deploy?» de una vez, en vez de deducirlo por lo que falta en la pantalla.
      commit: v.commit,
      builtAt: v.builtAt,
      // Desconexiones de cliente a mitad de una respuesta que ANTES tumbaban el proceso. Si
      // este número sube y `upSec` sigue creciendo, la app está aguantando lo que la reiniciaba.
      clientAborts: clientAbortCount(),
    },
    { status: dbOk ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
