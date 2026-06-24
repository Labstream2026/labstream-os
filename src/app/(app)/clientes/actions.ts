"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanManageClient } from "@/lib/client-access";
import { logActivity } from "@/lib/activity";
import { saveOptimizedImage } from "@/lib/image";
import { safeExternalUrl } from "@/lib/url";
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
  const data: {
    emoji?: string;
    accentColor?: string | null;
    bannerUrl?: string;
    description?: string | null;
    logoBg?: string | null;
    photoUrl?: string;
    logoUrl?: string;
  } = {};

  if (formData.has("emoji")) data.emoji = String(formData.get("emoji") ?? "").trim().slice(0, 8) || "🏢";
  if (formData.has("accentColor")) data.accentColor = safeTone(String(formData.get("accentColor") ?? ""));
  if (formData.has("description")) data.description = String(formData.get("description") ?? "").trim().slice(0, 280) || null;
  if (formData.has("logoBg")) {
    const v = String(formData.get("logoBg") ?? "").trim();
    data.logoBg = /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
  }

  const file = formData.get("banner");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) return { ok: false, error: "El archivo debe ser una imagen" };
    if (file.size > 8 * 1024 * 1024) return { ok: false, error: "La portada supera 8MB" };
    const buf = Buffer.from(await file.arrayBuffer());
    // Se optimiza al subir: se recorta (enfoque inteligente) a la proporción del banner
    // y se convierte a WebP → portada ligera y sin guardar el original.
    await saveOptimizedImage("banners", clientId, buf, file.type, { crop: { width: 1600, height: 500 }, quality: 78 });
    data.bannerUrl = `/api/banner/${clientId}?v=${Date.now()}`;
  }

  // Foto del cliente: recorte cuadrado (va en un círculo).
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith("image/")) return { ok: false, error: "La foto debe ser una imagen" };
    if (photo.size > 8 * 1024 * 1024) return { ok: false, error: "La foto supera 8MB" };
    const buf = Buffer.from(await photo.arrayBuffer());
    await saveOptimizedImage("client-photos", clientId, buf, photo.type, { crop: { width: 480, height: 480 }, quality: 82 });
    data.photoUrl = `/api/client-asset/photo/${clientId}?v=${Date.now()}`;
  }

  // Logo: se conserva la proporción (no se recorta) y el WebP mantiene la transparencia del PNG.
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (!logo.type.startsWith("image/")) return { ok: false, error: "El logo debe ser una imagen" };
    if (logo.size > 8 * 1024 * 1024) return { ok: false, error: "El logo supera 8MB" };
    const buf = Buffer.from(await logo.arrayBuffer());
    await saveOptimizedImage("client-logos", clientId, buf, logo.type, { maxEdge: 600, quality: 88 });
    data.logoUrl = `/api/client-asset/logo/${clientId}?v=${Date.now()}`;
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

// Quita la foto o el logo del cliente.
export async function clearClientImage(clientId: string, kind: "photo" | "logo"): Promise<ClientUpdateResult> {
  if (!(await canEditClient(clientId))) return { ok: false, error: "No autorizado" };
  await db.client.update({
    where: { id: clientId },
    data: kind === "photo" ? { photoUrl: null } : { logoUrl: null },
  });
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

// Borra un cliente y TODO lo suyo (proyectos, cotizaciones, canal, miembros) en
// cascada. Solo administradores. Es destructivo e irreversible.
export async function deleteClient(clientId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "Solo un administrador puede borrar clientes." };
  const client = await db.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!client) return { ok: false, error: "El cliente no existe." };
  // No tragar el error: si el borrado falla (FK/datos vinculados), avisar de verdad
  // en lugar de reportar éxito y dejar el cliente en la lista.
  try {
    await db.client.delete({ where: { id: clientId } });
  } catch {
    return { ok: false, error: "No se pudo borrar el cliente." };
  }
  // Sin clientId (la fila ya no existe): el rastro de auditoría se conserva igual.
  await logActivity({ action: "client.delete", summary: `eliminó el cliente ${client.name}` });
  revalidatePath("/clientes");
  revalidatePath("/");
  revalidatePath("/proyectos");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Archiva un cliente (borrado SUAVE): sale de las listas pero se conserva TODO su contenido
// —facturas, cotizaciones, proyectos, chat— y se puede RESTAURAR. Es la vía recomendada en
// lugar de deleteClient (que borra en cascada). Solo administradores.
export async function archiveClient(clientId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "Solo un administrador puede archivar clientes." };
  const client = await db.client.findUnique({ where: { id: clientId }, select: { name: true, archivedAt: true } });
  if (!client) return { ok: false, error: "El cliente no existe." };
  if (client.archivedAt) return { ok: true }; // ya archivado (idempotente)
  await db.client.update({ where: { id: clientId }, data: { archivedAt: new Date() } });
  await logActivity({ action: "client.archive", summary: `archivó el cliente ${client.name}`, clientId, entityType: "client", entityId: clientId });
  revalidatePath("/clientes");
  revalidatePath("/");
  revalidatePath("/proyectos");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Restaura un cliente archivado (vuelve a las listas). Solo administradores.
