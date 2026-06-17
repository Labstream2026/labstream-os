"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanManageClient } from "@/lib/client-access";
import { logActivity } from "@/lib/activity";
import { saveBufferWithPreview, IMAGE_EDGES } from "@/lib/image";
import { TONE_MAP } from "@/lib/colors";

// Color de acento válido = clave de la paleta (lib/colors), o null.
function safeTone(value: string): string | null {
  const v = value.trim();
  return v && v in TONE_MAP ? v : null;
}

// ¿Puede el usuario personalizar este cliente (apariencia)? Igual que editar.
async function canEditClient(clientId: string): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return (await userCanManageClient(clientId, session)) || hasPermission(session, "editar_clientes");
}

export async function createClient(formData: FormData) {
  const session = await getSession();
  // Crear cliente: permiso específico crear_clientes O el histórico crear_proyectos
  // (así nadie que pudiera crear antes queda bloqueado aunque el backfill no haya
  // concedido aún crear_clientes). El admin pasa siempre.
  if (!hasPermission(session, "crear_clientes") && !hasPermission(session, "crear_proyectos")) {
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

export type ClientUpdateResult = { ok: boolean; error?: string };

// Edita la información del cliente (nombre, emoji, empresa, descripción, notas).
// Permitido a quien gestiona el cliente (admin/editor con acceso) o tiene editar_clientes.
export async function updateClient(clientId: string, formData: FormData): Promise<ClientUpdateResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  const allowed = (await userCanManageClient(clientId, session)) || hasPermission(session, "editar_clientes");
  if (!allowed) return { ok: false, error: "No autorizado" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "El nombre es obligatorio." };
  await db.client.update({
    where: { id: clientId },
    data: {
      name,
      emoji: String(formData.get("emoji") ?? "").trim() || "🏢",
      company: String(formData.get("company") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      // Solo si el formulario lo envía (la portada lo edita aparte; no lo pisamos).
      ...(formData.has("accentColor") ? { accentColor: safeTone(String(formData.get("accentColor") ?? "")) } : {}),
    },
  });
  await logActivity({ action: "client.update", summary: `editó la información del cliente «${name}»`, clientId, entityType: "client", entityId: clientId });
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Personalización rápida del cliente (portada tipo Notion + emoji + color), guardado
// al instante desde la cabecera. Lee solo los campos presentes en el FormData.
export async function saveClientAppearance(clientId: string, formData: FormData): Promise<ClientUpdateResult> {
  if (!(await canEditClient(clientId))) return { ok: false, error: "No autorizado" };
  const data: { emoji?: string; accentColor?: string | null; bannerUrl?: string } = {};

  if (formData.has("emoji")) data.emoji = String(formData.get("emoji") ?? "").trim().slice(0, 8) || "🏢";
  if (formData.has("accentColor")) data.accentColor = safeTone(String(formData.get("accentColor") ?? ""));

  const file = formData.get("banner");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) return { ok: false, error: "El archivo debe ser una imagen" };
    if (file.size > 8 * 1024 * 1024) return { ok: false, error: "La portada supera 8MB" };
    const buf = Buffer.from(await file.arrayBuffer());
    await saveBufferWithPreview("banners", clientId, buf, file.type, { maxEdge: IMAGE_EDGES.MAX_EDGE });
    data.bannerUrl = `/api/banner/${clientId}?v=${Date.now()}`;
  }

  if (Object.keys(data).length === 0) return { ok: true };
  await db.client.update({ where: { id: clientId }, data });
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Quita la portada del cliente.
export async function clearClientCover(clientId: string): Promise<ClientUpdateResult> {
  if (!(await canEditClient(clientId))) return { ok: false, error: "No autorizado" };
  await db.client.update({ where: { id: clientId }, data: { bannerUrl: null } });
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/", "layout");
  return { ok: true };
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
