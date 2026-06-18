"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

// «Listo» en el aviso flotante de Marcebot: marca el canal del bot como leído para que
// el popup no vuelva a salir hasta el próximo mensaje. Solo afecta a la propia membresía.
export async function dismissMarcebotChannel(channelId: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await db.channelMember.updateMany({
    where: { channelId, userId: session.id },
    data: { lastReadAt: new Date() },
  });
}
