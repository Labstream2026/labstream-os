"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { publishMessage, type ChatMessagePayload } from "@/lib/chat-bus";

export async function sendMessage(
  channelId: string,
  body: string,
): Promise<ChatMessagePayload | null> {
  const text = body.trim();
  if (!text) return null;

  const user = await getCurrentUser();
  const msg = await db.chatMessage.create({
    data: { channelId, body: text, authorId: user?.id ?? null },
    include: { author: { select: { name: true, initials: true, avatarColor: true } } },
  });

  const payload: ChatMessagePayload = {
    id: msg.id,
    channelId,
    body: msg.body,
    createdAt: msg.createdAt.toISOString(),
    author: msg.author
      ? { name: msg.author.name, initials: msg.author.initials, color: msg.author.avatarColor }
      : null,
  };
  publishMessage(payload);
  return payload;
}
