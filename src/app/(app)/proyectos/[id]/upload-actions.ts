"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { userCanManageProject } from "@/lib/project-access";
import { isEmailEnabled, sendEmail } from "@/lib/email";
import { signUploadToken } from "@/lib/upload-token";

export type UploadActionResult = { ok: boolean; error?: string; url?: string };

function baseUrl() {
  return (process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "");
}
function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Compartir un enlace de subida con el cliente y elegir dónde cae su material son acciones de
// GESTIÓN del proyecto (no basta con poder verlo), igual que compartir el enlace de revisión.
async function ensureManage(projectId: string) {
  const session = await getSession();
  if (!session || !(await userCanManageProject(projectId, session))) return null;
  return session;
}

// Activa/asegura el enlace público de subida del proyecto (si estaba revocado, lo reactiva) y
// devuelve su URL /subir/[token] para copiar/compartir.
export async function createProjectUploadLink(projectId: string): Promise<UploadActionResult> {
  const session = await ensureManage(projectId);
  if (!session) return { ok: false, error: "Necesitas permiso de gestión del proyecto para compartir el enlace." };
  const nonce = crypto.randomUUID();
  await db.project.update({ where: { id: projectId }, data: { uploadNonce: nonce, uploadRevokedAt: null } });
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true, url: `${baseUrl()}/subir/${signUploadToken(projectId, nonce)}` };
}

// Revoca el enlace: además de marcarlo revocado, ROTA el nonce → cualquier URL filtrada antes queda
// muerta para siempre (aunque luego se regenere, el nuevo enlace lleva otro nonce).
export async function revokeProjectUploadLink(projectId: string): Promise<UploadActionResult> {
  const session = await ensureManage(projectId);
  if (!session) return { ok: false, error: "Sin permiso." };
  await db.project.update({ where: { id: projectId }, data: { uploadRevokedAt: new Date(), uploadNonce: crypto.randomUUID() } });
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true };
}

// Fija la subcarpeta del NAS donde cae el material del proyecto (vacío → carpeta por defecto).
// El valor se sanea al guardar el archivo (projectUploadRelDir): nunca sale de STORAGE_DIR.
export async function setProjectUploadDir(projectId: string, dir: string): Promise<UploadActionResult> {
  const session = await ensureManage(projectId);
  if (!session) return { ok: false, error: "Sin permiso." };
  const clean = dir.trim().slice(0, 200) || null;
  await db.project.update({ where: { id: projectId }, data: { uploadDir: clean } });
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true };
}

// Envía por correo el enlace de subida al cliente.
export async function emailProjectUploadLink(projectId: string, formData: FormData): Promise<UploadActionResult> {
  if (!(await isEmailEnabled())) return { ok: false, error: "El correo no está configurado; copia el enlace y compártelo tú." };
  const session = await ensureManage(projectId);
  if (!session) return { ok: false, error: "Sin permiso." };
  const to = String(formData.get("to") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!isEmail(to)) return { ok: false, error: "Correo del cliente inválido." };
  const p = await db.project.findUnique({ where: { id: projectId }, select: { name: true, uploadNonce: true, uploadRevokedAt: true } });
  // Asegura un enlace activo: si no hay nonce o está revocado, genera uno y lo activa antes de enviar.
  let nonce = p?.uploadNonce ?? null;
  if (!nonce || p?.uploadRevokedAt) {
    nonce = crypto.randomUUID();
    await db.project.update({ where: { id: projectId }, data: { uploadNonce: nonce, uploadRevokedAt: null } });
    revalidatePath(`/proyectos/${projectId}`);
  }
  const url = `${baseUrl()}/subir/${signUploadToken(projectId, nonce)}`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `
    <p>Hola,</p>
    <p>${esc(session.name)} te pide subir tu material${p?.name ? ` para <b>${esc(p.name)}</b>` : ""}. Es rápido y no necesitas crear cuenta.</p>
    ${note ? `<p>${esc(note)}</p>` : ""}
    <p><a href="${url}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Subir mi material</a></p>
    <p style="color:#666;font-size:12px">O copia este enlace: ${url}</p>
    <p style="color:#666;font-size:12px">Labstream Studio</p>`;
  const r = await sendEmail({
    to,
    from: session.email ? `${session.name} <${session.email}>` : undefined,
    replyTo: session.email ?? undefined,
    subject: `Sube tu material${p?.name ? `: ${p.name}` : ""}`,
    html,
    text: `${session.name} te pide subir tu material: ${url}`,
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
