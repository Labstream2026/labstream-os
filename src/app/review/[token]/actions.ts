"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { signReviewToken, verifyReviewToken } from "@/lib/review-token";
import { isEmailEnabled, sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";
import { notifyManyAndEmail } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { closeDeliverableAutoTasks, createDeliverableAutoTask, autoTaskTitles } from "@/lib/deliverable-tasks";
import { defaultFixDeadline } from "@/lib/business-time";
import { formatBogota } from "@/lib/bogota-time";

function baseUrl() {
  return (process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "");
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Si quien visita la sala tiene SESIÓN de usuario invitado (rol "cliente") y es MIEMBRO del
// proyecto del entregable, devolvemos su sesión: eso "eleva" el portal para él (comentarios
// atribuidos a su usuario, doble botón pre-aprobar/aprobar, y reabrir un aprobado). Un visitante
// por enlace público (sin sesión, p. ej. el cliente FINAL) devuelve null y usa la sala normal.
async function sessionMember(projectId: string) {
  const session = await getSession();
  if (!session || session.role !== "cliente") return null;
  const m = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: session.id } },
    select: { userId: true },
  });
  return m ? session : null;
}

// Construye una clave de rate-limit a partir del token (autorización del portal) y, si está
// disponible, la IP del cliente. Así un token filtrado no puede usarse para inundar la BD
// ni spamear al equipo.
async function rlKey(token: string): Promise<string> {
  let ip = "";
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "";
  } catch {
    /* headers() no disponible: usamos solo el token */
  }
  return `${token}:${ip}`;
}

// Equipo del proyecto a avisar (responsable + miembros) cuando el cliente actúa.
async function projectTeamIds(projectId: string): Promise<string[]> {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { leadId: true, members: { select: { userId: true } } } });
  if (!p) return [];
  return [p.leadId, ...p.members.map((m) => m.userId)].filter((id): id is string => Boolean(id));
}

// Acciones del portal PÚBLICO de revisión. La autorización es el token firmado
// (no hay sesión); el deliverableId siempre se deriva del token, nunca del cliente.

// Estados en los que la pieza está DE CARA AL CLIENTE. Fuera de ellos (en producción, edición o
// revisión interna) el portal no muestra material ni acepta acciones, aunque el enlace siga vivo.
const CLIENT_STATES = new Set(["ENVIADO_CLIENTE", "CORRECCIONES", "APROBADO", "ENTREGADO"]);

// Comprueba que el entregable existe, su enlace no está revocado y su estado es de cliente.
async function resolveDeliverable(token: string) {
  const deliverableId = verifyReviewToken(token);
  if (!deliverableId) throw new Error("Enlace inválido");
  const d = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { id: true, name: true, projectId: true, status: true, reviewRevokedAt: true, reviewExpiresAt: true } });
  if (!d || d.reviewRevokedAt) throw new Error("El enlace de revisión ya no está disponible");
  if (d.reviewExpiresAt && d.reviewExpiresAt.getTime() < Date.now()) throw new Error("El enlace de revisión ha caducado");
  if (!CLIENT_STATES.has(d.status)) throw new Error("El material está en revisión interna del equipo. Vuelve cuando te avisen.");
  return d;
}

