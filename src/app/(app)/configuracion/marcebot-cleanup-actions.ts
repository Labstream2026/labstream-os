"use server";

import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { noAutorizado } from "@/lib/authz-error";
import { MARCEBOT_CHAT_SILENCIO, getAppConfigBool, setAppConfig } from "@/lib/app-config";
import { revalidatePath } from "next/cache";

// Saca a Marcebot de las CONVERSACIONES. Borra EN SUAVE (deletedAt) todo mensaje suyo que no
// lleve adjunto: el pulso «📣 …» de tareas y entregables, los resúmenes y los avisos sueltos que
// quedaron en el hilo del equipo, en el chat del día y en el feed de la cuenta del cliente.
//
// Suave = reversible: nada se pierde de verdad, solo deja de mostrarse (todas las consultas del
// chat filtran por `deletedAt: null`). Y NO toca:
//   · las notificaciones (campana) ni los correos — viven en otra tabla,
//   · el registro de actividad ni la barra de estado viva del canal,
//   · lo que el bot ENTREGÓ con archivo adjunto (un video generado, una imagen, una cotización):
//     eso es algo que alguien pidió, y borrarlo sería tirarle su trabajo.
export async function cleanupMarcebotPulse(): Promise<{ ok: boolean; deleted?: number; error?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_usuarios")) noAutorizado();

  try {
    const res = await db.chatMessage.updateMany({
      where: {
        deletedAt: null,
        author: { is: { isSystemBot: true } },
        attachments: { none: {} },
      },
      data: { deletedAt: new Date() },
    });
    return { ok: true, deleted: res.count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al limpiar." };
  }
}

// El interruptor que evita que vuelvan: con el silencio puesto, `logActivity` deja de espejar el
// pulso «📣 …» en el chat de la cuenta del cliente —lo único que todavía escribía mensajes del bot
// dentro de un canal—. Quitarlo lo devuelve tal cual estaba.
export async function setMarcebotSilencio(on: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_usuarios")) noAutorizado();
  try {
    await setAppConfig(MARCEBOT_CHAT_SILENCIO, on);
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

export async function getMarcebotSilencio(): Promise<boolean> {
  return getAppConfigBool(MARCEBOT_CHAT_SILENCIO, true);
}
