import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { absPath } from "@/lib/storage";
import { verifyCallbackToken, isAllowedDocsUrl, fetchSavedDoc } from "@/lib/onlyoffice";
import { snapshotFileVersion } from "@/lib/file-versions";
import { syncDocComments, setDocPresence } from "@/lib/doc-collab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Callback de OnlyOffice al guardar un archivo LOCAL de proyecto.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { status?: number; url?: string; token?: string; users?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 1 });
  }

  const headerToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!(await verifyCallbackToken(body.token || headerToken))) {
    return NextResponse.json({ error: 1 });
  }

  // status 1 = alguien entró o salió del documento. `users` es la lista COMPLETA de quienes lo
  // tienen abierto ahora, así que basta con reflejarla tal cual.
  if (body.status === 1) {
    await setDocPresence(id, body.users ?? []);
    return NextResponse.json({ error: 0 });
  }
  // status 4 = se cerró sin cambios: ya no queda nadie dentro.
  if (body.status === 4) await setDocPresence(id, []);

  if ((body.status === 2 || body.status === 6) && body.url) {
    if (!(await isAllowedDocsUrl(body.url))) return NextResponse.json({ error: 1 });
    const file = await db.fileAsset.findUnique({ where: { id }, select: { path: true, kind: true } });
    if (file?.path) {
      try {
        const buf = await fetchSavedDoc(body.url);
        // ANTES de sobrescribir: copia de lo que había, para poder volver atrás. Los archivos
        // vivos de Operaciones_LAB no se versionan aquí (viven fuera del storage, en la share).
        if (file.kind !== "OPS") {
          const quien = body.users?.length
            ? (await db.user.findMany({ where: { id: { in: body.users } }, select: { name: true } })).map((u) => u.name).join(", ")
            : null;
          await snapshotFileVersion(id, { savedByName: quien });
        }
        if (file.kind === "OPS") {
          // Archivo vivo de Operaciones_LAB: se guarda de vuelta EN LA MISMA ruta de la share.
          const { opsAbs } = await import("@/lib/nas-ops");
          await fs.writeFile(await opsAbs(file.path), buf);
        } else {
          await fs.writeFile(absPath(file.path), buf);
        }
        await db.fileAsset.update({ where: { id }, data: { size: buf.length, version: { increment: 1 } } });
        // Los comentarios viajan DENTRO del documento: este es el único momento en que se
        // pueden leer. Va después de escribir el archivo y nunca tumba el guardado.
        await syncDocComments(id, buf, body.users ?? []);
      } catch (e) {
        console.error("[onlyoffice] guardar archivo falló:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: 1 });
      }
    }
  }

  return NextResponse.json({ error: 0 });
}
