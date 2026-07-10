import { EventEmitter } from "node:events";

// Bus de eventos en proceso para el chat en tiempo real (SSE).
// Suficiente para un contenedor único; si algún día hay varias instancias,
// se sustituye el transporte por Redis pub/sub (worker).

export type AttachmentPayload = {
  id: string;
  name: string;
  mime: string | null;
  editable: boolean; // editable en OnlyOffice
  // FileAsset espejo en Archivos del proyecto (los documentos del chat de proyecto se archivan
  // solos; el resto con archiveChatAttachment). null = no archivado.
  fileAssetId: string | null;
};

export type PollOptionData = { id: string; text: string; votes: number };
export type PollData = { id: string; question: string; options: PollOptionData[]; totalVotes: number };

export type ReactionItem = { emoji: string; userId: string };

export type ChatMessagePayload = {
  id: string;
  channelId: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  author: { name: string; initials: string | null; color: string | null } | null;
  attachments: AttachmentPayload[];
  poll?: PollData | null;
  reactions?: ReactionItem[];
  pinned?: boolean;
  editedAt?: string | null;
};

const globalForBus = globalThis as unknown as { __chatBus?: EventEmitter };
export const chatBus = globalForBus.__chatBus ?? new EventEmitter();
chatBus.setMaxListeners(0);
if (!globalForBus.__chatBus) globalForBus.__chatBus = chatBus;

export function channelEvent(channelId: string) {
  return `channel:${channelId}`;
}

export function publishMessage(msg: ChatMessagePayload) {
  chatBus.emit(channelEvent(msg.channelId), msg);
}

// Actualización de votos de una encuesta (mismo canal SSE, discriminada por `kind`).
export function publishPollUpdate(channelId: string, poll: PollData) {
  chatBus.emit(channelEvent(channelId), { kind: "poll", channelId, poll });
}

// Actualización de reacciones de un mensaje (lista completa de reacciones del mensaje).
export function publishReactionUpdate(channelId: string, messageId: string, reactions: ReactionItem[]) {
  chatBus.emit(channelEvent(channelId), { kind: "reaction", channelId, messageId, reactions });
}

// Edición de un mensaje (nuevo cuerpo) / borrado / fijado.
export function publishMessageEdit(channelId: string, messageId: string, body: string, editedAt: string) {
  chatBus.emit(channelEvent(channelId), { kind: "edit", channelId, messageId, body, editedAt });
}
export function publishMessageDelete(channelId: string, messageId: string) {
  chatBus.emit(channelEvent(channelId), { kind: "delete", channelId, messageId });
}
export function publishMessagePin(channelId: string, messageId: string, pinned: boolean) {
  chatBus.emit(channelEvent(channelId), { kind: "pin", channelId, messageId, pinned });
}
// Conversación borrada (todos sus mensajes): los usuarios la vacían; el admin los ve en gris.
export function publishConversationClear(channelId: string) {
  chatBus.emit(channelEvent(channelId), { kind: "clear", channelId });
}

// Indicador de "escribiendo…" (efímero).
export function publishTyping(channelId: string, userId: string, name: string) {
  chatBus.emit(channelEvent(channelId), { kind: "typing", channelId, userId, name });
}
