"use server";

import { revalidatePath } from "next/cache";
import { getSession, hasPermission } from "@/lib/auth";
import { siigoInvalidar } from "@/lib/siigo";

// El botón «Actualizar» de la pestaña Siigo: tira la caché de 5 minutos y repinta.
// Misma llave que la página entera (ver_finanzas); no toca Siigo directamente — la
// siguiente lectura de la página es la que vuelve a preguntar.
export async function refrescarSiigo(): Promise<void> {
  const session = await getSession();
  if (!session || !hasPermission(session, "ver_finanzas")) return;
  siigoInvalidar();
  revalidatePath("/facturacion");
}
