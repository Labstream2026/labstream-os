import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { readBuffer } from "@/lib/storage";
import { verifyProposalToken } from "@/lib/proposals/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Descarga un ADJUNTO de una propuesta (portafolio, casos, contrato…).
// Autorización: el portal público pasa el token firmado de la propuesta (?t=) —que debe
// corresponder a ESTE adjunto—; el equipo interno accede con su sesión.
// SIEMPRE se sirve como descarga (application/octet-stream + attachment): un adjunto arbitrario
// nunca debe ejecutarse en este origen.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9]+$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const a = await db.proposalAttachment.findUnique({ where: { id }, select: { proposalId: true, rel: true, name: true } });
  if (!a) return new NextResponse("Not found", { status: 404 });

  const token = req.nextUrl.searchParams.get("t");
  const authorized = (token != null && verifyProposalToken(token) === a.proposalId) || !!(await getSession());
  if (!authorized) return new NextResponse("Not found", { status: 404 });

  let buf: Buffer;
  try {
    buf = await readBuffer(a.rel);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  // Nombre saneado para la cabecera (sin comillas ni saltos que rompan el header).
  const filename = a.name.replace(/["\\\r\n]/g, "_");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