export async function restoreClient(clientId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "Solo un administrador puede restaurar clientes." };
  const client = await db.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!client) return { ok: false, error: "El cliente no existe." };
  await db.client.update({ where: { id: clientId }, data: { archivedAt: null } });
  await logActivity({ action: "client.restore", summary: `restauró el cliente ${client.name}`, clientId, entityType: "client", entityId: clientId });
  revalidatePath("/clientes");
  revalidatePath("/");
  revalidatePath("/proyectos");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Wrapper para usar restoreClient como `action` de un <form> (debe devolver void).
export async function restoreClientForm(clientId: string): Promise<void> {
  await restoreClient(clientId);
}

// Activa/desactiva un cliente: lo oculta de las listas activas (sidebar, /clientes, inicio)
// sin archivarlo ni tocar nada de su información, y se reactiva cuando llega un proyecto
// nuevo. Distinto de archivar (papelera). Requiere permiso de edición de clientes.
export async function setClientActive(clientId: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!(await canEditClient(clientId))) return { ok: false, error: "No autorizado" };
  const client = await db.client.findUnique({ where: { id: clientId }, select: { name: true, isActive: true } });
  if (!client) return { ok: false, error: "El cliente no existe." };
  if (client.isActive === active) return { ok: true }; // idempotente
  await db.client.update({ where: { id: clientId }, data: { isActive: active } });
  await logActivity({
    action: active ? "client.activate" : "client.deactivate",
    summary: `${active ? "reactivó" : "desactivó"} el cliente ${client.name}`,
    clientId,
    entityType: "client",
    entityId: clientId,
  });
  revalidatePath("/clientes");
  revalidatePath("/");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Borra DEFINITIVAMENTE un cliente desde la papelera (irreversible). Solo sobre clientes ya
// archivados y para quien puede ver la papelera. Cascada: arrastra proyectos, cotizaciones,
// FACTURAS, canal y miembros del cliente. Es destructivo — la UI exige confirmación.
export async function purgeClient(clientId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!hasPermission(session, "ver_papelera")) return { ok: false, error: "No autorizado" };
  const client = await db.client.findUnique({ where: { id: clientId }, select: { name: true, archivedAt: true } });
  if (!client) return { ok: false, error: "El cliente no existe." };
  if (!client.archivedAt) return { ok: false, error: "Primero envía el cliente a la papelera." };
  try {
    await db.client.delete({ where: { id: clientId } });
  } catch {
    return { ok: false, error: "No se pudo borrar el cliente." };
  }
  await logActivity({ action: "client.purge", summary: `borró definitivamente el cliente ${client.name}` });
  revalidatePath("/papelera");
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

// ── Archivos del cliente (ligero): enlaces (Drive/web) y rutas de red SMB ──
// Añade un ENLACE (Drive/web) a la ficha del cliente.
export async function addClientLink(clientId: string, formData: FormData): Promise<void> {
  const session = await getSession();
  if (!(await canEditClient(clientId))) return;
  const name = String(formData.get("name") ?? "").trim();
  const url = safeExternalUrl(String(formData.get("url") ?? ""));
  if (!name || !url) return;
  const kind = url.includes("drive.google.com") ? "DRIVE" : "LINK";
  await db.clientFile.create({ data: { clientId, name, url, kind, uploadedById: session!.id } });
  await logActivity({ action: "client.file.link", summary: `añadió el enlace «${name}»`, clientId, entityType: "client", entityId: clientId });
  revalidatePath(`/clientes/${clientId}`);
}

// Añade una RUTA DE RED (SMB) a la ficha del cliente (no sube nada, solo la ruta para copiar).
export async function addClientNasRoute(clientId: string, formData: FormData): Promise<void> {
  const session = await getSession();
  if (!(await canEditClient(clientId))) return;
  const name = String(formData.get("name") ?? "").trim();
  const path = String(formData.get("path") ?? "").trim();
  if (!name || !path) return;
  if (!/^(\\\\|smb:\/\/|\/\/|[a-zA-Z]:\\|\/)/.test(path) || /^\s*(javascript|data|http):/i.test(path)) return;
  await db.clientFile.create({ data: { clientId, name, path, kind: "NAS", uploadedById: session!.id } });
  await logActivity({ action: "client.file.nas", summary: `añadió la ruta de red «${name}»`, clientId, entityType: "client", entityId: clientId });
  revalidatePath(`/clientes/${clientId}`);
}

// Borra un archivo/referencia del cliente.
export async function deleteClientFile(fileId: string, clientId: string): Promise<void> {
  if (!(await canEditClient(clientId))) return;
  const file = await db.clientFile.findUnique({ where: { id: fileId }, select: { clientId: true, name: true } });
  if (!file || file.clientId !== clientId) return;
  await db.clientFile.delete({ where: { id: fileId } });
  await logActivity({ action: "client.file.delete", summary: `eliminó «${file.name}»`, clientId, entityType: "client", entityId: clientId });
  revalidatePath(`/clientes/${clientId}`);
}
