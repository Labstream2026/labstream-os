import { NextResponse, type NextRequest } from "next/server";
import { emptyDocx } from "@/lib/docx";
import { verifyScopedToken } from "@/lib/signed-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Documento diminuto que sirve SOLO para el diagnóstico de OnlyOffice: se le pide al Document
// Server que lo descargue de aquí y lo convierta. Si lo logra, queda probado el camino
// «Document Server → la app» (el que hace que un documento abra vacío cuando falla).
//
// Va con token firmado y de vida corta porque el Document Server no tiene sesión: es la misma
// mecánica con la que descarga los documentos de verdad.
export async function GET(req: NextRequest) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (verifyScopedToken("docprobe", t) !== "probe") {
    return NextResponse.json({ error: "token inválido" }, { status: 403 });
  }
  const buf = emptyDocx(["Prueba de conexión de Labstream OS."]);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store",
    },
  });
}