export async function addReviewComment(token: string, formData: FormData) {
  // Comentar es lo más abusable (escribe en BD + avisa al equipo): límite más estricto.
  if (!rateLimit(`review-comment:${await rlKey(token)}`, 10, 60_000)) {
    throw new Error("Demasiados comentarios seguidos. Espera un momento e inténtalo de nuevo.");
  }
  const { id: deliverableId, name, projectId } = await resolveDeliverable(token);

  // Si es un usuario invitado con sesión (cliente miembro), su comentario queda atribuido a su
  // usuario (nombre real + authorUserId), como el de cualquiera de la organización.
  const inviter = await sessionMember(projectId);
  const authorName = inviter?.name ?? (String(formData.get("authorName") ?? "").trim().slice(0, 80) || "Cliente");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const tcRaw = String(formData.get("timecode") ?? "").trim();
  const versionRaw = String(formData.get("versionNumber") ?? "").trim();
  const drawingRaw = String(formData.get("drawingData") ?? "").trim();
  // Nota general: comentario suelto, sin captura ni timecode (sección «Notas»).
  const isNote = formData.get("isNote") === "true" || formData.get("isNote") === "on";
  // Un comentario debe tener texto o un dibujo (anotación).
  if (!body && !drawingRaw) return;

  let drawingData: unknown = undefined;
  if (drawingRaw) {
    try {
      const parsed = JSON.parse(drawingRaw);
      // Límite de tamaño defensivo (captura + trazos) para no abusar de la BD. El cliente
      // (composite()) ya recomprime el fotograma para caber bajo este tope, así que en la
      // práctica no se descarta ninguna captura legítima; solo frena un abuso real.
      if (drawingRaw.length <= 500_000) {
        // El dibujo se renderiza luego como <img src={drawingData.image}> en la sesión
        // del equipo. Solo aceptamos imágenes data: (png/jpeg/webp); cualquier otro
        // esquema (http(s):, javascript:, …) se descarta para evitar balizas de rastreo
        // o cargas externas que se disparen en la sesión interna del staff.
        if (parsed && typeof parsed === "object" && "image" in parsed) {
          const img = (parsed as { image?: unknown }).image;
          const okImage = typeof img === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(img);
          if (!okImage) delete (parsed as { image?: unknown }).image;
        }
        drawingData = parsed;
      }
    } catch {
      /* ignora dibujos malformados */
    }
  }

  await db.reviewComment.create({
    data: {
      deliverableId,
      authorName,
      authorUserId: inviter?.id ?? undefined,
      body: body || "(anotación)",
      timecode: isNote ? null : tcRaw && Number.isFinite(Number(tcRaw)) ? Number(tcRaw) : null,
      versionNumber: versionRaw ? Number(versionRaw) : null,
      drawingData: isNote ? undefined : ((drawingData ?? undefined) as never),
      isNote,
      fromClient: true,
    },
  });
  // Avisa al equipo del proyecto (y admins) que el cliente comentó.
  await logActivity({
    action: "deliverable.client_comment",
    summary: `comentó la revisión de «${name}»`,
    projectId,
    entityType: "deliverable",
    entityId: deliverableId,
    actorName: `${authorName} (cliente)`,
  });
  // Aviso DIRIGIDO (in-app + correo) al equipo, con tope: máximo un correo cada 10 minutos por
  // entregable, para que una ronda de 10 comentarios seguidos no dispare 10 correos.
  if (rateLimit(`review-comment-mail:${deliverableId}`, 1, 10 * 60_000)) {
    await notifyManyAndEmail(await projectTeamIds(projectId), {
      type: "review",
      event: "review_client",
      title: `Cliente comentó: ${name}`,
      body: `${authorName} dejó comentarios en la revisión. Ábrela para verlos.`,
      link: `/revisiones/${deliverableId}`,
    });
  }
  // No revalidamos la página: el comentario se muestra de forma optimista en el cliente
  // (ReviewStage) para que el reproductor de video NO se reinicie al comentar.
}

