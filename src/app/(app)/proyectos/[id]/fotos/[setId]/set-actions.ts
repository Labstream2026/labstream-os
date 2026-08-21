"use server";

import sharp from "sharp";
import { noAutorizado } from "@/lib/authz-error";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canManageProject, canWriteProject } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";
import { notifyManyAndEmail, type NotifyInput } from "@/lib/notify";
import { closeDeliverableAutoTasks, createDeliverableAutoTask, createReviewTasksForReviewers, AUTO_TASK_PREFIX } from "@/lib/deliverable-tasks";
import { listOps, normalizeOpsRel, opsReady, opsThumb, readOps, statOps } from "@/lib/nas-ops";
import { isOptimizableImage } from "@/lib/image";
import { mimeFor } from "@/lib/storage";
import type { SessionUser } from "@/lib/session";

// ── Acciones del ESTUDIO de un set de fotos ──
// Separadas de actions.ts (enorme y compartido entre sesiones) igual que covers-actions.ts.
// Aquí vive la curaduría (qué pasa al cliente), la organización (secciones, portada) y los dos
// caminos de salida del set: revisión interna o directo al cliente — la MISMA dinámica de los
// videos, sin versiones porque un set no las tiene (la "versión" es el conjunto curado).

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
  archivedAt: true,
  finishedAt: true,
} as const;

type SetConProyecto = {
  id: string;
  name: string;
  status: string;
  type: string;
  projectId: string;
  photosOpsFolder: string | null;
  reviewerId: string | null;
  ownerId: string | null;
  reviewers: { userId: string }[];
  project: { leadId: string | null; name: string } & Record<string, unknown>;
};

// Carga el set y verifica el nivel pedido. El projectId REAL sale del set (no se confía en el
// que mande el navegador). «escribir» = organizar (secciones, portada); «gestionar» = decidir
// qué ve el cliente y mandárselo (curaduría y envíos), el mismo listón que compartir enlaces.
async function ensureSet(setId: string, nivel: "escribir" | "gestionar"): Promise<{ session: SessionUser; set: SetConProyecto }> {
  const session = await getSession();
  const set = await db.deliverable.findUnique({
    where: { id: setId },
    select: {
      id: true, name: true, status: true, projectId: true, reviewerId: true, ownerId: true,
      reviewers: { select: { userId: true } },
      type: true,
      photosOpsFolder: true,
      project: { select: { ...accessSelect, name: true } },
    },
  });
  if (!set || set.type !== "FOTOGRAFIA") noAutorizado();
  if (set.project.archivedAt || set.project.finishedAt) noAutorizado();
  const ok = nivel === "gestionar" ? canManageProject(set.project, session) : canWriteProject(set.project, session);
  if (!ok) noAutorizado();
  return { session: session!, set: set as unknown as SetConProyecto };
}

function refresh(projectId: string, setId: string) {
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath(`/proyectos/${projectId}/fotos/${setId}`);
}

// Cuántas fotos verá el cliente (las no excluidas por la curaduría).
async function visiblesDe(setId: string): Promise<number> {
  return db.deliverablePhoto.count({ where: { deliverableId: setId, excludedAt: null } });
}

// A quién avisar/asignar del lado del equipo: revisores del set, o el responsable del proyecto.
function revisoresDe(set: SetConProyecto): string[] {
  const ids = new Set<string>(set.reviewers.map((r) => r.userId));
  if (set.reviewerId) ids.add(set.reviewerId);
  if (ids.size === 0 && set.project.leadId) ids.add(set.project.leadId);
  return [...ids];
}

export type ResultadoSet = { ok: boolean; message?: string };

// ── Curaduría: la foto entra o no entra en lo que ve el cliente ──
export async function toggleFotoExcluida(photoId: string): Promise<{ ok: boolean; excluded?: boolean }> {
  const photo = await db.deliverablePhoto.findUnique({
    where: { id: photoId },
    select: { excludedAt: true, deliverableId: true },
  });
  if (!photo) noAutorizado();
  const { set } = await ensureSet(photo.deliverableId, "gestionar");
  const excluded = !photo.excludedAt;
  await db.deliverablePhoto.update({ where: { id: photoId }, data: { excludedAt: excluded ? new Date() : null } });
  refresh(set.projectId, set.id);
  return { ok: true, excluded };
}

