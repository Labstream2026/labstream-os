import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { absPath } from "@/lib/storage";
import { verifyCallbackToken, isAllowedDocsUrl, fetchSavedDoc } from "@/lib/onlyoffice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Callback de OnlyOffice al guardar un archivo LOCAL de proyecto.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { status?: number; url?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 1 });
  }

  const headerToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!(await verifyCallbackToken(body.token || headerToken))) {
    return NextResponse.json({ error: 1 });
  }

  if ((body.status === 2 || body.status === 6) && body.url) {
    if (!(await isAllowedDocsUrl(body.url))) return NextResponse.json({ error: 1 });
    const file = await db.fileAsset.findUnique({ where: { id }, select: { path: true, kind: true } });
    if (file?.path) {
      try {
        const buf = await fetchSavedDoc(body.url);
        if (file.kind === "OPS") {
          // Archivo vivo de Operaciones_LAB: se guarda de vuelta EN LA MISMA ruta de la share.
          const { opsAbs } = await import("@/lib/nas-ops");
          await fs.writeFile(await opsAbs(file.path), buf);
        } else {
          await fs.writeFile(absPath(file.path), buf);
        }
        await db.fileAsset.update({ where: { id }, data: { size: buf.length, version: { increment: 1 } } });
      } catch (e) {
        console.error("[onlyoffice] guardar archivo falló:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: 1 });
      }
    }
  }

  return NextResponse.json({ error: 0 });
}
