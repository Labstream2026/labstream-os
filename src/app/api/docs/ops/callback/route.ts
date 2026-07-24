import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { normalizeOpsRel, opsAbs } from "@/lib/nas-ops";
import { verifyScopedToken } from "@/lib/signed-token";
import { verifyCallbackToken, isAllowedDocsUrl, fetchSavedDoc } from "@/lib/onlyoffice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Callback de OnlyOffice al guardar un documento de Operaciones_LAB: escribe de vuelta EN LA
// MISMA ruta de la share. Doble candado: el JWT del Document Server (identidad del callback)
// Y el token firmado «opsdoc» que ata la petición a ESTA ruta (sin él, un callback válido
// podría sobrescribir cualquier archivo cambiando ?path=).
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
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

  let rel: string;
  try {
    rel = normalizeOpsRel(url.searchParams.get("path") || "");
  } catch {
    return NextResponse.json({ error: 1 });
  }
  const t = url.searchParams.get("t") || "";
  if (!rel || verifyScopedToken("opsdoc", t) !== rel) return NextResponse.json({ error: 1 });

  if ((body.status === 2 || body.status === 6) && body.url) {
    if (!(await isAllowedDocsUrl(body.url))) return NextResponse.json({ error: 1 });
    try {
      const buf = await fetchSavedDoc(body.url);
      await fs.writeFile(await opsAbs(rel), buf);
    } catch (e) {
      console.error("[onlyoffice] guardar en Operaciones_LAB falló:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: 1 });
    }
  }

  return NextResponse.json({ error: 0 });
}