// ── Organización: sección de una foto (o quitarla con null/vacío) ──
export async function fijarSeccionFoto(photoId: string, section: string | null): Promise<ResultadoSet> {
  const photo = await db.deliverablePhoto.findUnique({ where: { id: photoId }, select: { deliverableId: true } });
  if (!photo) noAutorizado();
  const { set } = await ensureSet(photo.deliverableId, "escribir");
  const clean = (section ?? "").trim().slice(0, 80) || null;
  await db.deliverablePhoto.update({ where: { id: photoId }, data: { section: clean } });
  refresh(set.projectId, set.id);
  return { ok: true };
}

// Renombrar una sección completa (todas sus fotos de una vez).
export async function renombrarSeccion(setId: string, de: string, a: string): Promise<ResultadoSet> {
  const { set } = await ensureSet(setId, "escribir");
  const nuevo = a.trim().slice(0, 80);
  if (!nuevo) return { ok: false, message: "Ponle nombre a la sección." };
  await db.deliverablePhoto.updateMany({ where: { deliverableId: setId, section: de }, data: { section: nuevo } });
  refresh(set.projectId, set.id);
  return { ok: true };
}

// ── Portada del set: la foto que recibe al cliente en el héroe de su galería ──
// Reutiliza Deliverable.coverFileAssetId (el mismo campo de la portada de los reels).
export async function hacerPortadaSet(photoId: string): Promise<ResultadoSet> {
  const photo = await db.deliverablePhoto.findUnique({ where: { id: photoId }, select: { deliverableId: true, fileAssetId: true } });
  if (!photo) noAutorizado();
  if (!photo.fileAssetId) return { ok: false, message: "Solo una foto subida al NAS puede ser portada (las de Drive no)." };
  const { set } = await ensureSet(photo.deliverableId, "escribir");
  await db.deliverable.update({ where: { id: set.id }, data: { coverFileAssetId: photo.fileAssetId } });
  refresh(set.projectId, set.id);
  return { ok: true };
}

// Borra una foto del set. LOCAL: también su archivo del disco de la app. OPS: SOLO el registro —
// el original sigue en Operaciones_LAB intacto (la app no borra nada de la share desde aquí;
// para eso está el explorador /operaciones con su papelera #recycle).
export async function borrarFotoSet(photoId: string): Promise<ResultadoSet> {
  const photo = await db.deliverablePhoto.findUnique({
    where: { id: photoId },
    select: { deliverableId: true, fileAssetId: true, fileAsset: { select: { kind: true } } },
  });
  if (!photo) noAutorizado();
  const { set } = await ensureSet(photo.deliverableId, "gestionar");
  await db.deliverablePhoto.delete({ where: { id: photoId } });
  if (photo.fileAssetId) await db.fileAsset.delete({ where: { id: photo.fileAssetId } }).catch(() => {});
  refresh(set.projectId, set.id);
  return { ok: true, message: photo.fileAsset?.kind === "OPS" ? "Quitada del set. El archivo sigue en Operaciones_LAB." : undefined };
}

// ── La carpeta del set en Operaciones_LAB ──
// Vincular una carpeta hace dos cosas: las SUBIDAS del estudio caen allá (sección = subcarpeta)
// y se puede IMPORTAR lo que la carpeta ya tenga. null = volver al disco de la app.
export async function fijarCarpetaOpsSet(setId: string, rel: string | null): Promise<ResultadoSet> {
  const { set } = await ensureSet(setId, "gestionar");
  if (rel === null || !rel.trim()) {
    await db.deliverable.update({ where: { id: setId }, data: { photosOpsFolder: null } });
    refresh(set.projectId, setId);
    return { ok: true, message: "Las próximas subidas van al disco de la app." };
  }
  let norm: string;
  try {
    norm = normalizeOpsRel(rel);
  } catch {
    return { ok: false, message: "Ruta inválida." };
  }
  if (!norm) return { ok: false, message: "Elige una carpeta, no la raíz del disco." };
  const st = await statOps(norm).catch(() => null);
  if (!st?.dir) return { ok: false, message: "Esa carpeta no está en el disco (¿la movieron por SMB?)." };
  await db.deliverable.update({ where: { id: setId }, data: { photosOpsFolder: norm } });
  await logActivity({
    action: "deliverable.photos",
    summary: `vinculó el set «${set.name}» a la carpeta «${norm}» de Operaciones_LAB`,
    projectId: set.projectId,
    entityType: "deliverable",
    entityId: setId,
  });
  refresh(set.projectId, setId);
  return { ok: true, message: "Carpeta vinculada. Sube fotos o importa las que ya están allí." };
}

