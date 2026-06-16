"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanManageClient } from "@/lib/client-access";
import { logActivity } from "@/lib/activity";

export async function createClient(formData: FormData) {
  const session = await getSession();
  // Permiso específico de clientes (el backfill se lo concede a los roles que ya
  // podían, p. ej. gerente/ventas; el admin pasa siempre).
  if (!hasPermission(session, "crear_clientes")) {
    throw new Error("No autorizado");
  }
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const client = await db.client.create({
    data: {
      name,
      company: String(formData.get("company") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      emoji: String(formData.get("emoji") ?? "").trim() || "🏢",
      // El creador queda como miembro para poder verlo (los admin ven todos igual).
      members: { create: { userId: session!.id } },
    },
  });
  await logActivity({ action: "client.create", summary: `creó el cliente «${name}»`, clientId: client.id, entityType: "client", entityId: client.id });
  revalidatePath("/");
  revalidatePath("/proyectos");
  redirect(`/clientes/${client.id}`);
}

// Borra un cliente y TODO lo suyo (proyectos, cotizaciones, canal, miembros) en
// cascada. Solo administradores. Es destructivo e irreversible.
export async function deleteClient(clientId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "Solo un administrador puede borrar clientes." };
  await db.client.delete({ where: { id: clientId } }).catch(() => null);
  revalidatePath("/");
  revalidatePath("/proyectos");
  revalidatePath("/", "layout");
  return { ok: true };
}

export type ClientMemberResult = { ok: boolean; error?: string };

// Añade un miembro al cliente (quién puede verlo). Solo admin o miembro actual.
export async function addClientMember(clientId: string, userId: string): Promise<ClientMemberResult> {
  const session = await getSession();
  if (!(await userCanManageClient(clientId, session))) return { ok: false, error: "No autorizado" };
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) return { ok: false, error: "Usuario inexistente" };
  await db.clientMember.upsert({
    where: { clientId_userId: { clientId, userId } },
    create: { clientId, userId },
    update: {},
  });
  await logActivity({ action: "client.member.add", summary: `dio acceso a ${user.name}`, clientId, entityType: "client", entityId: clientId });
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

// Quita el acceso de un miembro al cliente. Solo admin o miembro actual.
export async function removeClientMember(clientId: string, userId: string): Promise<ClientMemberResult> {
  const session = await getSession();
  if (!(await userCanManageClient(clientId, session))) return { ok: false, error: "No autorizado" };
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await db.clientMember.deleteMany({ where: { clientId, userId } });
  await logActivity({ action: "client.member.remove", summary: `quitó acceso a ${user?.name ?? "un usuario"}`, clientId, entityType: "client", entityId: clientId });
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/", "layout");
  return { ok: true };
}
