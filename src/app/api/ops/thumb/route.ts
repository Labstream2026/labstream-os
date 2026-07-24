import { NextResponse, type NextRequest } from "next/server";
import { opsSession } from "@/lib/ops-access";
import { opsThumb } from "@/lib/nas-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Miniatura webp de una imagen de Operaciones_LAB (cacheada en el storage interno).
// El explorador manda ?v=<mtime>: la URL cambia cuando el archivo cambia, así que se
// puede cachear fuerte en el navegador sin riesgo de quedarse viendo la versión vieja.
export async function GET(req: NextRequest) {
  const session = await opsSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "";
  try {
    const webp = await opsThumb(path);
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
