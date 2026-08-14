"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateTrackerToken } from "@/lib/tracker";

// ── Vincular / revocar el RASTREADOR de trabajo de un equipo ──
// El botón vive en Ajustes → Perfil y solo funciona DENTRO de la app de escritorio: la página
// genera el token aquí y se lo entrega al sensor por evento Tauri (ls-tracker-token) — nunca
// pasa por manos humanas ni queda en pantalla. Cada persona gestiona SUS equipos; revocar
// corta el flujo al instante (el endpoint valida revokedAt en cada lote).

const MAX_EQUIPOS = 3;

// Devuelve también el `deviceId`: si el sensor no acusa recibo del token (app vieja, sin
// sensor), la página deshace este equipo en vez de dejar un fantasma que nunca reporta.
export async function vincularRastreador(): Promise<{ ok: boolean; token?: string; deviceId?: string; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sin sesión." };
  if (session.role === "cliente" || session.role === "demo") {
    return { ok: false, error: "El rastreador es solo para el equipo." };
  }
  const vivos = await db.trackerDevice.count({ where: { userId: session.id, revokedAt: null } });
  if (vivos >= MAX_EQUIPOS) {
    return { ok: false, error: `Ya tienes ${MAX_EQUIPOS} equipos vinculados. Revoca uno primero.` };
  }
  const { raw, tokenHash } = generateTrackerToken();
  const device = await db.trackerDevice.create({
    // El nombre real (hostname) lo manda el sensor en su primer lote y lo adopta el endpoint.
    data: { userId: session.id, name: `Equipo de ${session.name?.split(" ")[0] ?? "alguien"}`, tokenHash },
    select: { id: true },
  });
  revalidatePath("/ajustes");
  return { ok: true, token: raw, deviceId: device.id };
}

export async function revocarRastreador(deviceId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sin sesión." };
  const device = await db.trackerDevice.findUnique({ where: { id: deviceId }, select: { userId: true, revokedAt: true } });
  if (!device) return { ok: false, error: "Ese equipo no existe." };
  // Cada quien revoca los suyos; un admin puede revocar cualquiera (equipo dado de baja, etc.).
  if (device.userId !== session.id && session.role !== "admin") {
    return { ok: false, error: "Solo puedes revocar tus propios equipos." };
  }
  if (!device.revokedAt) {
    await db.trackerDevice.update({ where: { id: deviceId }, data: { revokedAt: new Date() } });
  }
  revalidatePath("/ajustes");
  return { ok: true };
}
