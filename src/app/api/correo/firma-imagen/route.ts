import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La imagen de la PROPIA firma, para previsualizarla en el compositor y en «Firma y GIFs».
// En los correos no se usa esta URL: la imagen viaja incrustada (CID) dentro del mensaje.
export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });

  const cuenta = await db.mailAccount.findUnique({
    where: { userId: session.id },
    select: { signatureImage: true, signatureImageMime: true },
  });
  if (!cuenta?.signatureImage) return new NextResponse("Sin imagen", { status: 404 });

  return new NextResponse(new Uint8Array(cuenta.signatureImage), {
    headers: {
      "Content-Type": cuenta.signatureImageMime ?? "image/png",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache", // cambia al re-subirla: mejor fresca
    },
  });
}
