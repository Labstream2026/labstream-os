"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

// ── Preferencias de interfaz por usuario ──────────────────────────────────────
// «A mí me gusta por nombre» no debería perderse al cambiar de navegador: la vista y el
// orden que cada persona elige se guardan en SU fila (User.uiPrefs) y la siguen a donde
// entre. El guardado es fuego-y-olvido desde el cliente: si falla, lo peor que pasa es que
// la próxima sesión abra con la preferencia anterior.
//
// Lista blanca de claves y valores: esto escribe en la base con la sesión de cualquiera,
// así que NO se acepta una clave o un valor arbitrarios (ni basura de 2 MB en el JSON).

const PERMITIDAS: Record<string, ReadonlySet<string>> = {
  "discos.vista": new Set(["lista", "cuadricula"]),
  "galeria.vista": new Set(["lista", "cuadricula"]),
  "galeria.orden": new Set(["reciente", "nombre", "tamano"]),
};

export async function guardarPreferenciaUI(clave: string, valor: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const validos = PERMITIDAS[clave];
  if (!validos || !validos.has(valor)) return; // clave o valor fuera del catálogo: se ignora

  try {
    const fila = await db.user.findUnique({ where: { id: session.id }, select: { uiPrefs: true } });
    const actual = fila?.uiPrefs && typeof fila.uiPrefs === "object" && !Array.isArray(fila.uiPrefs) ? (fila.uiPrefs as Record<string, string>) : {};
    // Solo claves del catálogo sobreviven al guardado: si algún día una versión vieja dejó
    // basura en el JSON, aquí se filtra en vez de arrastrarse para siempre.
    const limpio: Record<string, string> = {};
    for (const k of Object.keys(PERMITIDAS)) {
      const v = actual[k];
      if (typeof v === "string" && PERMITIDAS[k].has(v)) limpio[k] = v;
    }
    limpio[clave] = valor;
    await db.user.update({ where: { id: session.id }, data: { uiPrefs: limpio } });
  } catch {
    /* preferencia: nunca vale un error de cara al usuario */
  }
}

// Lo que el servidor le pasa a las pantallas al pintarlas. Solo claves del catálogo, con
// el tipo estrechado a string.
export async function leerPreferenciasUI(): Promise<Record<string, string>> {
  const session = await getSession();
  if (!session) return {};
  try {
    const fila = await db.user.findUnique({ where: { id: session.id }, select: { uiPrefs: true } });
    const crudo = fila?.uiPrefs;
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return {};
    const out: Record<string, string> = {};
    for (const clave of Object.keys(PERMITIDAS)) {
      const v = (crudo as Record<string, unknown>)[clave];
      if (typeof v === "string" && PERMITIDAS[clave].has(v)) out[clave] = v;
    }
    return out;
  } catch {
    return {};
  }
}
