import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { absPath } from "@/lib/storage";
import { verifyCallbackToken, isAllowedDocsUrl, fetchSavedDoc } from "@/lib/onlyoffice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Callback de OnlyOffice al guardar una PLANTILLA de documento. Igual que el de los archivos
// de proyecto pero sin versiones ni comentarios: una plantilla es un molde, no un entregable.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { status?: number; url?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 1 });
  }

  const headerToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!(await verifyCallbackToken(body.token || headerToken))) return NextResponse.json({ error: 1 });

  if ((body.status === 2 || body.status === 6) && body.url) {
    if (!(await isAllowedDocsUrl(body.url))) return NextResponse.json({ error: 1 });
    const t = await db.docTemplate.findUnique({ where: { id }, select: { path: true } });
    if (t?.path) {
      try {
        const buf = await fetchSavedDoc(body.url);
        await fs.writeFile(absPath(t.path), buf);
        await db.docTemplate.update({ where: { id }, data: { size: buf.length } });
      } catch (e) {
        console.error("[onlyoffice] guardar plantilla falló:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: 1 });
      }
    }
  }
  return NextResponse.json({ error: 0 });
}
