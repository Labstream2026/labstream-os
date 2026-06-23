import type { WhatsappConfig } from "./config";

// Cliente mínimo de Evolution API. Dos operaciones: enviar texto y bajar media (audio) en base64.
// Header de auth: `apikey`. Endpoints de Evolution v2.

// Envía un mensaje de texto al número (solo dígitos, formato internacional, p. ej. "57300...").
export async function sendText(cfg: WhatsappConfig, phone: string, text: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`${cfg.baseUrl}/message/sendText/${encodeURIComponent(cfg.instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
      body: JSON.stringify({ number: phone, text }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Descarga el contenido (base64) de un mensaje multimedia (audio). `messageData` es el objeto
// `data` del webhook (con su `key` y `message`). Devuelve { buffer, mime } o null.
export async function getMediaBase64(
  cfg: WhatsappConfig,
  messageData: unknown,
): Promise<{ buffer: Buffer; mime: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(cfg.instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
      body: JSON.stringify({ message: messageData, convertToMp4: false }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { base64?: string; mimetype?: string } | null;
    if (!data?.base64) return null;
    return { buffer: Buffer.from(data.base64, "base64"), mime: data.mimetype || "audio/ogg" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
