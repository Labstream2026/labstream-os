"use server";

import { revalidatePath } from "next/cache";
import { getSession, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { hexToHslTriplet } from "@/lib/org-settings";

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
