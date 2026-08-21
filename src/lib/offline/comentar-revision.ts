"use client";

import { addReviewComment } from "@/app/review/[token]/actions";
import { encolar } from "./cola";

// ── Comentario/corrección de revisión RESILIENTE (Fase 2 offline) ──
// El portal de revisión autoriza por TOKEN, no por sesión. Online: usa el server action de
// siempre. El `clientId` viaja también online → reenviar por la cola con el mismo id no duplica
// (addReviewComment hace create-si-no-existe por ese id). El FormData incluye el DIBUJO como data
// URI (`drawingData`); al encolar se serializa a objeto plano (IndexedDB lo guarda sin problema).
// Rechazos de ritmo/token se RELANZAN (no son caída de red): review-stage los atrapa y muestra el
// aviso, igual que hoy. Solo una caída real encola (y resuelve sin lanzar → comentario optimista).
// Contrato calcado del de addReviewComment: lanza en fallo, resuelve en éxito. La variante de FOTO
// (setPhotoDrawing, que escribe en disco del servidor) NO pasa por aquí.

export async function comentarRevisionResiliente(token: string, formData: FormData): Promise<void> {
  const id = crypto.randomUUID();
  formData.set("clientId", id);
  try {
    await addReviewComment(token, formData);
  } catch (e) {
    const msg = (e as Error).message ?? "";
    // Rechazo permanente o límite de ritmo: es respuesta del servidor, no caída de red → relanzar.
    if (/demasiad|inválid|no está disponible|caducad|revisión interna/i.test(msg)) throw e;
    const body: Record<string, string> = {};
    formData.forEach((v, k) => {
      if (typeof v === "string") body[k] = v;
    });
    await encolar({
      opId: `review-comment:${id}`,
      kind: "review-comment",
      endpoint: `/api/review/${encodeURIComponent(token)}/comentario`,
      body,
      createdAt: Date.now(),
      etiqueta: "Corrección de revisión",
    });
    // Resuelve sin lanzar: review-stage muestra el comentario optimista y limpia el cuadro; la cola
    // lo enviará al volver la red.
  }
}
