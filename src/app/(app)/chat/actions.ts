"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { userCanAccessChannel, userCanManageChannel } from "@/lib/chat-access";
import { logActivity } from "@/lib/activity";
import { mentionsBot, handleBotMention } from "@/lib/openclaw/bridge";

// ── Crear canales y mensajes directos ──

// Crea un canal (público para todo el equipo, o privado solo para invitados).
// El creador queda como ADMIN del canal.
export async function createChannel(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return;
  const isPublic = formData.get("isPublic") !== "false"; // por defecto público
  // Miembros marcados al crear un grupo (multiselección). El creador siempre va como ADMIN.
  const picked = [...new Set(formData.getAll("members").map(String).filter((id) => id && id !== session.id))];
  const valid = picked.length
    ? (await db.user.findMany({ where: { id: { in: picked }, active: true }, select: { id: true } })).map((u) => u.id)
    : [];
  const channel = await db.chatChannel.create({
    data: {
      type: "GENERAL",
      name,
      isPublic,
      members: {
        create: [
          { userId: session.id, role: "ADMIN" },
          ...valid.map((userId) => ({ userId })),
        ],
      },
    },
  });
  revalidatePath("/chat");
  redirect(`/chat/${channel.id}`);
}

// Borra por completo un grupo del chat (canal GENERAL). Arrastra en cascada sus mensajes,
// miembros y encuestas. NO aplica a DMs ni a los canales de proyecto/cliente, que viven
// con su entidad y se borran al borrar el proyecto/cliente.
export async function deleteChannel(channelId: string) {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const channel = await db.chatChannel.findUnique({ where: { id: channelId }, select: { type: true, name: true } });
  if (!channel) return;
  if (channel.type !== "GENERAL") throw new Error("Solo se pueden borrar grupos creados en el chat.");
  if (!(await userCanManageChannel(channelId, session))) throw new Error("No autorizado");
  await db.chatChannel.delete({ where: { id: channelId } });
  await logActivity({
    action: "chat.channel.delete",
    summary: `borró el grupo «${channel.name}»`,
  }).catch(() => null);
  revalidatePath("/chat");
  redirect("/chat");
}

// Abre (o crea) un mensaje directo 1:1 con otra persona.
export async function openDirectMessage(otherUserId: string) {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  if (otherUserId === session.id) return;
  const other = await db.user.findUnique({ where: { id: otherUserId }, select: { id: true, name: true, active: true, isSystemBot: true } });
  if (!other?.active) throw new Error("Usuario inválido");
  // No se permite abrir/sembrar un DM hacia un bot del sistema (p. ej. Marcebot):
  // su DM de auditoría no debe ser escribible por el usuario.
  if (other.isSystemBot) throw new Error("Usuario inválido");

  const existing = await db.chatChannel.findFirst({
    where: {
      type: "DIRECT",
      AND: [{ members: { some: { userId: session.id } } }, { members: { some: { userId: otherUserId } } }],
    },
    select: { id: true },
  });
  if (existing) redirect(`/chat/${existing.id}`);

  const channel = await db.chatChannel.create({
    data: {
      type: "DIRECT",
      name: other.name, // referencia; en la UI se muestra el nombre del otro
      isPublic: false,
      members: { create: [{ userId: session.id }, { userId: otherUserId }] },
    },
  });
  revalidatePath("/chat");
  redirect(`/chat/${channel.id}`);
}

// Unirse / salir de un canal público (para que aparezca en "mis chats").
export async function joinChannel(channelId: string) {
  const session = await getSession();
  if (!session || !(await userCanAccessChannel(channelId, session))) throw new Error("No autorizado");
  await db.channelMember.upsert({
    where: { channelId_userId: { channelId, userId: session.id } },
    create: { channelId, userId: session.id },
    update: {},
  });
  revalidatePath("/chat");
}

export async function leaveChannel(channelId: string) {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  await db.channelMember.delete({ where: { channelId_userId: { channelId, userId: session.id } } }).catch(() => null);
  revalidatePath("/chat");
}
import { publishMessage, publishPollUpdate, publishReactionUpdate, publishMessageEdit, publishMessageDelete, publishMessagePin, publishTyping, publishConversationClear, type ChatMessagePayload, type PollData, type ReactionItem } from "@/lib/chat-bus";

