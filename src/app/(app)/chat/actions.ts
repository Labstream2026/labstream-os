"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { publishMessage, type ChatMessagePayload } from "@/lib/chat-bus";
import { saveBuffer, mimeFor } from "@/lib/storage";
import { isEditableOffice } from "@/lib/onlyoffice";

async function canManageChannel(channelId: string, userId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  const channel = await db.chatChannel.findUnique({
    where: { id: channelId },
    include: { project: { select: { leadId: true } }, members: { where: { userId } } },
  });
  if (!channel) return false;
  return channel.project?.leadId === userId || channel.members.length > 0;
}

export async function sendMessage(
  channelId: string,
  body: string,
  parentId?: string | null,
): Promise<ChatMessagePayload | null> {
  const text = body.trim();
  if (!text) return null;

  const user = await getCurrentUser();
  const msg = await db.chatMessage.create({
    data: { channelId, body: text, parentId: parentId ?? null, authorId: user?.id ?? null },
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

  const user = await getCurrentUser();
  const msg = await db.chatMessage.create({
    data: { channelId, body: body || "📎 Archivo adjunto", parentId, authorId: user?.id ?? null },
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

// ── Gestión del canal (miembros / visibilidad) ──

export async function setChannelVisibility(channelId: string, isPublic: boolean) {
  const session = await getSession();
  if (!session || !(await canManageChannel(channelId, session.id, session.role === "admin"))) {
    throw new Error("No autorizado");
  }
  const channel = await db.chatChannel.update({ where: { id: channelId }, data: { isPublic } });
  if (channel.projectId) revalidatePath(`/proyectos/${channel.projectId}`);
}

export async function addChannelMember(channelId: string, userId: string) {
  const session = await getSession();
  if (!session || !(await canManageChannel(channelId, session.id, session.role === "admin"))) {
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

export async function removeChannelMember(channelId: string, userId: string) {
  const session = await getSession();
  if (!session || !(await canManageChannel(channelId, session.id, session.role === "admin"))) {
    throw new Error("No autorizado");
  }
  await db.channelMember
    .delete({ where: { channelId_userId: { channelId, userId } } })
    .catch(() => null);
  const channel = await db.chatChannel.findUnique({ where: { id: channelId }, select: { projectId: true } });
  if (channel?.projectId) revalidatePath(`/proyectos/${channel.projectId}`);
}
