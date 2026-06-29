import { NextResponse, type NextRequest } from "next/server";
import { readBuffer, mimeFor } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sirve PÚBLICAMENTE (sin sesión) una imagen de propuesta guardada en el NAS, para
// que el portal del cliente /p/[token] la pueda mostrar. Solo lectura de imágenes
// bajo storage/proposal/<proposalId>/. absPath() ya impide salir de ese directorio.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ proposalId: string; name: string }> }) {
  const { proposalId, name } = await ctx.params;
  // Defensa: ids/nombres simples (sin separadores ni "..").
  if (!/^[a-z0-9]+$/i.test(proposalId) || !/^[\w.-]+$/.test(name) || name.includes("..")) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const buf = await readBuffer(`proposal/${proposalId}/${name}`);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": mimeFor(name, "image/webp") ?? "image/webp",
        // Privado y sin caché compartida: la imagen es de una propuesta del cliente; no debe
        // quedar en CDNs/proxies. (El gating por token de propuesta queda como mejora aparte.)
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
