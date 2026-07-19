"use server";

import { revalidatePath } from "next/cache";
import { getSession, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { hexToHslTriplet } from "@/lib/org-settings";
import { saveBuffer, deleteRel } from "@/lib/storage";
import { orgLogoRel, type LogoVariant } from "@/lib/org-logo";

// Guarda el color de marca de la organización (admin). null = restablecer al color por defecto.
export async function saveOrgBranding(primaryColor: string | null): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_integraciones")) return { ok: false, error: "No autorizado" };
  let value: string | null = null;
  if (primaryColor) {
    const hex = primaryColor.trim();
    if (!hexToHslTriplet(hex)) return { ok: false, error: "Color inválido. Usa formato #rrggbb." };
    value = hex.startsWith("#") ? hex.toLowerCase() : `#${hex.toLowerCase()}`;
  }
  await db.orgSettings.upsert({
    where: { id: "default" },
    create: { id: "default", primaryColor: value },
    update: { primaryColor: value },
  });
  revalidatePath("/", "layout"); // re-tiñe toda la app de inmediato
  return { ok: true };
}

// Sube el logo de la organización (PNG). "light" = para fondo claro, "dark" = para fondo oscuro.
// Se guarda en disco (sin columna en BD, sin migración); el endpoint /api/brand-logo lo sirve.
export async function uploadOrgLogo(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_integraciones")) return { ok: false, error: "No autorizado" };
  const variant = String(formData.get("variant") ?? "") as LogoVariant;
  if (variant !== "light" && variant !== "dark") return { ok: false, error: "Variante inválida." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No se recibió ningún archivo." };
  if (file.type !== "image/png") return { ok: false, error: "Solo PNG (con transparencia recomendado)." };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "El PNG supera 2 MB." };
  const buf = Buffer.from(await file.arrayBuffer());
  const rel = orgLogoRel(variant); // "brand/org-logo-<variant>.png"
  const slash = rel.lastIndexOf("/");
  await saveBuffer(rel.slice(0, slash), rel.slice(slash + 1), buf);
  revalidatePath("/", "layout");
  return { ok: true };
}

// Quita el logo subido de una variante (vuelve al de fábrica).
export async function removeOrgLogo(variant: LogoVariant): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_integraciones")) return { ok: false, error: "No autorizado" };
  if (variant !== "light" && variant !== "dark") return { ok: false, error: "Variante inválida." };
  await deleteRel(orgLogoRel(variant));
  revalidatePath("/", "layout");
  return { ok: true };
}
