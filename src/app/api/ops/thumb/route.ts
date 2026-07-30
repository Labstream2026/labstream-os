import { NextResponse, type NextRequest } from "next/server";
import { opsSession } from "@/lib/ops-access";
import { opsThumb } from "@/lib/nas-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cuánto se espera a que la miniatura esté lista antes de contestar «todavía no».
//
// Las imágenes salen al instante, y los vídeos ya cacheados también. El único caso lento es el
// vídeo que se está fabricando AHORA, y ahí esperar es lo peor que se puede hacer: el navegador
// abre 6 conexiones por servidor, así que 40 vídeos esperando 20 s cada uno dejarían la página
// bloqueada detrás de sus propias miniaturas. Se contesta pronto, el trabajo SIGUE en segundo
// plano —termina y queda cacheado—, y la pieza enseña «preparando…» mientras tanto.
const ESPERA_MS = 3_000;

// Miniatura webp de una pieza de Operaciones_LAB (cacheada en el storage interno).
// El explorador manda ?v=<mtime>: la URL cambia cuando el archivo cambia, así que se
// puede cachear fuerte en el navegador sin riesgo de quedarse viendo la versión vieja.
export async function GET(req: NextRequest) {
  const session = await opsSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "";
  try {
    // El trabajo NO se cancela al ganar el reloj: el fotograma se termina de fabricar y se
    // guarda igual. Por eso el reintento (o la siguiente visita) lo encuentra hecho.
    const trabajo = opsThumb(path);
    // Un fallo del trabajo DESPUÉS de que el reloj ganara sería un rechazo sin dueño, y Node
    // tumba el proceso por «unhandled rejection». Se le pone dueño aquí, pase lo que pase.
    trabajo.catch(() => {});
    const webp = await Promise.race([trabajo, new Promise<"tarde">((r) => setTimeout(() => r("tarde"), ESPERA_MS))]);

    if (webp === "tarde") {
      return new NextResponse("Preparando", {
        status: 404,
        headers: { "X-Preparando": "1", "Cache-Control": "private, no-store" },
      });
    }
    if (!webp) return new NextResponse("Sin miniatura", { status: 404 });
    return new NextResponse(new Uint8Array(webp), {
      headers: {
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": url.searchParams.get("v") ? "private, max-age=86400" : "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Sin miniatura", { status: 404 });
  }
}