// ── Editar / borrar / fijar mensajes ──

// Editar el cuerpo de un mensaje propio (o admin del sistema).
export async function editMessage(messageId: string, body: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const text = body.trim();
  if (!text) return;
  const msg = await db.chatMessage.findUnique({ where: { id: messageId }, select: { channelId: true, authorId: true } });
  if (!msg) return;
  if (msg.authorId !== session.id && session.role !== "admin") return;
  if (!(await userCanAccessChannel(msg.channelId, session))) return;
  const updated = await db.chatMessage.update({ where: { id: messageId }, data: { body: text, editedAt: new Date() } });
  publishMessageEdit(msg.channelId, messageId, updated.body, updated.editedAt!.toISOString());
}

// Borrar un mensaje propio (o admin del sistema / gestor del canal).
// Borrado SUAVE: el mensaje desaparece para los usuarios pero el administrador lo
// sigue viendo (en gris) para seguimiento. No se elimina la fila de la BD.
export async function deleteMessage(messageId: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const msg = await db.chatMessage.findUnique({ where: { id: messageId }, select: { channelId: true, authorId: true, deletedAt: true } });
  if (!msg || msg.deletedAt) return;
  const isOwner = msg.authorId === session.id;
  if (!isOwner && session.role !== "admin" && !(await userCanManageChannel(msg.channelId, session))) return;
  await db.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date(), deletedById: session.id } });
  publishMessageDelete(msg.channelId, messageId);
}

// Borrar una conversación entera (todos sus mensajes). Borrado suave: para los
// usuarios desaparece; el administrador la sigue viendo en gris. Permitido en los
// chats directos (cualquiera de los dos) o por admin / gestor del canal.
export async function clearConversation(channelId: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  if (!(await userCanAccessChannel(channelId, session))) return;
  const channel = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: {
      type: true,
      name: true,
      projectId: true,
      members: { select: { userId: true, user: { select: { isSystemBot: true } } } },
    },
  });
  // No se puede vaciar un DM cuyo otro miembro es un bot del sistema (Marcebot):
  // el rastro de auditoría no debe poder borrarlo el usuario.
  if (
    channel?.type === "DIRECT" &&
    channel.members.some((m) => m.userId !== session.id && m.user?.isSystemBot)
  ) {
    return;
  }
  const allowed = channel?.type === "DIRECT" || session.role === "admin" || (await userCanManageChannel(channelId, session));
  if (!allowed) return;
  const res = await db.chatMessage.updateMany({
    where: { channelId, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: session.id },
  });
  publishConversationClear(channelId);
  // Rastro de auditoría del borrado masivo (además de que el admin sigue viendo los
  // mensajes en gris). En canales de proyecto aparece en su actividad.
  if (res.count > 0) {
    await logActivity({
      action: "chat.clear",
      summary: `borró la conversación «${channel?.name ?? "chat"}» (${res.count} mensaje${res.count === 1 ? "" : "s"})`,
      projectId: channel?.projectId ?? null,
      entityType: "project",
    });
  }
}

// Fijar / desfijar un mensaje del canal (cualquier miembro con acceso).
export async function togglePin(messageId: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const msg = await db.chatMessage.findUnique({ where: { id: messageId }, select: { channelId: true, pinned: true } });
  if (!msg) return;
  if (!(await userCanAccessChannel(msg.channelId, session))) return;
  await db.chatMessage.update({ where: { id: messageId }, data: { pinned: !msg.pinned } });
  publishMessagePin(msg.channelId, messageId, !msg.pinned);
}

// Indicador efímero de "escribiendo…".
export async function notifyTyping(channelId: string): Promise<void> {
  const session = await getSession();
  if (!session || !(await userCanAccessChannel(channelId, session))) return;
  publishTyping(channelId, session.id, session.name);
}

// Marca el canal como leído por el usuario (para los contadores de no leídos).
// Solo actualiza si ya es miembro (no auto-une a canales públicos).
export async function markChannelRead(channelId: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await db.channelMember.updateMany({
    where: { channelId, userId: session.id },
    data: { lastReadAt: new Date() },
  });
}
import { mimeFor } from "@/lib/storage";
import { saveBufferWithPreview } from "@/lib/image";
import { isEditableOffice } from "@/lib/onlyoffice";
import { notifyAndEmail, notify } from "@/lib/notify";

