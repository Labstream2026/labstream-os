"use server";

import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { noAutorizado } from "@/lib/authz-error";

// Limpieza de los mensajes de PULSO de Marcebot (los "📣 …" de tareas/entregables/estado) que
// quedaron en los canales de CONVERSACIÓN antes del cambio a "barra de estado viva" (c98e7c1).
// Desde ese cambio el pulso ya no entra como mensaje al hilo interno, pero los históricos siguen
// ahí y ensucian la conversación. Esto los BORRA EN SUAVE (deletedAt) — reversible, nada se
// pierde de verdad — SOLO en canales que no son el feed de la cuenta del cliente (type != CLIENT),
// donde el pulso del bot es intencional. No toca otros mensajes del bot (p. ej. "🎬 video listo").
export async function cleanupMarcebotPulse(): Promise<{ ok: boolean; deleted?: number; error?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_usuarios")) noAutorizado();

  try {
    const res = await db.chatMessage.updateMany({
      where: {
        deletedAt: null,
        body: { startsWith: "📣" },
        author: { is: { isSystemBot: true } },
        channel: { is: { type: { not: "CLIENT" } } },
      },
      data: { deletedAt: new Date() },
    });
    return { ok: true, deleted: res.count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al limpiar." };
  }
}
