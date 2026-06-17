"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";

// El catálogo de servicios es INTERNO; editarlo requiere crear_cotizaciones.
async function requireQuotes() {
  const session = await getSession();
  if (!hasPermission(session, "crear_cotizaciones")) throw new Error("No autorizado");
  return session!;
}

function refresh() {
  revalidatePath("/cotizaciones");
}

// Crea un ítem en un tipo de servicio + sección (precio 0 por defecto).
export async function createServiceItem(serviceType: string, section: string): Promise<void> {
  await requireQuotes();
  const count = await db.serviceItem.count({ where: { serviceType, section } });
  await db.serviceItem.create({
    data: { serviceType, section: section.trim() || "General", name: "Nuevo servicio", unit: "servicio", position: count },
  });
  refresh();
}

// Edita un campo del ítem (nombre, detalle, unidad, cantidad, precio o sección).
export async function updateServiceItem(
  id: string,
  data: { name?: string; detail?: string; unit?: string; qty?: number; unitPrice?: number; section?: string },
): Promise<void> {
  await requireQuotes();
  const patch: Record<string, unknown> = {};
  if (typeof data.name === "string") patch.name = data.name.trim().slice(0, 120) || "Servicio";
  if (typeof data.detail === "string") patch.detail = data.detail.trim().slice(0, 240) || null;
  if (typeof data.unit === "string") patch.unit = data.unit.trim().slice(0, 24) || "servicio";
  if (typeof data.qty === "number" && Number.isFinite(data.qty)) patch.qty = Math.max(0, data.qty);
  if (typeof data.unitPrice === "number" && Number.isFinite(data.unitPrice)) patch.unitPrice = Math.max(0, Math.round(data.unitPrice));
  if (typeof data.section === "string" && data.section.trim()) patch.section = data.section.trim().slice(0, 60);
  if (Object.keys(patch).length === 0) return;
  await db.serviceItem.update({ where: { id }, data: patch });
  refresh();
}

export async function deleteServiceItem(id: string): Promise<void> {
  await requireQuotes();
  await db.serviceItem.delete({ where: { id } }).catch(() => {});
  refresh();
}

// Añade una sección nueva (creando su primer ítem) dentro de un tipo de servicio.
export async function addServiceSection(serviceType: string, section: string): Promise<void> {
  await requireQuotes();
  const name = section.trim().slice(0, 60);
  if (!name) return;
  await db.serviceItem.create({ data: { serviceType, section: name, name: "Nuevo servicio", unit: "servicio", position: 0 } });
  refresh();
}

// Ajustes globales: % transporte/imprevistos e IVA por defecto.
export async function setQuoteSettings(data: { iva?: number; contingencyPct?: number; contingencyLabel?: string }): Promise<void> {
  await requireQuotes();
  const patch: Record<string, unknown> = {};
  if (typeof data.iva === "number" && Number.isFinite(data.iva)) patch.iva = Math.max(0, Math.min(100, Math.round(data.iva)));
  if (typeof data.contingencyPct === "number" && Number.isFinite(data.contingencyPct)) patch.contingencyPct = Math.max(0, Math.min(100, data.contingencyPct));
  if (typeof data.contingencyLabel === "string" && data.contingencyLabel.trim()) patch.contingencyLabel = data.contingencyLabel.trim().slice(0, 60);
  if (Object.keys(patch).length === 0) return;
  await db.quoteSettings.upsert({ where: { id: "default" }, create: { id: "default", ...patch }, update: patch });
  refresh();
}
