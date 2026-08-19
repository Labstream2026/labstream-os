"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageProject, PROJECT_ACCESS_SELECT } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";

// ── Contactos de correo del PROYECTO ─────────────────────────────────────────
// Las direcciones del cliente a las que se le manda la información de ESTE proyecto. Con
// ellas, el botón «Escribir al cliente» abre el compositor del buzón propio ya dirigido.

const RE_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function proyectoSiGestiono(projectId: string) {
  const session = await getSession();
  if (!session || session.role === "demo" || session.role === "cliente") return null;
  const proyecto = await db.project.findUnique({ where: { id: projectId }, select: { ...PROJECT_ACCESS_SELECT, id: true, name: true } });
  if (!proyecto || !canManageProject(proyecto, session)) return null;
  return session;
}

export async function agregarContactoProyecto(projectId: string, fd: FormData): Promise<void> {
  const session = await proyectoSiGestiono(projectId);
  if (!session) return;
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const nombre = String(fd.get("nombre") ?? "").trim().slice(0, 120) || null;
  // El input es type=email required: lo inválido casi no llega; lo que llegue, se ignora.
  if (!RE_MAIL.test(email)) return;
  await db.projectContact.upsert({
    where: { projectId_email: { projectId, email } },
    create: { projectId, email, nombre, createdById: session.id },
    update: { nombre },
  });
  await logActivity({ action: "proyecto.contacto", summary: `agregó el contacto ${email} al proyecto`, projectId, entityType: "proyecto", silent: true });
  revalidatePath(`/proyectos/${projectId}`);
}

export async function quitarContactoProyecto(projectId: string, email: string): Promise<void> {
  const session = await proyectoSiGestiono(projectId);
  if (!session) return;
  await db.projectContact.deleteMany({ where: { projectId, email: email.trim().toLowerCase() } });
  revalidatePath(`/proyectos/${projectId}`);
}
