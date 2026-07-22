import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { getSession } from "@/lib/auth";
import { userCanAccessProject } from "@/lib/project-access";
import {
  CHUNK_DIR,
  MAX_TOTAL,
  BLOCKED_UPLOAD_EXT,
  metaPath,
  partPath,
  sweepStaleChunks,
  type ChunkMeta,
} from "@/lib/chunked-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Subida por TROZOS (init) ──
// Las server actions topan en 100 MB y materializan el archivo entero en RAM (un master de
// 2 GB tumbaba el contenedor). Esta familia de rutas recibe el archivo en trozos que se
// APPENDEAN directo a disco (RAM plana), con reanudación por offset y verificación CRC32.
// El registro final de la versión lo hace /finish llamando a la server action existente
// (mismas notificaciones, SLA y tareas automáticas — cero duplicación de lógica).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  // Superficie del EQUIPO (el subidor pro vive en /revisiones): el portal del cliente y el
  // usuario demo no inician subidas por trozos.
  if (session.role === "cliente" || session.role === "demo") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body: { fileName?: string; size?: number; mime?: string; projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const fileName = String(body.fileName ?? "").slice(0, 200);
  const size = Number(body.size);
  const mime = String(body.mime ?? "application/octet-stream").slice(0, 100);
  const projectId = String(body.projectId ?? "");
  if (!fileName || !Number.isFinite(size) || size <= 0 || size > MAX_TOTAL) {
    return NextResponse.json({ error: "Archivo inválido (máx. 8 GB)" }, { status: 400 });
  }
  if (BLOCKED_UPLOAD_EXT.test(fileName)) return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 400 });
  if (!(await userCanAccessProject(projectId, session))) {
    return NextResponse.json({ error: "Sin acceso al proyecto" }, { status: 403 });
  }

  await fs.mkdir(CHUNK_DIR, { recursive: true });
  await sweepStaleChunks();

  const id = crypto.randomUUID();
  const meta: ChunkMeta = { id, fileName, size, mime, projectId, userId: session.id, createdAt: new Date().toISOString() };
  await fs.writeFile(metaPath(id), JSON.stringify(meta));
  await fs.writeFile(partPath(id), Buffer.alloc(0));
  return NextResponse.json({ id, received: 0 });
}
