"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { publishMessage, type ChatMessagePayload } from "@/lib/chat-bus";

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
  };
  publishMessage(payload);
  return payload;
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
