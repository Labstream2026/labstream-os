"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { verifyProposalToken } from "@/lib/proposals/token";
import { rateLimit } from "@/lib/rate-limit";

// Clave de rate-limit a partir del token (autorización del portal) y, si está disponible,
// la IP. Evita que un token filtrado se use para inundar la BD.
async function rlKey(token: string): Promise<string> {
  let ip = "";
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "";
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