// El cliente RESPONDE dentro del hilo de una corrección (en vez de abrir un comentario suelto que
// nadie sabe a qué contesta). Mismo patrón que addReviewComment: autorización por token, límite
// de ritmo y aviso al equipo. La corrección madre se valida contra el entregable DEL TOKEN.
export async function addReviewReply(token: string, parentId: string, body: string, authorName?: string) {
  // Responder escribe en BD y avisa al equipo: mismo límite estricto que comentar.
  if (!rateLimit(`review-reply:${await rlKey(token)}`, 10, 60_000)) {
    throw new Error("Demasiadas respuestas seguidas. Espera un momento e inténtalo de nuevo.");
  }
  const { id: deliverableId, name, projectId } = await resolveDeliverable(token);

  const parent = await db.reviewComment.findUnique({
    where: { id: parentId },
    select: { id: true, deliverableId: true, parentId: true, versionNumber: true, fromClient: true, visibleToClient: true },
  });
  // La madre tiene que ser de ESTE entregable (un id de otro entregable no cuela por el token)…
  if (!parent || parent.deliverableId !== deliverableId) throw new Error("Esa corrección no existe en esta revisión.");
  // …y estar de cara al cliente: bajo un comentario INTERNO del equipo (que él nunca ve) no se
  // responde, aunque alguien traiga su id a mano.
  if (!parent.fromClient && !parent.visibleToClient) throw new Error("Esa corrección no existe en esta revisión.");

  const clean = body.trim().slice(0, 4000);
  if (!clean) return;

  // Usuario invitado con sesión: la respuesta queda atribuida a su usuario, como en addReviewComment.
  const inviter = await sessionMember(projectId);
  const who = inviter?.name ?? ((authorName ?? "").trim().slice(0, 80) || "Cliente");
  // Hilos de UN nivel: responder a una respuesta cuelga de la misma corrección madre.
  const rootId = parent.parentId ?? parent.id;

  await db.reviewComment.create({
    data: {
      deliverableId,
      parentId: rootId,
      authorName: who,
      authorUserId: inviter?.id ?? undefined,
      body: clean,
      versionNumber: parent.versionNumber,
      fromClient: true,
    },
  });
  await logActivity({
    action: "deliverable.client_comment",
    summary: `respondió en la revisión de «${name}»`,
    projectId,
    entityType: "deliverable",
    entityId: deliverableId,
    actorName: `${who} (cliente)`,
  });
  // Aviso al equipo con el MISMO tope de correo que los comentarios (misma clave por entregable):
  // una ronda de comentarios y respuestas seguidos no debe disparar una avalancha de correos.
  if (rateLimit(`review-comment-mail:${deliverableId}`, 1, 10 * 60_000)) {
    await notifyManyAndEmail(await projectTeamIds(projectId), {
      type: "review",
      event: "review_client",
      title: `Cliente respondió: ${name}`,
      body: `${who} respondió en una corrección de la revisión. Ábrela para verlo.`,
      link: `/revisiones/${deliverableId}`,
    });
  }
  // No revalidamos: la respuesta se muestra de forma optimista (el video no se reinicia).
}

// El cliente marca una foto de la galería: ME_GUSTA / NO_ME_GUSTA / PENDIENTE (toggle) + nota
// opcional. Límite generoso porque el cliente puede recorrer muchas fotos seguidas. No revalida
// la página (la galería actualiza de forma optimista); el valor queda guardado para el equipo.
export async function setPhotoPick(token: string, photoId: string, pick: string, note?: string) {
  if (!rateLimit(`review-pick:${await rlKey(token)}`, 200, 60_000)) {
    throw new Error("Demasiadas acciones seguidas. Espera un momento e inténtalo de nuevo.");
  }
  const { id: deliverableId } = await resolveDeliverable(token);
  const photo = await db.deliverablePhoto.findUnique({ where: { id: photoId }, select: { deliverableId: true } });
  if (!photo || photo.deliverableId !== deliverableId) throw new Error("Foto no encontrada");
  const value = pick === "ME_GUSTA" || pick === "NO_ME_GUSTA" ? pick : "PENDIENTE";
  await db.deliverablePhoto.update({
    where: { id: photoId },
    data: { pick: value as never, clientNote: (note ?? "").trim().slice(0, 1000) || null, pickedAt: new Date() },
  });
}