// Trae al set las fotos que YA viven en la carpeta vinculada (y en sus subcarpetas de primer
// nivel, que entran como secciones). Idempotente por ruta: correrlo dos veces no duplica.
// Las dimensiones y miniaturas se completan en segundo plano — la galería mientras tanto
// asume 3:2 y se corrige sola al cargar cada imagen.
const TOPE_IMPORT = 800;

export async function importarCarpetaOps(setId: string): Promise<ResultadoSet> {
  const { session, set } = await ensureSet(setId, "escribir");
  if (!hasPermission(session, "subir_archivos")) noAutorizado();
  const folder = set.photosOpsFolder;
  if (!folder) return { ok: false, message: "Primero vincula la carpeta del disco." };
  if (!(await opsReady())) return { ok: false, message: "El disco Operaciones_LAB no responde. Revisa el montaje." };

  // Cosecha: archivos de la raíz (sin sección) + subcarpetas de primer nivel (cada una, sección).
  const lote: { rel: string; name: string; size: number | null; section: string | null }[] = [];
  const raiz = await listOps(folder);
  for (const f of raiz.files) if (isOptimizableImage(f.name)) lote.push({ rel: f.rel, name: f.name, size: f.size, section: null });
  for (const d of raiz.dirs) {
    if (lote.length >= TOPE_IMPORT) break;
    const sub = await listOps(d.rel).catch(() => null);
    if (!sub) continue;
    for (const f of sub.files) if (isOptimizableImage(f.name)) lote.push({ rel: f.rel, name: f.name, size: f.size, section: d.name });
  }
  // Idempotencia ANTES del tope: si el recorte fuera primero, «vuelve a importar» rebanaría
  // siempre las mismas 800 (ya importadas) y el resto no llegaría nunca.
  const previas = await db.deliverablePhoto.findMany({
    where: { deliverableId: setId, fileAsset: { kind: "OPS" } },
    select: { fileAsset: { select: { path: true } } },
  });
  const ya = new Set(previas.map((p) => p.fileAsset?.path).filter(Boolean));
  const pendientes = lote.filter((c) => !ya.has(c.rel));
  const recortado = pendientes.length > TOPE_IMPORT;
  const candidatos = pendientes.slice(0, TOPE_IMPORT);
  const saltadas = lote.length - pendientes.length;

  const last = await db.deliverablePhoto.findFirst({ where: { deliverableId: setId }, orderBy: { position: "desc" }, select: { position: true } });
  let pos = (last?.position ?? -1) + 1;
  const nuevas: { photoId: string; rel: string }[] = [];
  for (const c of candidatos) {
    const asset = await db.fileAsset.create({
      data: { projectId: set.projectId, name: c.name, kind: "OPS", path: c.rel, mime: mimeFor(c.name, null), size: c.size ?? 0, uploadedById: session.id },
      select: { id: true },
    });
    const photo = await db.deliverablePhoto.create({
      data: { deliverableId: setId, fileAssetId: asset.id, filename: c.name, position: pos++, section: c.section },
      select: { id: true },
    });
    nuevas.push({ photoId: photo.id, rel: c.rel });
  }

  if (nuevas.length) {
    await logActivity({
      action: "deliverable.photos",
      summary: `importó ${nuevas.length} foto(s) de «${folder}» (Operaciones_LAB) al set «${set.name}»`,
      projectId: set.projectId,
      entityType: "deliverable",
      entityId: setId,
    });
    // Calentado en SEGUNDO PLANO (mejor esfuerzo): dimensiones reales para la cuadrícula
    // justificada + las dos miniaturas de cada foto. Serializado — sharp ya corre con
    // concurrency(1) y este disco es un volumen local, pero no hay prisa: la galería
    // funciona sin esto y va afinándose sola.
    void (async () => {
      for (const n of nuevas) {
        try {
          const buf = await readOps(n.rel);
          const meta = await sharp(buf).metadata();
          const flipped = typeof meta.orientation === "number" && meta.orientation >= 5;
          const width = (flipped ? meta.height : meta.width) ?? null;
          const height = (flipped ? meta.width : meta.height) ?? null;
          if (width && height) await db.deliverablePhoto.update({ where: { id: n.photoId }, data: { width, height } });
          await opsThumb(n.rel, 480);
          await opsThumb(n.rel, 1600);
        } catch {
          /* una foto corrupta no frena a las demás */
        }
      }
    })().catch(() => {});
  }

  refresh(set.projectId, setId);
  return {
    ok: true,
    message:
      `Importadas ${nuevas.length} foto(s)` +
      (saltadas > 0 ? ` · ${saltadas} ya estaban` : "") +
      (recortado ? ` · quedan más de ${TOPE_IMPORT} pendientes: vuelve a importar para traer la siguiente tanda` : "") +
      ". Miniaturas y proporciones se terminan de afinar solas.",
  };
}

