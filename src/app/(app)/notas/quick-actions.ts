"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { persistNote } from "@/lib/note-save";

// Apuntar una nota SIN salir del proyecto o del cliente donde estás. La nota nace ya
// vinculada, así que aparece tanto en su pestaña «Notas» como en /notas.
// El acceso al proyecto/cliente lo valida `persistNote` (los mismos helpers que la app);
// si no lo tienes, la nota se guarda sin vínculo en vez de fallar.
export async function quickNote(input: {
  text: string;
  projectId?: string | null;
  clientId?: string | null;
}): Promise<{ ok: boolean; error?: string; note?: { id: string; title: string; snippet: string } }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  if (session.role === "cliente" || session.role === "demo") return { ok: false, error: "Sin permiso para crear notas" };

  const text = (input.text ?? "").trim();
  if (!text) return { ok: false, error: "Escribe algo primero." };

  // Una nota apuntada DESDE un proyecto hereda su cliente: así también sale en la pestaña
  // «Notas» de la cuenta, sin tener que elegirlo a mano.
  let clientId = input.clientId ?? null;
  if (!clientId && input.projectId) {
    const p = await db.project.findUnique({ where: { id: input.projectId }, select: { clientId: true } });
    clientId = p?.clientId ?? null;
  }

  // Título = primera línea (así la nota se reconoce en la lista); el resto queda de cuerpo.
  const firstLine = text.split("\n")[0]!.trim().slice(0, 80);
  const r = await persistNote(session, {
    title: firstLine,
    content: text,
    projectId: input.projectId ?? null,
    clientId,
  });
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/notas");
  if (input.projectId) revalidatePath(`/proyectos/${input.projectId}`);
  if (input.clientId) revalidatePath(`/clientes/${input.clientId}`);
  return { ok: true, note: { id: r.id, title: r.title, snippet: text.replace(/\s+/g, " ").slice(0, 140) } };
}