// Devuelve un resultado TIPADO (no lanza) para los fallos esperados/de cara al usuario: en
// producción Next.js REDACTA el mensaje de un Error lanzado desde una server action (el cliente
// recibiría un texto genérico en inglés). Devolviendo { ok, message } el copy en español llega
// intacto al modal de decisión del cliente.
export async function setReviewDecision(token: string, decision: string, name?: string, note?: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!rateLimit(`review-decision:${await rlKey(token)}`, 20, 60_000)) {
    return { ok: false, message: "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo." };
  }
  let deliverableId: string, delName: string, projectId: string;
  try {
    const d = await resolveDeliverable(token);
    deliverableId = d.id; delName = d.name; projectId = d.projectId;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "El enlace de revisión ya no está disponible." };
  }
  const approved = decision === "APROBADO";
  const status = approved ? "APROBADO" : "CORRECCIONES";
  // Usuario invitado autenticado (cliente miembro con permiso de aprobar): su decisión queda
  // atribuida a su usuario y PUEDE reabrir un aprobado pidiendo cambios. El cliente FINAL por
  // enlace público (sin sesión) usa el flujo normal y no reabre tras aprobado.
  const inviter = await sessionMember(projectId);
  const invitedApprover = inviter && hasPermission(inviter, "aprobar_cliente") ? inviter : null;
  const who = inviter?.name ?? ((name ?? "").trim().slice(0, 80) || "Cliente");
  const noteClean = approved ? null : ((note ?? "").trim().slice(0, 1000) || null);

  // Compuerta de estado: el cliente FINAL (sin sesión) solo decide si la pieza está ENVIADO_CLIENTE
  // o CORRECCIONES (no puede reabrir un APROBADO/ENTREGADO). El usuario invitado autenticado puede
  // decidir en cualquier estado de cara al cliente → así reabre un aprobado con «Solicitar cambios».
  const current = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { status: true, type: true } });
  if (!current) {
    return { ok: false, message: "Este entregable ya no está disponible para decidir. Recarga la página." };
  }
  const decidableState = invitedApprover
    ? CLIENT_STATES.has(current.status)
    : current.status === "ENVIADO_CLIENTE" || current.status === "CORRECCIONES";
  if (!decidableState) {
    return { ok: false, message: "Este entregable ya no está disponible para decidir. Recarga la página." };
  }

  // Solo se decide sobre material que el equipo ya aprobó internamente. Las galerías de
  // FOTOGRAFIA no tienen versiones: ahí basta con que haya fotos que revisar.
  let versionNumber: number | null = null;
  if (current.type === "FOTOGRAFIA") {
    const photoCount = await db.deliverablePhoto.count({ where: { deliverableId } });
    if (!photoCount) return { ok: false, message: "Aún no hay fotos disponibles para decidir." };
  } else {
    const latestApproved = await db.deliverableVersion.findFirst({
      where: { deliverableId, internalApproved: true },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    if (!latestApproved) return { ok: false, message: "Aún no hay una versión disponible para decidir." };
    versionNumber = latestApproved.number;
  }

  await db.deliverable.update({ where: { id: deliverableId }, data: { status: status as never } });
  await db.deliverableDecision.create({
    data: { deliverableId, versionNumber, stage: "CLIENTE", result: approved ? "APROBADO" : "CAMBIOS", byUserId: invitedApprover?.id ?? undefined, byName: who, note: noteClean },
  });
  await db.reviewComment.create({
    data: {
      deliverableId,
      authorName: who,
      authorUserId: invitedApprover?.id ?? undefined,
      body: approved ? "✅ Aprobó el entregable." : `✏️ Solicitó cambios${noteClean ? `: ${noteClean}` : "."}`,
      versionNumber,
      fromClient: true,
    },
  });
  // Avisa al equipo del proyecto (y admins) de la decisión del cliente.
  await logActivity({
    action: approved ? "deliverable.client_approved" : "deliverable.client_changes",
    summary: approved ? `aprobó la revisión de «${delName}»` : `solicitó cambios en «${delName}»`,
    projectId,
    entityType: "deliverable",
    entityId: deliverableId,
    actorName: `${who} (cliente)`,
  });
  // Aviso DIRIGIDO (in-app + correo) al equipo del proyecto. Si quien decide es el usuario invitado
  // (miembro del proyecto), se le excluye para que no se auto-notifique su propia decisión.
  const decisionRecipients = (await projectTeamIds(projectId)).filter((id) => id !== invitedApprover?.id);
  if (decisionRecipients.length) {
    await notifyManyAndEmail(decisionRecipients, {
      type: "review",
      event: "review_client",
      title: approved ? `Cliente aprobó: ${delName}` : `Cliente pidió cambios: ${delName}`,
      body: approved ? `${who} aprobó el entregable.` : `${who} solicitó cambios. Revisa sus comentarios.`,
      link: `/revisiones/${deliverableId}`,
    });
  }
  // ── Tareas del flujo ── la decisión del cliente COMPLETA las tareas abiertas del ciclo
  // («Entregar al cliente …» y las de revisión); si pidió cambios, crea una tarea REAL
  // «Corregir … (cambios del cliente)» a quien subió la última versión — el requisito no
  // queda a medias con solo la notificación.
  const flowInfo = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: {
      ownerId: true,
      reviewExpiresAt: true,
      project: { select: { leadId: true } },
      versions: { orderBy: { number: "desc" }, take: 1, select: { uploadedById: true, number: true } },
    },
  });
  await closeDeliverableAutoTasks(deliverableId, approved ? ["deliver", "review", "fix"] : ["deliver", "review"]);
  if (!approved && flowInfo) {
    // Plazo de la corrección: 24 horas HÁBILES por defecto (sáb/dom no cuentan). El cliente
    // no fija plazos — el productor puede ajustar la fecha de la tarea después.
    const fixDueAt = defaultFixDeadline(new Date());
    await db.deliverable.update({ where: { id: deliverableId }, data: { fixDueAt } });
    await createDeliverableAutoTask({
      projectId,
      deliverableId,
      title: autoTaskTitles.fix(delName, versionNumber ?? flowInfo.versions[0]?.number ?? null, true),
      description: `El cliente (${who}) solicitó cambios${noteClean ? `: ${noteClean.slice(0, 300)}` : ""}. Sus comentarios con capturas están en el entregable. Al subir la nueva versión, esta tarea se completa sola. Plazo: ${formatBogota(fixDueAt)} (después de esa hora queda como incumplida).`,
      assigneeId: flowInfo.versions[0]?.uploadedById ?? flowInfo.ownerId ?? flowInfo.project.leadId,
      dueAt: fixDueAt,
      actorId: null,
    });
  }
  revalidatePath(`/review/${token}`);
  return { ok: true };
}

