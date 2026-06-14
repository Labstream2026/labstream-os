"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { userCanAccessChannel, userCanManageChannel } from "@/lib/chat-access";

// ── Crear canales y mensajes directos ──

// Crea un canal (público para todo el equipo, o privado solo para invitados).
// El creador queda como ADMIN del canal.
export async function createChannel(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return;
  const isPublic = formData.get("isPublic") !== "false"; // por defecto público
  const channel = await db.chatChannel.create({
    data: {
      type: "GENERAL",
      name,
      isPublic,
      members: { create: { userId: session.id, role: "ADMIN" } },
    },
  });
  revalidatePath("/chat");
  redirect(`/chat/${channel.id}`);
}

// Abre (o crea) un mensaje directo 1:1 con otra persona.
export async function openDirectMessage(otherUserId: string) {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  if (otherUserId === session.id) return;
  const other = await db.user.findUnique({ where: { id: otherUserId }, select: { id: true, name: true, active: true } });
  if (!other?.active) throw new Error("Usuario inválido");

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
import { publishMessage, publishPollUpdate, publishReactionUpdate, type ChatMessagePayload, type PollData, type ReactionItem } from "@/lib/chat-bus";
import { saveBuffer, mimeFor } from "@/lib/storage";
import { isEditableOffice } from "@/lib/onlyoffice";

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
): Promise<ChatMessagePayload | null> {
  const text = body.trim();
  if (!text) return null;

  const session = await getSession();
  if (!(await userCanAccessChannel(channelId, session))) return null;

  const msg = await db.chatMessage.create({
    data: { channelId, body: text, parentId: parentId ?? null, authorId: session!.id },
    include: { author: { select: { name: true, initials: true, avatarColor: true } } },
  });

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
export async function sendMessageWithAttachments(formData: FormData): Promise<void> {
  const channelId = String(formData.get("channelId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "") || null;
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!channelId || (!body && files.length === 0)) return;

  const session = await getSession();
  if (!(await userCanAccessChannel(channelId, session))) return;

  const msg = await db.chatMessage.create({
    data: { channelId, body: body || "📎 Archivo adjunto", parentId, authorId: session!.id },
    include: { author: { select: { name: true, initials: true, avatarColor: true } } },
  });

  const created: { id: string; name: string; mime: string | null; editable: boolean }[] = [];
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const att = await db.messageAttachment.create({
      data: { messageId: msg.id, name: file.name, path: "", mime: mimeFor(file.name, file.type), size: buf.length },
    });
    const rel = await saveBuffer(`chat/${att.id}`, file.name, buf);
    await db.messageAttachment.update({ where: { id: att.id }, data: { path: rel } });
    created.push({ id: att.id, name: file.name, mime: mimeFor(file.name, file.type), editable: isEditableOffice(file.name) });
  }

  publishMessage({
    id: msg.id,
    channelId,
    body: msg.body,
    parentId: msg.parentId,
    createdAt: msg.createdAt.toISOString(),
    author: msg.author
      ? { name: msg.author.name, initials: msg.author.initials, color: msg.author.avatarColor }
      : null,
    attachments: created,
  });
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
