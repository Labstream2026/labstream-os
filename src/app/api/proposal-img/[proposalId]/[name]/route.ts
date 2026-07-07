import { NextResponse, type NextRequest } from "next/server";
import { readBuffer, mimeFor } from "@/lib/storage";
import { getSession } from "@/lib/auth";
import { verifyProposalToken } from "@/lib/proposals/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sirve una imagen de propuesta guardada en el NAS (storage/proposal/<proposalId>/) para el
// portal del cliente /p/[token]. Autorización: el portal público pasa el token firmado de la
// propuesta (?t=) —que debe corresponder a ESTE proposalId—; el equipo interno accede con su
// sesión. absPath() ya impide salir del directorio.
export async function GET(req: NextRequest, ctx: { params: Promise<{ proposalId: string; name: string }> }) {
  const { proposalId, name } = await ctx.params;
  // Defensa: ids/nombres simples (sin separadores ni "..").
  if (!/^[a-z0-9]+$/i.test(proposalId) || !/^[\w.-]+$/.test(name) || name.includes("..")) {
    return new NextResponse("Not found", { status: 404 });
  }
  // Sin token válido de ESTA propuesta y sin sesión → 404 (antes cualquiera que adivinara el id +
  // nombre del archivo podía leer la imagen sin autenticarse).
  const token = req.nextUrl.searchParams.get("t");
  const authorized = (token != null && verifyProposalToken(token) === proposalId) || !!(await getSession());
  if (!authorized) return new NextResponse("Not found", { status: 404 });
  try {
    const buf = await readBuffer(`proposal/${proposalId}/${name}`);
    const mime = mimeFor(name, "image/webp") ?? "image/webp";
    // Solo se sirven imágenes inline. Si el nombre resolviera a un tipo no-imagen (p. ej. .html),
    // se fuerza descarga como octet-stream para que el navegador NUNCA lo ejecute en este origen.
    const isImage = /^image\//.test(mime);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": isImage ? mime : "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        ...(isImage ? {} : { "Content-Disposition": "attachment" }),
        // Privado y sin caché compartida: la imagen es de una propuesta del cliente; no debe
        // quedar en CDNs/proxies. (El gating por token de propuesta queda como mejora aparte.)
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