// PRE-APROBAR (usuario invitado como PUENTE): el invitado autenticado da el visto bueno y GENERA
// un enlace /review/[token] para reenviárselo al cliente FINAL, que será quien apruebe. No cambia
// el estado del entregable (sigue de cara al cliente, a la espera de la aprobación final): solo
// deja constancia para el equipo y, opcionalmente, envía el enlace por correo. Devuelve la URL para
// copiar. Requiere SESIÓN (no basta el token): pre-aprobar es una acción atribuible.
export async function preApproveReview(
  token: string,
  formData: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  let d: { id: string; name: string; projectId: string };
  try {
    d = await resolveDeliverable(token);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "El enlace de revisión ya no está disponible." };
  }
  const inviter = await sessionMember(d.projectId);
  if (!inviter || !hasPermission(inviter, "aprobar_cliente")) {
    return { ok: false, error: "Solo un usuario invitado con permiso de aprobación puede pre-aprobar." };
  }
  if (!rateLimit(`review-preapprove:${await rlKey(token)}`, 20, 60_000)) {
    return { ok: false, error: "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo." };
  }
  // Debe existir material de cara al cliente que compartir (versión aprobada internamente, o fotos).
  const cur = await db.deliverable.findUnique({ where: { id: d.id }, select: { type: true } });
  if (cur?.type === "FOTOGRAFIA") {
    const n = await db.deliverablePhoto.count({ where: { deliverableId: d.id } });
    if (!n) return { ok: false, error: "Aún no hay fotos para compartir con el cliente final." };
  } else {
    const v = await db.deliverableVersion.findFirst({ where: { deliverableId: d.id, internalApproved: true }, select: { number: true } });
    if (!v) return { ok: false, error: "Aún no hay una versión final para compartir con el cliente final." };
  }

  const url = `${baseUrl()}/review/${signReviewToken(d.id)}`;
  const to = String(formData.get("to") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  // Envío por correo OPCIONAL al cliente final (si el invitado escribió un destinatario).
  if (to) {
    if (!isEmail(to)) return { ok: false, error: "Correo del cliente final inválido." };
    if (!(await isEmailEnabled())) return { ok: false, error: "El correo no está configurado; copia el enlace y compártelo tú." };
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `
      <p>Hola,</p>
      <p>${esc(inviter.name)} te comparte <b>${esc(d.name)}</b> para tu revisión y aprobación.</p>
      ${note ? `<p>${esc(note)}</p>` : ""}
      <p><a href="${url}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Ver y aprobar</a></p>
      <p style="color:#666;font-size:12px">O copia este enlace: ${url}</p>
      <p style="color:#666;font-size:12px">Labstream Studio</p>`;
    const r = await sendEmail({
      to,
      from: inviter.email ? `${inviter.name} <${inviter.email}>` : undefined,
      replyTo: inviter.email ?? undefined,
      subject: `Revisión: ${d.name}`,
      html,
      text: `${inviter.name} te comparte ${d.name} para revisión: ${url}`,
    });
    if (!r.ok) return { ok: false, error: r.error };
  }

  // Deja constancia INTERNA (solo el equipo, en /revisiones) — nunca de cara al cliente: es una nota
  // del flujo del puente y puede incluir el correo del cliente final (PII de terceros). Por eso
  // fromClient=false (y sin visibleToClient), como el resto de comentarios internos de pre-aprobación.
  await db.reviewComment.create({
    data: {
      deliverableId: d.id,
      authorName: inviter.name,
      authorUserId: inviter.id,
      body: to
        ? `🔎 Pre-aprobó y envió el enlace al cliente final (${to}) para su aprobación.`
        : "🔎 Pre-aprobó y compartió el enlace con el cliente final para su aprobación.",
      isNote: true,
      fromClient: false,
    },
  });
  await logActivity({
    action: "deliverable.client_preapprove",
    summary: `pre-aprobó «${d.name}» y compartió el enlace con el cliente final`,
    projectId: d.projectId,
    entityType: "deliverable",
    entityId: d.id,
    actorName: `${inviter.name} (cliente)`,
  });
  const team = (await projectTeamIds(d.projectId)).filter((id) => id !== inviter.id);
  if (team.length) {
    await notifyManyAndEmail(team, {
      type: "review",
      event: "review_client",
      title: `Pre-aprobado (puente): ${d.name}`,
      body: `${inviter.name} pre-aprobó y compartió el enlace con el cliente final${to ? ` (${to})` : ""}.`,
      link: `/revisiones/${d.id}`,
    });
  }
  revalidatePath(`/review/${token}`);
  return { ok: true, url };
}

