import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La versión del build que está SIRVIENDO ahora mismo (el SHA que claude-job.sh horneó en
// public/version.txt al desplegar). La usa AvisoVersion: cada pestaña conoce el SHA con el
// que se pintó y pregunta aquí de vez en cuando — si difieren, hubo deploy debajo y toca
// recargar antes de que el próximo clic falle con «Failed to find Server Action».
// Va por API (y no leyendo /version.txt directo) para no abrir el archivo al público y para
// que el service worker no lo cachee jamás.
export async function GET() {
  const sha = await readFile(path.join(process.cwd(), "public", "version.txt"), "utf8")
    .then((s) => s.split("\n")[0]?.trim() ?? "")
    .catch(() => "");
  return NextResponse.json({ sha }, { headers: { "Cache-Control": "no-store" } });
}
