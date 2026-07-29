"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/auth";
import { userCanManageClient, userCanAccessClient } from "@/lib/client-access";
import { galeriaWriteSession } from "@/lib/galeria-access";
import { conflictoDeVinculo } from "@/lib/galeria-vinculos";
import {
  createGaleriaFolder,
  ensureGaleriaDir,
  normalizeGaleriaRel,
  sanitizeGaleriaName,
  statGaleria,
} from "@/lib/nas-galeria";
import { logActivity } from "@/lib/activity";

// ── Carpeta del cliente en la Galería, gestionada DESDE SU FICHA (Ajustes) ──
// La regla de la casa: todo cliente tiene su carpeta en la RAÍZ de Entregas_LAB, con su
// nombre. Esta acción la crea y la vincula en un paso (o la adopta si ya existe una carpeta
// con ese nombre sin dueño, que es el caso de los clientes históricos), y si el vínculo ya
// existe pero la carpeta desapareció del disco, la vuelve a crear en la misma ruta.
// Vincular una carpeta CUALQUIERA ya existente sigue siendo trabajo de
// vincularCarpetaCliente (galeria/herramientas-actions), que la tarjeta también usa.

export type CarpetaClienteResultado = { ok: true; rel: string } | { error: string };

export async function crearCarpetaClienteGaleria(clientId: string): Promise<CarpetaClienteResultado> {
  // Mismas dos llaves que vincular desde la galería: escribir en los discos + poder editar
  // ESTE cliente (gestionarlo, o el permiso global con acceso a la ficha).
  const session = await galeriaWriteSession();
  if (!session) return { error: "Necesitas el permiso «Escribir en los discos»." };
  const puedeEditar =
    (await userCanManageClient(clientId, session)) ||
    (hasPermission(session, "editar_clientes") && (await userCanAccessClient(clientId, session)));
  if (!puedeEditar) return { error: "No puedes editar este cliente." };

  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, galeriaFolder: true, archivedAt: true },
  });
  if (!client) return { error: "Cliente no encontrado." };
  if (client.archivedAt) return { error: "Este cliente está en la papelera." };

  try {
    // Ya vinculado → solo garantizar que la carpeta exista (recrearla si se borró del disco).
    if (client.galeriaFolder) {
      const rel = await ensureGaleriaDir(client.galeriaFolder);
      revalidatePath("/galeria");
      revalidatePath(`/clientes/${clientId}`);
      return { ok: true, rel };
    }

    // Sin vínculo → carpeta con el nombre del cliente en la raíz.
    const rel = normalizeGaleriaRel(sanitizeGaleriaName(client.name));
    const conflicto = await conflictoDeVinculo(rel, { clientId });
    if (conflicto) return { error: conflicto };

    const st = await statGaleria(rel);
    if (st && !st.dir) return { error: `En la raíz ya hay un ARCHIVO llamado «${rel}»; renómbralo en el disco.` };
    const adoptada = !!st?.dir; // ya existía (cliente histórico): se adopta, no se duplica
    if (!adoptada) await createGaleriaFolder("", client.name);

    await db.client.update({ where: { id: clientId }, data: { galeriaFolder: rel } });
    await logActivity({
      action: "galeria.vinculo_cliente",
      summary: adoptada
        ? `vinculó a ${client.name} con su carpeta «${rel}» de la galería`
        : `creó la carpeta «${rel}» en la galería y la vinculó a ${client.name}`,
      clientId,
      entityType: "client",
      entityId: clientId,
      userId: session.id,
    });
    revalidatePath("/galeria");
    revalidatePath(`/clientes/${clientId}`);
    return { ok: true, rel };
  } catch (e) {
    return { error: e instanceof Error && e.message ? e.message : "No se pudo crear la carpeta." };
  }
}