// Detecta @menciones en el TEXTO (servidor, no se confía en el cliente). Coincidencia
// exacta con límites de palabra; nombres largos tienen prioridad ("@Ana María" antes que "@Ana").
function detectMentionIds(body: string, users: { id: string; name: string }[]): string[] {
  if (!body.includes("@") || users.length === 0) return [];
  const sorted = [...users].sort((a, b) => b.name.length - a.name.length);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\p{L}0-9_])@(${sorted.map((u) => esc(u.name)).join("|")})(?![\\p{L}0-9_])`, "gu");
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const u = sorted.find((x) => x.name === m![1]);
    if (u) ids.add(u.id);
  }
  return [...ids];
}

// Notifica (app + correo) a los usuarios mencionados con @ que tengan acceso al canal.
// Recalcula las menciones EN EL SERVIDOR a partir del texto (el cliente no es de fiar).
// El correo solo sale si el SMTP está configurado (Configuración → Integraciones); si no,
// queda solo el aviso in-app. El título dice QUIÉN te mencionó y DÓNDE para que se note.
async function notifyMentions(channelId: string, authorId: string, authorName: string, body: string) {
  if (!body.includes("@")) return;
  const channel = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: { name: true, isPublic: true, type: true, members: { select: { userId: true } } },
  });
  if (!channel) return;
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  const memberIds = new Set(channel.members.map((m) => m.userId));
  const ids = detectMentionIds(body, users).filter((id) => id !== authorId);
  // En un DM el "nombre del canal" es interno; el contexto es la conversación directa.
  const where = channel.type === "DIRECT" ? "en un mensaje directo" : `en ${channel.name}`;
  for (const userId of ids) {
    if (!channel.isPublic && !memberIds.has(userId)) continue; // privado: solo miembros del canal
    await notifyAndEmail(userId, {
      type: "mention",
      title: `${authorName} te mencionó ${where}`,
      body: body.slice(0, 140),
      link: `/chat/${channelId}`,
    });
  }
}

// Notifica al otro participante de un DM cuando recibe un mensaje.
// Notifica a los miembros del canal (menos al autor) que llegó un mensaje nuevo.
// Cubre DMs, chats de proyecto y grupos privados. Se omiten los canales de
// difusión del equipo (general, estados-equipo) para no saturar de avisos.
async function notifyChannelMessage(channelId: string, authorId: string, authorName: string, body: string) {
  const channel = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: { type: true, name: true, slug: true, members: { select: { userId: true } } },
  });
  if (!channel) return;
  const isBroadcast = channel.type === "GENERAL" && !!channel.slug; // general / estados-equipo
  if (isBroadcast) return;

  const isDM = channel.type === "DIRECT";
  const link = isDM ? `/chat/${channelId}` : channel.type === "PROJECT" ? `/chat/${channelId}` : `/chat/${channelId}`;
  const title = isDM ? `Mensaje de ${authorName}` : `${authorName} en ${channel.name}`;

  for (const m of channel.members) {
    if (m.userId === authorId) continue;
    // En app (sin email para no saturar). Los DMs sí van también por correo.
    if (isDM) {
      await notifyAndEmail(m.userId, { type: "dm", title, body: body.slice(0, 140), link });
    } else {
      await notify(m.userId, { type: "chat", title, body: body.slice(0, 140), link });
    }
  }
}

// Reacción con emoji a un mensaje (toggle). Devuelve la lista de reacciones del mensaje.
export async function toggleReaction(channelId: string, messageId: string, emoji: string): Promise<ReactionItem[] | null> {
  const session = await getSession();
  if (!session || !(await userCanAccessChannel(channelId, session))) return null;
  const clean = emoji.slice(0, 16);
  const existing = await db.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: session.id, emoji: clean } },
  });
  if (existing) {
    await db.messageReaction.delete({ where: { id: existing.id } });
  } else {
    await db.messageReaction.create({ data: { messageId, userId: session.id, emoji: clean } });
  }
  const all = await db.messageReaction.findMany({ where: { messageId }, select: { emoji: true, userId: true } });
  publishReactionUpdate(channelId, messageId, all);
  return all;
}

export async function sendMessage(
  channelId: string,
  body: string,
  parentId?: string | null,
  _mentionIds?: string[], // el cliente puede pasar menciones, pero se recalculan en el servidor
): Promise<ChatMessagePayload | null> {
  const text = body.trim();
  if (!text) return null;

  const session = await getSession();
  if (!(await userCanAccessChannel(channelId, session))) return null;

  const msg = await db.chatMessage.create({
    data: { channelId, body: text, parentId: parentId ?? null, authorId: session!.id },
    include: { author: { select: { name: true, initials: true, avatarColor: true }, }, channel: { select: { name: true } } },
  });
  await notifyMentions(channelId, session!.id, msg.author?.name ?? "Alguien", text);
  await notifyChannelMessage(channelId, session!.id, msg.author?.name ?? "Alguien", text);

  // Si etiquetaron al asistente de IA (@Marcebot/@IA), responde en segundo plano (puede
  // tardar; no bloquea el envío del usuario). Se ejecuta tras enviar la respuesta y actúa
  // con los permisos de quien lo etiquetó (session.id).
  if (mentionsBot(text)) after(() => handleBotMention(channelId, session!.id, msg.parentId));

  const payload: ChatMessagePayload = {
    id: msg.id,
    channelId,
    body: msg.body,
    parentId: msg.parentId,
    createdAt: msg.createdAt.toISOString(),
    author: msg.author
      ? { name: msg.author.name, initials: msg.author.initials, color: msg.author.avatarColor }
      : null,
    attachments: [],
  };
  publishMessage(payload);
  return payload;
}

// Envío con archivos adjuntos (Word, Excel, PDF, imágenes, etc.)
export async function sendMessageWithAttachments(formData: FormData): Promise<ChatMessagePayload | null> {
  const channelId = String(formData.get("channelId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "") || null;
  const MAX = 50 * 1024 * 1024; // 50 MB por archivo
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0 && f.size <= MAX);
  if (!channelId || (!body && files.length === 0)) return null;

  const session = await getSession();
  if (!(await userCanAccessChannel(channelId, session))) return null;

  const msg = await db.chatMessage.create({
    data: { channelId, body, parentId, authorId: session!.id },
    include: { author: { select: { name: true, initials: true, avatarColor: true } } },
  });

  const created: { id: string; name: string; mime: string | null; editable: boolean }[] = [];
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const att = await db.messageAttachment.create({
      data: { messageId: msg.id, name: file.name, path: "", mime: mimeFor(file.name, file.type), size: buf.length },
    });
    const rel = await saveBufferWithPreview(`chat/${att.id}`, file.name, buf, file.type);
    await db.messageAttachment.update({ where: { id: att.id }, data: { path: rel } });
    created.push({ id: att.id, name: file.name, mime: mimeFor(file.name, file.type), editable: isEditableOffice(file.name) });
  }

  const payload: ChatMessagePayload = {
    id: msg.id,
    channelId,
    body: msg.body,
    parentId: msg.parentId,
    createdAt: msg.createdAt.toISOString(),
    author: msg.author
      ? { name: msg.author.name, initials: msg.author.initials, color: msg.author.avatarColor }
      : null,
    attachments: created,
  };
  publishMessage(payload);
  await notifyMentions(channelId, session!.id, msg.author?.name ?? "Alguien", body);
  await notifyChannelMessage(channelId, session!.id, msg.author?.name ?? "Alguien", body || "📎 Archivo adjunto");
  if (mentionsBot(body)) after(() => handleBotMention(channelId, session!.id, msg.parentId));
  // Se devuelve para que el emisor vea su mensaje al instante (sin depender del SSE).
  return payload;
}

// ── Encuestas ──

export async function createPoll(channelId: string, formData: FormData): Promise<void> {
  const question = String(formData.get("question") ?? "").trim();
  const options = formData
    .getAll("options")
    .map((o) => String(o).trim())
    .filter(Boolean);
  if (!question || options.length < 2) return;

  const session = await getSession();
  if (!(await userCanAccessChannel(channelId, session))) return;

  const msg = await db.chatMessage.create({
    data: {
      channelId,
      body: `📊 ${question}`,
      authorId: session!.id,
      poll: {
        create: {
          channelId,
          question,
          createdById: session!.id,
          options: { create: options.map((text, i) => ({ text, position: i })) },
        },
      },
    },
    include: {
      author: { select: { name: true, initials: true, avatarColor: true } },
      poll: { include: { options: { orderBy: { position: "asc" } } } },
    },
  });

  publishMessage({
    id: msg.id,
    channelId,
    body: msg.body,
    parentId: msg.parentId,
    createdAt: msg.createdAt.toISOString(),
    author: msg.author
      ? { name: msg.author.name, initials: msg.author.initials, color: msg.author.avatarColor }
      : null,
    attachments: [],
    poll: msg.poll
      ? {
          id: msg.poll.id,
          question: msg.poll.question,
          options: msg.poll.options.map((o) => ({ id: o.id, text: o.text, votes: 0 })),
          totalVotes: 0,
        }
      : null,
  });
}

export async function votePoll(pollId: string, optionId: string): Promise<PollData | null> {
  const session = await getSession();
  if (!session) return null;

  // La opción debe pertenecer a esta encuesta (evita votos cruzados entre encuestas).
  const poll = await db.poll.findUnique({
    where: { id: pollId },
    include: {
      options: { orderBy: { position: "asc" }, include: { _count: { select: { votes: true } } } },
    },
  });
  if (!poll || !poll.options.some((o) => o.id === optionId)) return null;
  if (!(await userCanAccessChannel(poll.channelId, session))) return null;

  await db.pollVote.upsert({
    where: { pollId_userId: { pollId, userId: session.id } },
    create: { pollId, optionId, userId: session.id },
    update: { optionId },
  });
  // recuento tras el voto
  const counts = await db.pollOption.findMany({
    where: { pollId },
    orderBy: { position: "asc" },
    include: { _count: { select: { votes: true } } },
  });
  const data: PollData = {
    id: poll.id,
    question: poll.question,
    options: counts.map((o) => ({ id: o.id, text: o.text, votes: o._count.votes })),
    totalVotes: counts.reduce((n, o) => n + o._count.votes, 0),
  };
  publishPollUpdate(poll.channelId, data);
  return data;
}

// ── Gestión del canal (miembros / visibilidad) ──

export async function setChannelVisibility(channelId: string, isPublic: boolean) {
  const session = await getSession();
  if (!(await userCanManageChannel(channelId, session))) {
    throw new Error("No autorizado");
  }
  const channel = await db.chatChannel.update({ where: { id: channelId }, data: { isPublic } });
  if (channel.projectId) revalidatePath(`/proyectos/${channel.projectId}`);
}

export async function addChannelMember(channelId: string, userId: string) {
  const session = await getSession();
  if (!(await userCanManageChannel(channelId, session))) {
    throw new Error("No autorizado");
  }
  await db.channelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId },
    update: {},
  });
  const channel = await db.chatChannel.findUnique({ where: { id: channelId }, select: { projectId: true } });
  if (channel?.projectId) revalidatePath(`/proyectos/${channel.projectId}`);
}

// Promover/degradar a un miembro como channel-admin (gestiona visibilidad/miembros).
export async function setChannelMemberRole(channelId: string, userId: string, makeAdmin: boolean) {
  const session = await getSession();
  if (!(await userCanManageChannel(channelId, session))) {
    throw new Error("No autorizado");
  }
  await db.channelMember
    .update({
      where: { channelId_userId: { channelId, userId } },
      data: { role: (makeAdmin ? "ADMIN" : "MEMBER") as never },
    })
    .catch(() => null);
  const channel = await db.chatChannel.findUnique({ where: { id: channelId }, select: { projectId: true } });
  if (channel?.projectId) revalidatePath(`/proyectos/${channel.projectId}`);
}

export async function removeChannelMember(channelId: string, userId: string) {
  const session = await getSession();
  if (!(await userCanManageChannel(channelId, session))) {
    throw new Error("No autorizado");
  }
  await db.channelMember
    .delete({ where: { channelId_userId: { channelId, userId } } })
    .catch(() => null);
  const channel = await db.chatChannel.findUnique({ where: { id: channelId }, select: { projectId: true } });
  if (channel?.projectId) revalidatePath(`/proyectos/${channel.projectId}`);
}
