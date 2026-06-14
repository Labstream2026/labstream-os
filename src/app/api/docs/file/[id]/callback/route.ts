import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { absPath } from "@/lib/storage";
import { verifyCallbackToken, isAllowedDocsUrl } from "@/lib/onlyoffice";

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
    if (!isAllowedDocsUrl(body.url)) return NextResponse.json({ error: 1 });
    const file = await db.fileAsset.findUnique({ where: { id }, select: { path: true } });
    if (file?.path) {
      try {
        const res = await fetch(body.url, { cache: "no-store" });
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(absPath(file.path), buf);
        await db.fileAsset.update({ where: { id }, data: { size: buf.length, version: { increment: 1 } } });
      } catch {
        return NextResponse.json({ error: 1 });
      }
    }
  }

  return NextResponse.json({ error: 0 });
}
