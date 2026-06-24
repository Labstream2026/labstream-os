import { higgsfield, config } from "@higgsfield/client/v2";

// Generación de imágenes con IA (Higgsfield Cloud). Las credenciales viven en el .env del NAS
// como HF_CREDENTIALS="KEY_ID:KEY_SECRET" (se obtienen en cloud.higgsfield.ai). Si falta, la
// herramienta del agente lo reporta con un mensaje claro en vez de fallar en silencio.

let configured = false;

export function higgsfieldReady(): boolean {
  return !!process.env.HF_CREDENTIALS;
}

// Normaliza lo que pida el usuario/agente a una relación de aspecto válida de Higgsfield.
export function normalizeAspect(raw: string | null | undefined): string {
  const s = (raw || "").toLowerCase().trim();
  if (!s) return "1:1";
  if (/9:16|vertical|story|reel|tiktok|9x16/.test(s)) return "9:16";
  if (/16:9|horizontal|paisaje|landscape|16x9/.test(s)) return "16:9";
  if (/4:3|4x3/.test(s)) return "4:3";
  if (/3:4|3x4/.test(s)) return "3:4";
  return "1:1"; // cuadrado / instagram por defecto
}

// Genera una imagen a partir de un prompt y devuelve su URL. Lanza un Error con mensaje claro
// (p. ej. "Not enough credits") que el llamador puede mostrar al usuario.
export async function generateImage(prompt: string, aspectRatio = "1:1"): Promise<{ url: string }> {
  const creds = process.env.HF_CREDENTIALS;
  if (!creds) throw new Error("Falta HF_CREDENTIALS en el servidor (credenciales de Higgsfield).");
  if (!configured) {
    config({ credentials: creds });
    configured = true;
  }
  const res = await higgsfield.subscribe("flux-pro/kontext/max/text-to-image", {
    input: { prompt, aspect_ratio: aspectRatio, safety_tolerance: 2 },
    withPolling: true,
  });
  if (res.status === "nsfw") throw new Error("La imagen se rechazó por el filtro de contenido. Cambia la descripción.");
  const url = res.images?.[0]?.url;
  if (res.status !== "completed" || !url) throw new Error(`La generación no entregó imagen (estado: ${res.status}).`);
  return { url };
}