// ── Camino 1: revisión interna (otro par de ojos antes del cliente) ──
// El set pasa a REVISION_INTERNA y los revisores lo reciben en su bandeja /revisiones, con su
// tarea «Pre-aprobar…» — la misma coreografía de los videos.
export async function enviarSetARevision(setId: string): Promise<ResultadoSet> {
  const { session, set } = await ensureSet(setId, "gestionar");
  // Simétrico a la guarda `yaAbierto` de enviarSetAlCliente: REVISION_INTERNA no es un estado de
  // cara al cliente, así que mandar a revisión un set YA enviado le CERRARÍA el enlace al cliente.
  // La UI oculta el botón cuando el enlace está abierto, pero una pestaña vieja / doble clic no.
  if (["ENVIADO_CLIENTE", "CORRECCIONES", "APROBADO", "ENTREGADO"].includes(set.status)) {
    return { ok: false, message: "El set ya está de cara al cliente; no lo devuelvas a revisión interna sin querer. Retócalo y reenvíale el enlace si hace falta." };
  }
  const visibles = await visiblesDe(setId);
  if (visibles === 0) return { ok: false, message: "El set no tiene fotos que mostrar: sube fotos (o des-excluye alguna) antes de mandarlo a revisión." };
  await db.deliverable.update({ where: { id: setId }, data: { status: "REVISION_INTERNA" } });
  const revisores = revisoresDe(set).filter((id) => id !== session.id);
  // Sin otro par de ojos disponible (sin revisores y el responsable eres tú), el aviso sería
  // mentira: se dice claro en vez de prometer un aviso que no salió.
  const sinNadie = revisores.length === 0;
  if (revisores.length) {
    await notifyManyAndEmail(revisores, {
      type: "review",
      event: "internal_review",
      title: `Set de fotos para pre-aprobar: ${set.name}`,
      body: `${session.name} mandó a revisión el set «${set.name}» (${visibles} fotos) de «${set.project.name}». Revisa la galería tal como la verá el cliente.`,
      link: `/revisiones/${setId}`,
      actorId: session.id,
    } satisfies NotifyInput);
  }
  await createReviewTasksForReviewers({
    projectId: set.projectId,
    deliverableId: setId,
    title: `${AUTO_TASK_PREFIX.review} «${set.name}» · fotos`,
    description: `Revisa la galería del set (${visibles} fotos, tal como la verá el cliente) y pre-apruébala o pide cambios desde /revisiones.`,
    reviewerIds: revisoresDe(set).filter((id) => id !== session.id),
    actorId: session.id,
  });
  await logActivity({
    action: "deliverable.version",
    summary: `mandó el set «${set.name}» a pre-aprobación interna (${visibles} fotos)`,
    projectId: set.projectId,
    entityType: "deliverable",
    entityId: setId,
  });
  refresh(set.projectId, setId);
  return {
    ok: true,
    message: sinNadie
      ? "Set en revisión interna, pero no hay revisores asignados (y el responsable eres tú): asigna un revisor en la tarjeta del entregable, o decide tú desde /revisiones."
      : "Set en revisión interna. Los revisores ya tienen el aviso.",
  };
}

