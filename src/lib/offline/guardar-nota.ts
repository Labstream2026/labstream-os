"use client";

import { saveNote } from "@/app/(app)/notas/actions";
import type { NoteSaveInput, NoteSaveResult } from "@/lib/note-save";
import { encolar } from "./cola";

// ── Guardado de nota RESILIENTE (Fase 1 offline) ──
// Online: usa el server action de siempre (resultado rico, control de conflicto «ask»). Si el
// guardado NO llega —sin internet o NAS caído, el server action REVIENTA en el fetch de fondo—,
// la nota se ENCOLA para reenviarla cuando vuelva, y la UI la marca «pendiente». Nada se pierde.
//
// Requiere que la nota tenga `id` (lo genera el editor al crearla, ver notes-app). El opId es
// `note-save:<id>`: guardar la misma nota otra vez offline SOBREESCRIBE la entrada en cola con el
// último contenido, y al reenviar el servidor la UPSERTA por su id (idempotente, sin duplicar).
//
// OJO: un {ok:false} DEVUELTO (conflicto real, permiso) NO se encola —eso no es una caída de
// red, es una respuesta del servidor— y se propaga tal cual al editor.

export type ResultadoGuardar = NoteSaveResult & { pendiente?: boolean };

export async function guardarNotaResiliente(input: NoteSaveInput, opts?: { force?: boolean }): Promise<ResultadoGuardar> {
  try {
    return await saveNote(input, opts);
  } catch {
    // El server action no llegó (offline / servidor caído). Se encola si la nota tiene id.
    if (!input.id) {
      return { ok: false, error: "Sin conexión: crea la nota otra vez cuando vuelva el servidor." };
    }
    const ahora = new Date().toISOString();
    const titulo = (input.title ?? "").trim() || (input.content ?? "").trim().replace(/\s+/g, " ").slice(0, 40) || "Nota sin título";
    await encolar({
      opId: `note-save:${input.id}`,
      kind: "note-save",
      endpoint: "/api/notas/autosave",
      body: input,
      createdAt: Date.now(),
      etiqueta: `Nota: ${titulo}`,
    });
    // La UI sigue como si se hubiera guardado, pero marcada «pendiente»: el trabajo está a salvo
    // en la cola local. createdAt/updatedAt optimistas para que el editor no se atasque.
    return { ok: true, id: input.id, title: titulo, createdAt: ahora, updatedAt: ahora, pendiente: true };
  }
}