// Decisión del cliente sobre la PORTADA del reel (la imagen que acompaña al video): APROBADA o
// CAMBIOS. Independiente de la decisión sobre el video. Se ata al archivo de portada actual, así
// una portada nueva del equipo vuelve a quedar pendiente. Deja una nota en el hilo y avisa al equipo.
export async function setCoverDecision(token: string, decision: string, name?: string, note?: string, expectedFor?: string) {
  if (!rateLimit(`cover-decision:${await rlKey(token)}`, 20, 60_000)) {
    throw new Error("Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.");
  }
  const { id: deliverableId, name: delName, projectId } = await resolveDeliverable(token);
  const d = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { coverFileAssetId: true, type: true } });
  if (!d?.coverFileAssetId) throw new Error("Este entregable no tiene una portada para revisar");
  // La portada es propia de los REELS (vertical); en horizontales no hay decisión de portada.
  if (!(d.type === "REEL" || d.type === "SHORT")) throw new Error("Este entregable no tiene portada para aprobar");
  // Anti-carrera: la decisión aplica a la portada que el cliente VIO. Si el equipo subió una
  // nueva mientras tanto, se rechaza para que no quede aprobada una portada distinta sin verla.
  if (expectedFor && expectedFor !== d.coverFileAssetId) {
    throw new Error("La portada cambió mientras revisabas. Recarga la página para ver la nueva.");
  }

  const approved = decision === "APROBADA";
  const who = (name ?? "").trim().slice(0, 80) || "Cliente";
  const noteClean = approved ? null : ((note ?? "").trim().slice(0, 1000) || null);

  await db.deliverable.update({
    where: { id: deliverableId },
    data: {
      coverDecisionFor: d.coverFileAssetId,
      coverDecision: approved ? "APROBADA" : "CAMBIOS",
      coverDecisionBy: who,
      coverDecisionAt: new Date(),
      coverDecisionNote: noteClean,
    },
  });
  // Nota en el hilo para que el equipo lo vea junto al resto de comentarios del cliente.
  await db.reviewComment.create({
    data: {
      deliverableId,
      authorName: who,
      body: approved ? "✅ Aprobó la portada del reel." : `✏️ Portada — pidió cambios${noteClean ? `: ${noteClean}` : "."}`,
      fromClient: true,
    },
  });
  await logActivity({
    action: approved ? "deliverable.cover_approved" : "deliverable.cover_changes",
    summary: approved ? `aprobó la portada de «${delName}»` : `pidió cambios en la portada de «${delName}»`,
    projectId,
    entityType: "deliverable",
    entityId: deliverableId,
    actorName: `${who} (cliente)`,
  });
  await notifyManyAndEmail(await projectTeamIds(projectId), {
    type: "review",
    event: "review_client",
    title: approved ? `Cliente aprobó la portada: ${delName}` : `Cliente pidió cambios en la portada: ${delName}`,
    body: approved ? `${who} aprobó la portada del reel.` : `${who} pidió cambios en la portada${noteClean ? `: ${noteClean}` : "."}`,
    link: `/revisiones/${deliverableId}`,
  });
  revalidatePath(`/review/${token}`);
}
