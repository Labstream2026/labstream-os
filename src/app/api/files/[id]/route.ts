import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessChannel } from "@/lib/chat-access";
import { absPath, verifyFileToken, mimeFor } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t");

  const att = await db.messageAttachment.findUnique({
    where: { id },
    include: {
      message: {
        select: {
          channel: {
            select: {
              isPublic: true,
              project: { select: { leadId: true } },
              members: { select: { userId: true } },
            },
          },
        },
      },
    },
  });
  if (!att || !att.path) return new NextResponse("No encontrado", { status: 404 });

  // Acceso: token firmado (Document Server OnlyOffice, sin cookie) o usuario con
  // sesión QUE ADEMÁS pueda ver el canal del adjunto (no basta con estar logueado).
  if (!verifyFileToken(id, token)) {
    const session = await getSession();
    if (!session) return new NextResponse("No autorizado", { status: 401 });
    if (!att.message?.channel || !canAccessChannel(att.message.channel, session)) {
      return new NextResponse("Prohibido", { status: 403 });
    }
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(absPath(att.path));
  } catch {
    return new NextResponse("Archivo no disponible", { status: 404 });
  }

  const disposition = url.searchParams.get("download") ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeFor(att.name, att.mime),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(att.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
