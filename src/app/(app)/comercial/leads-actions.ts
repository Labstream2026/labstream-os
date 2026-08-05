"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

// Acciones sobre los prospectos que deja el asistente. El permiso se comprueba AQUÍ, en el
// servidor, en cada acción: que el botón no se pinte para quien no puede es cortesía, no candado.
const ESTADOS = ["NUEVO", "CONTACTADO", "COTIZANDO", "GANADO", "PERDIDO"];

export async function cambiarEstadoLead(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!hasPermission(session, "gestionar_leads")) return;
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "").toUpperCase();
  if (!id || !ESTADOS.includes(estado)) return;
  const lead = await db.lead.findUnique({ where: { id }, select: { nombre: true } });
  if (!lead) return;
  await db.lead.update({ where: { id }, data: { estado } });
  await logActivity({
    action: "lead.update",
    summary: `movió el prospecto «${lead.nombre}» a ${estado}`,
    entityType: "lead",
    entityId: id,
  }).catch(() => null);
  revalidatePath("/comercial");
}

export async function tomarLead(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || !hasPermission(session, "gestionar_leads")) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const lead = await db.lead.findUnique({ where: { id }, select: { nombre: true, estado: true } });
  if (!lead) return;
  await db.lead.update({
    where: { id },
    // Tomarlo implica que alguien ya va a llamar: si seguía en NUEVO, avanza solo.
    data: { atendidoPorId: session.id, ...(lead.estado === "NUEVO" ? { estado: "CONTACTADO" } : {}) },
  });
  await logActivity({
    action: "lead.update",
    summary: `tomó el prospecto «${lead.nombre}»`,
    entityType: "lead",
    entityId: id,
  }).catch(() => null);
  revalidatePath("/comercial");
}

// Convierte un prospecto en cliente de verdad. Es un acto HUMANO a propósito: el asistente puede
// registrar prospectos todo el día, pero dar de alta un cliente lo decide una persona.
export async function convertirLeadEnCliente(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || !hasPermission(session, "gestionar_leads") || !hasPermission(session, "crear_clientes")) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const lead = await db.lead.findUnique({ where: { id }, select: { nombre: true, empresa: true, interes: true, mensaje: true, estado: true } });
  if (!lead || lead.estado === "GANADO") return;

  const nombre = lead.empresa || lead.nombre;
  const yaExiste = await db.client.findFirst({ where: { name: { equals: nombre, mode: "insensitive" } }, select: { id: true } });
  const client =
    yaExiste ??
    (await db.client.create({
      data: {
        name: nombre,
        company: lead.empresa,
        description: [lead.interes, lead.mensaje].filter(Boolean).join(" — ").slice(0, 1000) || null,
        emoji: "🏢",
        members: { create: { userId: session.id } },
      },
      select: { id: true },
    }));

  await db.lead.update({ where: { id }, data: { estado: "GANADO", atendidoPorId: session.id } });
  await logActivity({
    action: yaExiste ? "lead.update" : "client.create",
    summary: yaExiste
      ? `marcó ganado el prospecto «${lead.nombre}» (ya existía el cliente «${nombre}»)`
      : `convirtió el prospecto «${lead.nombre}» en el cliente «${nombre}»`,
    clientId: client.id,
    entityType: "client",
    entityId: client.id,
  }).catch(() => null);
  revalidatePath("/comercial");
  revalidatePath("/clientes");
}
