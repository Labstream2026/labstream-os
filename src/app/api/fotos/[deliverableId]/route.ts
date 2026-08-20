import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canWriteProject } from "@/lib/project-access";
import { mimeFor, writeRelBuffer } from "@/lib/storage";
import { saveBufferWithPreview, isOptimizableImage, optimizeToWebp } from "@/lib/image";
import { createOpsFolder, opsReady, opsThumb, writeOps } from "@/lib/nas-ops";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Subida de fotos a un set (una foto por petición) ──
// El uploader del estudio manda la CARPETA completa, pero cada foto viaja en su propia petición:
// así hay barra de progreso real (XHR), reintento por archivo y ningún tope de cantidad — la
// server action de antes metía toda la sesión en UN body de máx. 100 MB y moría sin decir cuál
// foto falló. La sección llega del nombre de la subcarpeta (el equipo organiza en el Finder y la
// galería sale organizada sola).
//
// `position` la manda el cliente (índice dentro de su cola + total previo): tres subidas en
// paralelo leerían el mismo max(position) y quedarían empatadas; el índice del cliente conserva
// el orden EXACTO del folder. Empates entre dos personas subiendo a la vez se desempatan por
// createdAt en las consultas.

const BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|scr|pif|cpl|jar|js|vbs|ps1|sh|app|dmg|deb|rpm)$/i;
const MAX_UPLOAD = 100 * 1024 * 1024; // 100 MB por foto (coincide con bodySizeLimit)

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
  archivedAt: true,
  finishedAt: true,
} as const;

export async function POST(req: NextRequest, ctx: { params: Promise<{ deliverableId: string }> }) {
  const { deliverableId } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  if (!hasPermission(session, "subir_archivos")) return NextResponse.json({ error: "Sin permiso para subir archivos" }, { status: 403 });

  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { id: true, name: true, type: true, projectId: true, photosOpsFolder: true, project: { select: accessSelect } },
  });
  if (!deliverable || deliverable.type !== "FOTOGRAFIA") return NextResponse.json({ error: "Set no encontrado" }, { status: 404 });
  // Proyecto dormido (papelera/terminado) o sin escritura: mismas puertas que las server actions.
  if (deliverable.project.archivedAt || deliverable.project.finishedAt) return NextResponse.json({ error: "El proyecto no admite cambios" }, { status: 403 });
  if (!canWriteProject(deliverable.project, session)) return NextResponse.json({ error: "Sin acceso al proyecto" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (file.size > MAX_UPLOAD) return NextResponse.json({ error: "La foto pasa de 100 MB" }, { status: 413 });
  if (BLOCKED_EXT.test(file.name) || !isOptimizableImage(file.name, file.type)) {
    return NextResponse.json({ error: "Solo imágenes (JPG, PNG, WebP, HEIC…)" }, { status: 415 });
  }
  const section = String(form.get("section") ?? "").trim().slice(0, 80) || null;
  const posRaw = Number(form.get("position"));
  const position = Number.isFinite(posRaw) && posRaw >= 0 ? Math.floor(posRaw) : 0;

  const buf = Buffer.from(await file.arrayBuffer());

  // Dimensiones para la cuadrícula justificada. La orientación EXIF puede voltear el marco:
  // si la foto viene rotada 90°, el ancho real es el alto declarado.
  let width: number | null = null;
  let height: number | null = null;
  try {
    const meta = await sharp(buf).metadata();
    const flipped = typeof meta.orientation === "number" && meta.orientation >= 5;
    width = (flipped ? meta.height : meta.width) ?? null;
    height = (flipped ? meta.width : meta.height) ?? null;
  } catch {
    /* sin dimensiones la galería usa una proporción de respaldo */
  }

  // ── Dónde VIVE el original ──
  // Set con carpeta de Operaciones_LAB: el original cae AL DISCO (sección = subcarpeta, así la
  // share queda organizada igual que la galería) y el registro es kind OPS. El servidor solo
  // guarda miniaturas en su caché interna — a la share no se le escribe nada auxiliar.
  // Sin carpeta: al disco de la app, como siempre.
  let asset: { id: string };
  if (deliverable.photosOpsFolder) {
    if (!(await opsReady())) {
      return NextResponse.json({ error: "El disco Operaciones_LAB no responde. Las fotos de este set viven allá: revisa el montaje y vuelve a intentar." }, { status: 503 });
    }
    let destDir = deliverable.photosOpsFolder;
    if (section) destDir = await createOpsFolder(deliverable.photosOpsFolder, section); // idempotente (EEXIST se traga)
    const rel = await writeOps(destDir, file.name, buf);
    asset = await db.fileAsset.create({
      data: { projectId: deliverable.projectId, name: file.name, kind: "OPS", path: rel, mime: mimeFor(file.name, file.type), size: buf.length, uploadedById: session.id },
      select: { id: true },
    });
    // Calienta las DOS miniaturas (cuadrícula 480 y visor 1600) ya mismo: si no, el primer
    // cliente en abrir la galería paga la fabricación de todas. Mejor esfuerzo, sin bloquear.
    void opsThumb(rel, 480).catch(() => {});
    void opsThumb(rel, 1600).catch(() => {});
  } else {
    const creado = await db.fileAsset.create({
      data: { projectId: deliverable.projectId, name: file.name, kind: "LOCAL", path: "", mime: mimeFor(file.name, file.type), size: buf.length, uploadedById: session.id },
      select: { id: true },
    });
    const rel = await saveBufferWithPreview(`project/${deliverable.projectId}/fotos`, `${creado.id}-${file.name}`, buf, file.type);
    await db.fileAsset.update({ where: { id: creado.id }, data: { path: rel } });
    // La mini de 480 para la cuadrícula, fabricada del buffer que ya está en la mano.
    void optimizeToWebp(buf, { maxEdge: 480 })
      .then((mini) => (mini ? writeRelBuffer(`thumbs-local/${creado.id}.webp`, mini) : null))
      .catch(() => {});
    asset = creado;
  }
  const photo = await db.deliverablePhoto.create({
    data: { deliverableId, fileAssetId: asset.id, filename: file.name, position, section, width, height },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: photo.id });
}

// Al terminar la cola, el uploader avisa UNA vez cuántas subió: una línea de actividad por foto
// serían cientos de renglones de ruido para una sesión normal.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ deliverableId: string }> }) {
  const { deliverableId } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { name: true, projectId: true, project: { select: accessSelect } },
  });
  if (!deliverable || !canWriteProject(deliverable.project, session)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { added } = (await req.json().catch(() => ({}))) as { added?: number };
  const n = Number(added);
  if (Number.isFinite(n) && n > 0) {
    await logActivity({
      action: "deliverable.photos",
      summary: `añadió ${Math.floor(n)} foto(s) al set «${deliverable.name}»`,
      projectId: deliverable.projectId,
      entityType: "deliverable",
      entityId: deliverableId,
    });
  }
  return NextResponse.json({ ok: true });
}
