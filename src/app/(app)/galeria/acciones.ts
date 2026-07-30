"use server";

import { crearSeleccion, revocarSeleccion } from "@/lib/galeria-seleccion";
import { galeriaSession } from "@/lib/galeria-access";
import { normalizeGaleriaRel } from "@/lib/nas-galeria";
import { signGaleriaToken } from "@/lib/galeria-token";
import { revocarEntrega, reactivarEntrega, entregaRevocada, nuevaVersionEntrega, olvidarEntrega } from "@/lib/galeria-entrega";
import { logActivity } from "@/lib/activity";

// Acciones del EQUIPO sobre el enlace que se le manda al cliente. El cliente nunca llega aquí:
// entra por /galeria/[token], que no pasa por sesión.

type Resultado = { ok: true; url?: string; revocada?: boolean; version?: number } | { error: string };

function msg(e: unknown, porDefecto: string): string {
  return e instanceof Error && e.message ? e.message : porDefecto;
}

// Genera (o regenera) el enlace de una entrega. El token lleva dentro la caducidad, así que
// «renovar» es simplemente volver a firmarlo: se llama a esto otra vez y se comparte el nuevo.
export async function crearEnlaceEntrega(rel: string, dias = 90): Promise<Resultado> {
  const session = await galeriaSession();
  if (!session || session.role === "demo") return { error: "Sin permiso" };
  try {
    const norm = normalizeGaleriaRel(rel);
    if (!norm) return { error: "Hay que elegir una entrega" };
    // Sube la versión de la entrega: los enlaces anteriores dejan de abrir en el acto. Antes
    // volver a firmar dejaba VIVO el viejo hasta su fecha, así que «renovar» no cerraba nada.
    // De paso vuelve a poner en pie una entrega retirada (si no, el equipo generaría un enlace
    // que el guardián seguiría rechazando, sin entender por qué).
    const version = await nuevaVersionEntrega(norm);
    const token = signGaleriaToken(norm, dias, version);
    await logActivity({
      action: "galeria.enlace",
      summary:
        version > 1
          ? `generó el enlace de la entrega «${norm}» (${dias} días) — los ${version - 1} anteriores dejan de abrir`
          : `generó el enlace de la entrega «${norm}» (${dias} días)`,
      entityType: "galeria",
      entityId: norm,
      userId: session.id,
    });
    return { ok: true, url: `/galeria/${token}`, version };
  } catch (e) {
    return { error: msg(e, "No se pudo generar el enlace") };
  }
}

// Retira el acceso YA, sin esperar a que caduque el token. Es lo que se pulsa cuando un enlace
// se comparte donde no debía.
export async function revocarEnlaceEntrega(rel: string): Promise<Resultado> {
  const session = await galeriaSession();
  if (!session || session.role === "demo") return { error: "Sin permiso" };
  try {
    const norm = normalizeGaleriaRel(rel);
    if (!norm) return { error: "Hay que elegir una entrega" };
    await revocarEntrega(norm);
    await logActivity({
      action: "galeria.revocar",
      summary: `retiró el acceso a la entrega «${norm}»`,
      entityType: "galeria",
      entityId: norm,
      userId: session.id,
    });
    return { ok: true, revocada: true };
  } catch (e) {
    return { error: msg(e, "No se pudo retirar el acceso") };
  }
}

// Estado actual, para que el botón diga la verdad al pintarse.
export async function estadoEntrega(rel: string): Promise<{ revocada: boolean }> {
  const session = await galeriaSession();
  if (!session) return { revocada: false };
  try {
    return { revocada: await entregaRevocada(normalizeGaleriaRel(rel)) };
  } catch {
    return { revocada: false };
  }
}

// Vuelve a abrir una entrega retirada SIN generar enlace nuevo: el último que se compartió
// vuelve a servir. Para dar uno nuevo (y matar los anteriores) está crearEnlaceEntrega.
export async function reactivarEnlaceEntrega(rel: string): Promise<Resultado> {
  const session = await galeriaSession();
  if (!session || session.role === "demo") return { error: "Sin permiso" };
  try {
    const norm = normalizeGaleriaRel(rel);
    if (!norm) return { error: "Hay que elegir una entrega" };
    await reactivarEntrega(norm);
    await logActivity({
      action: "galeria.reactivar",
      summary: `volvió a abrir la entrega «${norm}»`,
      entityType: "galeria",
      entityId: norm,
      userId: session.id,
    });
    return { ok: true, revocada: false };
  } catch (e) {
    return { error: msg(e, "No se pudo reactivar") };
  }
}

// ── Selecciones: «mándale SOLO estas piezas» ───────────────────────────────────
// El enlace de selección es el hermano chico del de entrega: mismo umbral público, pero
// autoriza una LISTA exacta de piezas en vez de una carpeta. Vive en su propia fila
// (GaleriaSeleccion) y su token lleva un ámbito aparte — ver lib/galeria-seleccion.ts.

export async function crearEnlaceSeleccion(rels: string[], dias = 30): Promise<Resultado & { id?: string }> {
  const session = await galeriaSession();
  if (!session || session.role === "demo") return { error: "Sin permiso" };
  try {
    const sel = await crearSeleccion(rels, dias, session.id);
    await logActivity({
      action: "galeria.enlace-seleccion",
      summary: `compartió una selección de ${sel.piezas} ${sel.piezas === 1 ? "pieza" : "piezas"} (${dias} días)`,
      entityType: "galeria",
      entityId: sel.id,
      userId: session.id,
    });
    return { ok: true, url: `/galeria/${sel.token}`, id: sel.id };
  } catch (e) {
    return { error: msg(e, "No se pudo generar el enlace") };
  }
}

export async function revocarEnlaceSeleccion(id: string): Promise<Resultado> {
  const session = await galeriaSession();
  if (!session || session.role === "demo") return { error: "Sin permiso" };
  try {
    if (!id) return { error: "Falta el enlace que se retira" };
    await revocarSeleccion(id);
    await logActivity({
      action: "galeria.revocar-seleccion",
      summary: "retiró el enlace de una selección de piezas",
      entityType: "galeria",
      entityId: id,
      userId: session.id,
    });
    return { ok: true, revocada: true };
  } catch (e) {
    return { error: msg(e, "No se pudo retirar el enlace") };
  }
}

// Quita el registro de una entrega HUÉRFANA (su carpeta ya no está en LabTem). No borra nada del
// disco: solo limpia una fila que ya no protege nada y que solo estorba en el panel.
export async function olvidarEnlaceEntrega(rel: string): Promise<Resultado> {
  const session = await galeriaSession();
  if (!session || session.role === "demo") return { error: "Sin permiso" };
  try {
    const norm = normalizeGaleriaRel(rel);
    if (!norm) return { error: "Hay que elegir una entrega" };
    await olvidarEntrega(norm);
    await logActivity({
      action: "galeria.olvidar",
      summary: `olvidó la entrega «${norm}» (su carpeta ya no existe)`,
      entityType: "galeria",
      entityId: norm,
      userId: session.id,
    });
    return { ok: true };
  } catch (e) {
    return { error: msg(e, "No se pudo olvidar la entrega") };
  }
}
