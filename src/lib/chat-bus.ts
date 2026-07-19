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

// Vista previa del mensaje CITADO (cita estilo WhatsApp): lo mínimo para pintar el bloque
// sobre el mensaje sin recargar. null si el citado se borró (queda «mensaje no disponible»).
export type QuotedPreview = { id: string; author: string | null; body: string } | null;

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
  quoted?: QuotedPreview;
};

const globalForBus = globalThis as unknown as { __chatBus?: EventEmitter };
export const chatBus = globalForBus.__chatBus ?? new EventEmitter();
chatBus.setMaxListeners(0);
if (!globalForBus.__chatBus) globalForBus.__chatBus = chatBus;

export function channelEvent(channelId: string) {
  return `channel:${channelId}`;
}

// Evento GLOBAL: cada mensaje nuevo se re-emite también aquí para el stream por USUARIO
// (/api/chat/stream), que alimenta los badges vivos del sidebar/rail en toda la app.
// Solo mensajes (lo único que altera no-leídos y previews); reacciones/ediciones no.
export const ANY_MESSAGE_EVENT = "any-message";
// Cambios que ALTERAN conteos sin ser un mensaje nuevo (borrar mensaje, vaciar conversación):
// el stream global solo re-cuenta (sin preview) para que los badges no queden inflados.
export const ANY_RECOUNT_EVENT = "any-recount";

// Lectura de un canal por un usuario (markChannelRead): su stream global recalcula los
// badges al instante, aunque la lectura ocurra en otra pestaña o en el dock.
export function userReadEvent(userId: string) {
  return `read:${userId}`;
}
export function publishChannelRead(userId: string, channelId: string) {
  chatBus.emit(userReadEvent(userId), { channelId });
}

export function publishMessage(msg: ChatMessagePayload) {
  chatBus.emit(channelEvent(msg.channelId), msg);
  chatBus.emit(ANY_MESSAGE_EVENT, msg);
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
  chatBus.emit(ANY_RECOUNT_EVENT, { channelId });
}
export function publishMessagePin(channelId: string, messageId: string, pinned: boolean) {
  chatBus.emit(channelEvent(channelId), { kind: "pin", channelId, messageId, pinned });
}
// Conversación borrada (todos sus mensajes): los usuarios la vacían; el admin los ve en gris.
export function publishConversationClear(channelId: string) {
  chatBus.emit(channelEvent(channelId), { kind: "clear", channelId });
  chatBus.emit(ANY_RECOUNT_EVENT, { channelId });
}

// Indicador de "escribiendo…" (efímero).
export function publishTyping(channelId: string, userId: string, name: string) {
  chatBus.emit(channelEvent(channelId), { kind: "typing", channelId, userId, name });
}

// Evento de ACTIVIDAD del proyecto para la BARRA DE ESTADO VIVA: un evento notable (tarea nueva o
// completada, entregable, cambio de estado…) ya NO se publica como mensaje del bot en el canal —
// interrumpía la conversación; se emite aquí para que la barra viva del canal se refresque al
// instante. Efímero (mismo kind-discriminado que poll/reacción): el histórico vive en ActivityLog.
export type ChatActivityPayload = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  user: { name: string; initials: string | null; color: string | null } | null;
  actorName: string | null;
};
export function publishActivity(channelId: string, item: ChatActivityPayload) {
  chatBus.emit(channelEvent(channelId), { kind: "activity", channelId, item });
}
