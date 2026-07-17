"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { headers, cookies } from "next/headers";
import { verifyProposalToken, signProposalUnlock } from "@/lib/proposals/token";
import { verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

// Nombre de la cookie de desbloqueo POR propuesta: así desbloquear una no pisa el acceso a otra.
const unlockCookie = (id: string) => `proposal-unlock-${id}`;

// Clave de rate-limit a partir del token (autorización del portal) y, si está disponible,
// la IP. Evita que un token filtrado se use para inundar la BD.
async function rlKey(token: string): Promise<string> {
  let ip = "";
  try {
    const h = await headers();
    // ÚLTIMO salto de X-Forwarded-For = la IP que vio el proxy de confianza (DSM). El primer
    // segmento lo pone el CLIENTE y es falsificable (rotarlo evadía el límite). Mismo criterio que
    // el login. Si no hay XFF, se usa x-real-ip.
    const xff = h.get("x-forwarded-for");
    ip = xff ? (xff.split(",").pop()?.trim() ?? "") : (h.get("x-real-ip") ?? "");
  } catch {
    /* headers() no disponible */
  }
  return `${token}:${ip}`;
}

// Acción PÚBLICA (sin sesión): el cliente acepta la propuesta desde su enlace.
// La autorización es el token firmado; solo permite pasar a ACEPTADA.
export async function acceptProposal(token: string) {
  if (!rateLimit(`accept-proposal:${await rlKey(token)}`, 20, 60_000)) {
    throw new Error("Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.");
  }
  const id = verifyProposalToken(token);
  if (!id) throw new Error("Enlace inválido");
  const p = await db.proposal.findUnique({ where: { id }, select: { status: true, expiresAt: true } });
  if (!p) throw new Error("Propuesta inexistente");
  if (p.status === "ACEPTADA") return;
  if (p.expiresAt && new Date(p.expiresAt).getTime() < Date.now()) throw new Error("La propuesta venció");
  // Atómico: solo pasa a ACEPTADA si aún no lo está (evita carrera de doble clic).
  await db.proposal.updateMany({ where: { id, status: { not: "ACEPTADA" } }, data: { status: "ACEPTADA" } });
  revalidatePath(`/p/${token}`);
}

// Acción PÚBLICA (sin sesión): el cliente escribe la contraseña de la reja para desbloquear la
// propuesta. Si acierta, se deja una cookie httpOnly firmada (30 días) para no volver a pedirla.
// Rate-limit estricto para frenar el adivinado por fuerza bruta. Devuelve {ok,error} (no lanza) para
// pintar el error en la reja.
export async function unlockProposal(token: string, password: string): Promise<{ ok: boolean; error?: string }> {
  // Tope GLOBAL por propuesta (independiente de la IP): aunque el atacante rote la IP falsificando
  // X-Forwarded-For, no puede exceder este número de intentos por minuto contra la MISMA propuesta.
  // Es la defensa real de fuerza bruta; el límite por-IP de abajo es una capa extra.
  if (!rateLimit(`unlock-proposal-all:${token}`, 15, 60_000)) {
    return { ok: false, error: "Demasiados intentos. Espera un minuto e inténtalo de nuevo." };
  }
  if (!rateLimit(`unlock-proposal:${await rlKey(token)}`, 8, 60_000)) {
    return { ok: false, error: "Demasiados intentos. Espera un minuto e inténtalo de nuevo." };
  }
  const id = verifyProposalToken(token);
  if (!id) return { ok: false, error: "Enlace inválido o vencido." };
  const p = await db.proposal.findUnique({ where: { id }, select: { accessPasswordHash: true } });
  if (!p) return { ok: false, error: "Propuesta no disponible." };
  // Sin reja: nada que desbloquear (no revela si existe o no; simplemente ya es accesible).
  if (!p.accessPasswordHash) return { ok: true };
  const pass = typeof password === "string" ? password : "";
  if (!pass || !(await verifyPassword(pass, p.accessPasswordHash))) {
    return { ok: false, error: "Contraseña incorrecta." };
  }
  const store = await cookies();
  // La cookie se firma ligada al hash vigente: cambiar/quitar la clave invalida los accesos previos.
  store.set(unlockCookie(id), signProposalUnlock(id, p.accessPasswordHash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/p",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath(`/p/${token}`);
  return { ok: true };
}
