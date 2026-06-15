"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { verifyProposalToken } from "@/lib/proposals/token";

// Acción PÚBLICA (sin sesión): el cliente acepta la propuesta desde su enlace.
// La autorización es el token firmado; solo permite pasar a ACEPTADA.
export async function acceptProposal(token: string) {
  const id = verifyProposalToken(token);
  if (!id) throw new Error("Enlace inválido");
  const p = await db.proposal.findUnique({ where: { id }, select: { status: true, expiresAt: true } });
  if (!p) throw new Error("Propuesta inexistente");
  if (p.status === "ACEPTADA") return;
  if (p.expiresAt && new Date(p.expiresAt).getTime() < Date.now()) throw new Error("La propuesta venció");
  await db.proposal.update({ where: { id }, data: { status: "ACEPTADA" } });
  revalidatePath(`/p/${token}`);
}
