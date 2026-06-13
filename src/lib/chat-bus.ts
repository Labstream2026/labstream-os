import { EventEmitter } from "node:events";

// Bus de eventos en proceso para el chat en tiempo real (SSE).
// Suficiente para un contenedor único; si algún día hay varias instancias,
// se sustituye el transporte por Redis pub/sub (worker).

export type ChatMessagePayload = {
  id: string;
  channelId: string;
  body: string;
  createdAt: string;
  author: { name: string; initials: string | null; color: string | null } | null;
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
