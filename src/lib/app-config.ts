import { db } from "@/lib/db";

// Ajustes globales de la app (tabla AppConfig, clave → valor JSON).
// Leer nunca revienta: si la clave no existe o el valor no cuadra, vuelve el default.

// El candado de respaldo: con esto encendido, un proyecto cuya salud de material
// sea «Sin registrar» o «Sin respaldo» NO se puede marcar como Terminado.
export const REQUIRE_BACKUP_TO_FINISH = "biblioteca.candadoRespaldo";

// Marcebot fuera de las conversaciones: con esto encendido (por defecto) el bot ya no escribe
// el pulso «📣 …» como mensaje en el chat de la cuenta del cliente. Las notificaciones, el
// registro de actividad y la tarjeta del copiloto siguen igual. Se apaga en /configuracion.
export const MARCEBOT_CHAT_SILENCIO = "chat.marcebotSilencio";

export async function getAppConfigBool(key: string, fallback: boolean): Promise<boolean> {
  try {
    const row = await db.appConfig.findUnique({ where: { key } });
    return typeof row?.value === "boolean" ? row.value : fallback;
  } catch {
    return fallback;
  }
}

export async function setAppConfig(key: string, value: boolean | number | string): Promise<void> {
  await db.appConfig.upsert({ where: { key }, create: { key, value }, update: { value } });
}
