"use client";

import { pendientes } from "./cola";

// Ids de las notas que están EN LA COLA offline (sin sincronizar). La cola es la única verdad
// de «esto aún no llegó al servidor»: el editor se suscribe a `alCambiarCola` y refleja estos
// ids con un chip «pendiente» en cada nota. Al sincronizarse, la op sale de la cola y el chip
// desaparece solo. Vive aparte de guardar-nota.ts para no arrastrar el server action.
export async function notasPendientes(): Promise<Set<string>> {
  const ops = await pendientes();
  const pre = "note-save:";
  const s = new Set<string>();
  for (const op of ops) if (op.opId.startsWith(pre)) s.add(op.opId.slice(pre.length));
  return s;
}
