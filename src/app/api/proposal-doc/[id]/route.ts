import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { BRAND_DEFAULT, type Block, type Brand } from "@/lib/proposals/types";
import { documentoFormalWord, type DatosDocumento } from "@/lib/proposals/documento-formal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Documento formal en WORD (.doc). Es la versión de solo texto para adjuntar por correo o
// pasar a jurídica. HTML con estilos en línea servido como application/msword: Word y Google
// Docs lo abren y lo dejan EDITAR (justo lo que pide una empresa que solo quiere el texto).
//
// Solo el equipo (permiso ver_finanzas): el documento lleva la inversión. El portal público del
// cliente NO pasa por aquí.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!hasPermission(session, "ver_finanzas")) return new NextResponse("No autorizado", { status: 403 });

  const p = await db.proposal.findUnique({ where: { id }, include: { client: { select: { name: true } } } });
  if (!p) return new NextResponse("No encontrada", { status: 404 });

  const brand = { ...BRAND_DEFAULT, ...((p.brand as unknown as Brand) ?? {}) };
  const blocks = (Array.isArray(p.blocks) ? p.blocks : []) as unknown as Block[];
  const fmtFecha = (d: Date) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" }).format(d);

  const datos: DatosDocumento = {
    brand,
    blocks,
    code: p.code,
    title: p.title,
    clientName: p.client?.name ?? null,
    fecha: fmtFecha(new Date()),
    validez: p.expiresAt ? `hasta el ${fmtFecha(p.expiresAt)}` : "15 días",
  };

  const html = documentoFormalWord(datos);
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="Propuesta-${p.code}.doc"`,
      "Cache-Control": "no-store",
    },
  });
}
