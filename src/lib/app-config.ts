import { db } from "@/lib/db";

// Ajustes globales de la app (tabla AppConfig, clave → valor JSON).
// Leer nunca revienta: si la clave no existe o el valor no cuadra, vuelve el default.

// El candado de respaldo: con esto encendido, un proyecto cuya salud de material
// sea «Sin registrar» o «Sin respaldo» NO se puede marcar como Terminado.
export const REQUIRE_BACKUP_TO_FINISH = "biblioteca.candadoRespaldo";

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
