import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { parseUploadToken } from "@/lib/upload-token";
import { saveBuffer, deleteRel, mimeFor } from "@/lib/storage";
import { saveBufferWithPreview, previewRel } from "@/lib/image";
import { rateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity";
import {
  MAX_CLIENT_UPLOAD,
  isAllowedClientUpload,
  isImageUpload,
  projectUploadRelDir,
  readBodyWithLimit,
  UploadTooLargeError,
} from "@/lib/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ token: string }> };

// Carpeta del proyecto donde se agrupa lo que sube el cliente por el enlace público.
const CLIENT_FOLDER = "Material del cliente";

// IP REAL del cliente: el ÚLTIMO salto de X-Forwarded-For (el que añade NUESTRO proxy), no el
// primero (falsificable por el cliente) — mismo criterio que el login (auth-actions.ts).
async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const xff = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return xff.length ? xff[xff.length - 1] : (h.get("x-real-ip") ?? "").trim();
  } catch {
    return "";
  }
}

// POST /api/upload/:token — subida PÚBLICA del cliente (sin sesión). El cuerpo es el archivo crudo;
// el nombre viaja en `x-filename` y, opcional, el nombre de quien sube en `x-uploader`. Un archivo
// por request. Autoriza SOLO el token firmado + su nonce vigente + estado del enlace; valida tipo
// (imagen/video) y tamaño (≤200 MB). Rate-limit por proyecto+IP e, independiente de la IP (que es
// falsificable si el proxy no la sanea), por proyecto.
export async function POST(req: NextRequest, routeCtx: unknown) {
  const { token } = await (routeCtx as RouteCtx).params;
  const parsed = parseUploadToken(token);
  if (!parsed) return NextResponse.json({ ok: false, error: "Enlace inválido." }, { status: 403 });
  const { projectId, nonce } = parsed;

  const ip = await clientIp();
  // Dos topes: por proyecto+IP (uso normal) y por proyecto a secas (frena una IP falsificada que
  // rotaría de bucket). Ambos por minuto.
  if (!rateLimit(`client-upload:${projectId}:${ip}`, 40, 60_000) || !rateLimit(`client-upload:${projectId}`, 120, 60_000)) {
    return NextResponse.json({ ok: false, error: "Demasiadas subidas seguidas. Espera un momento e inténtalo de nuevo." }, { status: 429 });
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, uploadDir: true, uploadNonce: true, uploadRevokedAt: true, uploadExpiresAt: true, archivedAt: true },
  });
  if (!project || project.archivedAt) return NextResponse.json({ ok: false, error: "El enlace ya no está disponible." }, { status: 404 });
  // El nonce del token debe coincidir con el vigente del proyecto: si se revocó (rota el nonce), una
  // URL filtrada antes deja de validar aunque su firma siga vigente.
  if (!project.uploadNonce || project.uploadNonce !== nonce || project.uploadRevokedAt) {
    return NextResponse.json({ ok: false, error: "El equipo revocó este enlace de subida." }, { status: 403 });
  }
  if (project.uploadExpiresAt && project.uploadExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "Este enlace de subida ha caducado." }, { status: 403 });
  }

  // El cliente envía nombre y su nombre codificados (encodeURIComponent) porque las cabeceras HTTP
  // no admiten no-ASCII de forma fiable; los decodificamos aquí (con respaldo).
  const hdr = (v: string | null): string => {
    if (!v) return "";
    try { return decodeURIComponent(v); } catch { return v; }
  };
  const rawName = hdr(req.headers.get("x-filename")).trim().slice(0, 200);
  const uploaderName = hdr(req.headers.get("x-uploader")).trim().slice(0, 80) || null;
  if (!rawName || !isAllowedClientUpload(rawName)) {
    return NextResponse.json({ ok: false, error: "Solo se permiten imágenes (JPG, PNG, WebP, GIF) o video (MP4, MOV, WebM)." }, { status: 400 });
  }
  const declared = Number(req.headers.get("content-length") || "0");
  if (declared && declared > MAX_CLIENT_UPLOAD) {
    return NextResponse.json({ ok: false, error: "El archivo supera el límite de 200 MB." }, { status: 413 });
  }

  let buf: Buffer;
  try {
    buf = await readBodyWithLimit(req.body, MAX_CLIENT_UPLOAD);
  } catch (e) {
    if (e instanceof UploadTooLargeError) return NextResponse.json({ ok: false, error: e.message }, { status: 413 });
    return NextResponse.json({ ok: false, error: "No se pudo recibir el archivo. Inténtalo de nuevo." }, { status: 400 });
  }
  if (buf.length === 0) return NextResponse.json({ ok: false, error: "El archivo llegó vacío." }, { status: 400 });

  // Carpeta «Material del cliente» del proyecto. Las subidas van EN PARALELO, así que la primera vez
  // varias requests intentan crearla a la vez: el unique (projectId,name) hace fallar a las demás
  // (P2002) y las recuperamos con un segundo findFirst.
  let folder = await db.projectFolder.findFirst({ where: { projectId, name: CLIENT_FOLDER }, select: { id: true } });
  if (!folder) {
    try {
      folder = await db.projectFolder.create({ data: { projectId, name: CLIENT_FOLDER }, select: { id: true } });
    } catch {
      folder = await db.projectFolder.findFirst({ where: { projectId, name: CLIENT_FOLDER }, select: { id: true } });
    }
  }
  if (!folder) return NextResponse.json({ ok: false, error: "No se pudo preparar la carpeta. Inténtalo de nuevo." }, { status: 500 });

  const relDir = projectUploadRelDir(project);
  const mime = mimeFor(rawName);
  const asset = await db.fileAsset.create({
    data: { projectId, name: rawName, kind: "LOCAL", path: "", mime, size: buf.length, folderId: folder.id, viaClientLink: true, uploaderName },
  });
  let rel: string | null = null;
  try {
    rel = isImageUpload(rawName)
      ? await saveBufferWithPreview(relDir, `${asset.id}-${rawName}`, buf, mime)
      : await saveBuffer(relDir, `${asset.id}-${rawName}`, buf);
    await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });
  } catch (e) {
    // No dejar ni fila fantasma (sin archivo) ni bytes huérfanos (sin fila) si algo falla a medias.
    await db.fileAsset.delete({ where: { id: asset.id } }).catch(() => {});
    if (rel) {
      await deleteRel(rel).catch(() => {});
      await deleteRel(previewRel(rel)).catch(() => {});
    }
    console.error("[upload] guardar material del cliente falló:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "No se pudo guardar el archivo. Inténtalo de nuevo." }, { status: 500 });
  }

  // Aviso al equipo (in-app), con tope de 1 cada 10 min por proyecto para que una tanda de archivos
  // no dispare una avalancha. logActivity resuelve la audiencia del equipo del proyecto.
  if (rateLimit(`client-upload-notify:${projectId}`, 1, 10 * 60_000)) {
    await logActivity({
      action: "file.client_upload",
      summary: `subió material al proyecto «${project.name}»`,
      projectId,
      entityType: "file",
      entityId: asset.id,
      actorName: `${uploaderName ?? "El cliente"} (cliente)`,
    });
  }

  return NextResponse.json({ ok: true, id: asset.id, name: rawName });
}