// ── Decisión del revisor interno sobre el set ──
// APROBADO → el set queda de cara al cliente (su enlace se abre) y se avisa al portal.
// CAMBIOS → vuelve a edición (el enlace del cliente NO se abre: sin la compuerta de versiones
// de los videos, dejarlo en CORRECCIONES expondría la galería sin pre-aprobar).
export async function decisionSetInterno(setId: string, result: "APROBADO" | "CAMBIOS", note?: string): Promise<ResultadoSet> {
  const session = await getSession();
  const set = await db.deliverable.findUnique({
    where: { id: setId },
    select: {
      id: true, name: true, status: true, projectId: true, reviewerId: true, ownerId: true, type: true,
      reviewers: { select: { userId: true } },
      project: { select: { ...accessSelect, name: true } },
    },
  });
  if (!set || set.type !== "FOTOGRAFIA") noAutorizado();
  // Proyecto dormido: no se decide sobre material archivado/terminado. ensureSet lo bloquea en el
  // resto del módulo; aquí el findUnique es aparte, así que se repite la puerta.
  if (set.project.archivedAt || set.project.finishedAt) noAutorizado();
  const puedeDecidir =
    // Igual que internalDecision de los videos: el gestor necesita ADEMÁS aprobar_entregables (la
    // UI ya lo exige para pintar el botón; sin esto, un gestor sin el permiso podría decidir
    // llamando el action directo). Un revisor asignado siempre puede, por definición del encargo.
    (canManageProject(set.project, session) && hasPermission(session, "aprobar_entregables")) ||
    set.reviewerId === session!.id ||
    set.reviewers.some((r) => r.userId === session!.id);
  if (!puedeDecidir) return { ok: false, message: "Solo un revisor asignado, o el responsable con permiso para aprobar, puede decidir." };
  // Blindaje contra invocación OBSOLETA (pestaña vieja / doble clic): solo se decide desde
  // REVISION_INTERNA. Sin esto, un «cambios» sobre un set que el cliente YA aprobó lo tiraría a
  // edición (cerrando su enlace), y un «aprobado» re-dispararía avisos y recrearía la tarea de
  // entrega. Mismo patrón «estado obsoleto» que internalDecision de los videos.
  if (set.status !== "REVISION_INTERNA") {
    return { ok: false, message: "El set ya no está en revisión interna (alguien decidió antes, o el cliente ya lo tiene). Recarga la página." };
  }

  const aprobado = result === "APROBADO";
  await db.deliverableDecision.create({
    data: { deliverableId: setId, versionNumber: null, stage: "INTERNA", result, byUserId: session!.id, note: note?.slice(0, 1000) || null },
  });

  const responsable = set.ownerId ?? set.project.leadId;
  if (aprobado) {
    await db.deliverable.update({ where: { id: setId }, data: { status: "ENVIADO_CLIENTE" } });
    await closeDeliverableAutoTasks(setId, ["review"]);
    await notifyProjectClients(set.projectId, {
      type: "review",
      event: "client_deliverable_ready",
      title: `Tus fotos están listas: ${set.name}`,
      body: `El equipo terminó la galería «${set.name}» en «${set.project.name}». Entra a elegir tus favoritas y dejar comentarios.`,
      link: `/mis-entregas/${set.projectId}`,
      actorId: session!.id,
    });
    if (responsable) {
      await createDeliverableAutoTask({
        projectId: set.projectId,
        deliverableId: setId,
        title: `${AUTO_TASK_PREFIX.deliver} «${set.name}» (fotos pre-aprobadas)`,
        description: "La galería quedó pre-aprobada y de cara al cliente. Mándale el enlace (correo o WhatsApp) desde el estudio del set. Cuando el cliente decida, esta tarea se completa sola.",
        assigneeId: responsable,
        actorId: session!.id,
      });
    }
  } else {
    await db.deliverable.update({ where: { id: setId }, data: { status: "EN_EDICION" } });
    await closeDeliverableAutoTasks(setId, ["review"], { assigneeId: session!.id });
    if (responsable) {
      await createDeliverableAutoTask({
        projectId: set.projectId,
        deliverableId: setId,
        title: `${AUTO_TASK_PREFIX.fix} «${set.name}» · fotos`,
        description: `Ajusta el set según lo pedido${note ? `: ${note.slice(0, 300)}` : ""}. Al mandarlo de nuevo a revisión, esta tarea se completa sola.`,
        assigneeId: responsable,
        actorId: session!.id,
      });
      await notifyManyAndEmail([responsable].filter((id) => id !== session!.id), {
        type: "review",
        event: "internal_review",
        title: `Cambios en el set: ${set.name}`,
        body: `${session!.name} pidió cambios en la galería «${set.name}»${note ? `: ${note.slice(0, 200)}` : "."}`,
        link: `/proyectos/${set.projectId}/fotos/${setId}`,
        actorId: session!.id,
      });
    }
  }
  await logActivity({
    action: "deliverable.preapproval",
    summary: aprobado ? `pre-aprobó el set de fotos «${set.name}»` : `pidió cambios en el set de fotos «${set.name}»`,
    projectId: set.projectId,
    entityType: "deliverable",
    entityId: setId,
  });
  refresh(set.projectId, setId);
  revalidatePath(`/revisiones/${setId}`);
  return { ok: true, message: aprobado ? "Set pre-aprobado: el enlace del cliente ya está activo." : "Cambios pedidos. El responsable recibió la tarea." };
}

