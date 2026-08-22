import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { saveBuffer, deleteRel, mimeFor } from "@/lib/storage";
import { saveBufferWithPreview, previewRel } from "@/lib/image";
import { rateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity";
import { writeGaleria, galeriaEnabled } from "@/lib/nas-galeria";
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

type RouteCtx = { params: Promise<{ projectId: string }> };

// Misma carpeta donde agrupa el enlace público: el material del cliente vive junto, venga del
// portal o del enlace.
const CLIENT_FOLDER = "Material del cliente";

// POST /api/materiales/:projectId — subida de material desde el PORTAL AUTENTICADO del cliente.
// Es la hermana con sesión del enlace público /api/upload/[token]: escribe EXACTAMENTE al mismo
// sitio (la carpeta «Material del cliente» del proyecto, o su carpeta de galería si el equipo la
// fijó) y con las MISMAS validaciones de tipo y tamaño. La diferencia es la autorización: aquí no
// hay token ni nonce — basta con estar en sesión y ser MIEMBRO del proyecto. El destino es fijo:
// el cliente nunca elige la ruta, así que esto NO concede escritura libre al NAS (no toca el
// permiso escribir_discos), solo deja dejar material en su propio proyecto.
export async function POST(req: NextRequest, routeCtx: unknown) {
  const { projectId } = await (routeCtx as RouteCtx).params;
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Inicia sesión para subir material." }, { status: 401 });

  // Pertenencia real al proyecto (líder o miembro). NO por rol ni por permiso de discos: subir a la
  // carpeta de material del propio proyecto es un derecho del participante, con destino fijo.
  const project = await db.project.findFirst({
    where: { id: projectId, OR: [{ leadId: session.id }, { members: { some: { userId: session.id } } }] },
    select: { id: true, name: true, uploadDir: true, uploadGaleriaFolder: true, archivedAt: true, finishedAt: true },
  });
  if (!project) return NextResponse.json({ ok: false, error: "No tienes acceso a este proyecto." }, { status: 403 });
  // Papelera o terminado: no se acepta material nuevo (igual que el enlace público).
  if (project.archivedAt || project.finishedAt) {
    return NextResponse.json({ ok: false, error: "Este proyecto ya no admite material nuevo." }, { status: 409 });
  }

  // Tope por usuario+proyecto y por proyecto (una tanda de archivos no debe saturar el NAS).
  if (!rateLimit(`mat-upload:${projectId}:${session.id}`, 40, 60_000) || !rateLimit(`mat-upload:${projectId}`, 120, 60_000)) {
    return NextResponse.json({ ok: false, error: "Demasiadas subidas seguidas. Espera un momento e inténtalo de nuevo." }, { status: 429 });
  }

  const hdr = (v: string | null): string => {
    if (!v) return "";
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const rawName = hdr(req.headers.get("x-filename")).trim().slice(0, 200);
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

  // Carpeta «Material del cliente» del proyecto (idempotente ante subidas en paralelo: el unique
  // (projectId,name) hace fallar a las carreras y las recuperamos con un segundo findFirst).
  let folder = await db.projectFolder.findFirst({ where: { projectId, name: CLIENT_FOLDER }, select: { id: true } });
  if (!folder) {
    try {
      folder = await db.projectFolder.create({ data: { projectId, name: CLIENT_FOLDER }, select: { id: true } });
    } catch {
      folder = await db.projectFolder.findFirst({ where: { projectId, name: CLIENT_FOLDER }, select: { id: true } });
    }
  }
  if (!folder) return NextResponse.json({ ok: false, error: "No se pudo preparar la carpeta. Inténtalo de nuevo." }, { status: 500 });

  // Dónde caen los bytes: si el equipo fijó una carpeta de la GALERÍA, se escribe VIVO ahí (kind
  // GALERIA, visible por SMB al instante); si no, al disco de la app (kind LOCAL). La carpeta de
  // galería se validó al guardarla (relPerteneceAlClienteOProyecto), así que no apunta fuera.
  const aGaleria = !!project.uploadGaleriaFolder && galeriaEnabled();
  const relDir = projectUploadRelDir(project);
  const mime = mimeFor(rawName);
  const asset = await db.fileAsset.create({
    data: { projectId, name: rawName, kind: aGaleria ? "GALERIA" : "LOCAL", path: "", mime, size: buf.length, folderId: folder.id, viaClientLink: true, uploaderName: session.name },
  });
  let rel: string | null = null;
  let enGaleria = false;
  try {
    if (aGaleria) {
      rel = await writeGaleria(project.uploadGaleriaFolder as string, rawName, buf);
      enGaleria = true;
    } else {
      rel = isImageUpload(rawName)
        ? await saveBufferWithPreview(relDir, `${asset.id}-${rawName}`, buf, mime)
        : await saveBuffer(relDir, `${asset.id}-${rawName}`, buf);
    }
    const nombreFinal = enGaleria ? rel.slice(rel.lastIndexOf("/") + 1) : rawName;
    await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel, name: nombreFinal } });
  } catch (e) {
    await db.fileAsset.delete({ where: { id: asset.id } }).catch(() => {});
    if (rel && !enGaleria) {
      await deleteRel(rel).catch(() => {});
      await deleteRel(previewRel(rel)).catch(() => {});
    }
    console.error("[materiales] guardar material del cliente falló:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { ok: false, error: aGaleria ? "No se pudo guardar en el disco del equipo. Avísanos e inténtalo en un rato." : "No se pudo guardar el archivo. Inténtalo de nuevo." },
      { status: 500 },
    );
  }

  // Aviso al equipo (in-app), con tope de 1 cada 10 min por proyecto para no disparar una avalancha.
  if (rateLimit(`mat-upload-notify:${projectId}`, 1, 10 * 60_000)) {
    // logActivity toma el actor de la sesión (el cliente) automáticamente; avisa al equipo del
    // proyecto sin notificarse a sí mismo.
    await logActivity({
      action: "file.client_upload",
      summary: `subió material al proyecto «${project.name}»`,
      projectId,
      entityType: "file",
      entityId: asset.id,
    });
  }

  return NextResponse.json({ ok: true, id: asset.id, name: rawName });
}