// ── Camino 2: directo al cliente (sin pre-aprobación interna) ──
export async function enviarSetAlCliente(setId: string): Promise<ResultadoSet> {
  const { session, set } = await ensureSet(setId, "gestionar");
  const visibles = await visiblesDe(setId);
  if (visibles === 0) return { ok: false, message: "El set no tiene fotos que mostrar: sube fotos (o des-excluye alguna) antes de mandarlo." };
  const yaAbierto = ["ENVIADO_CLIENTE", "CORRECCIONES", "APROBADO", "ENTREGADO"].includes(set.status);
  if (!yaAbierto) {
    await db.deliverable.update({ where: { id: setId }, data: { status: "ENVIADO_CLIENTE" } });
    await closeDeliverableAutoTasks(setId, ["review"]);
    await notifyProjectClients(set.projectId, {
      type: "review",
      event: "client_deliverable_ready",
      title: `Tus fotos están listas: ${set.name}`,
      body: `El equipo publicó la galería «${set.name}» en «${set.project.name}». Entra a elegir tus favoritas y dejar comentarios.`,
      link: `/mis-entregas/${set.projectId}`,
      actorId: session.id,
    });
    await logActivity({
      action: "deliverable.version",
      summary: `liberó el set «${set.name}» directo al cliente (${visibles} fotos)`,
      projectId: set.projectId,
      entityType: "deliverable",
      entityId: setId,
    });
  }
  refresh(set.projectId, setId);
  return { ok: true, message: yaAbierto ? "El enlace del cliente ya estaba activo." : "Enlace del cliente activo. Ahora mándaselo por correo o WhatsApp." };
}

// Aviso a los miembros-cliente del proyecto (misma mecánica que actions.ts, local a este módulo).
async function notifyProjectClients(projectId: string, n: NotifyInput) {
  const members = await db.projectMember.findMany({
    where: { projectId, user: { role: { key: "cliente" } } },
    select: { userId: true },
  });
  if (members.length) await notifyManyAndEmail(members.map((m) => m.userId), n);
}
