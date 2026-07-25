import { getWhatsappConfig, normalizePhone } from "./config";
import { sendText } from "./client";

// ── Envíos SALIENTES de WhatsApp desde la app ──
// Hasta ahora el canal solo RESPONDÍA a quien escribía (Marcebot). Esto permite iniciar:
// mandarle al cliente el enlace de sus portadas o de su entrega. Sigue usando la misma
// instancia de Evolution API emparejada por QR — no hay proveedor nuevo ni credenciales nuevas.

export const DEFAULT_COUNTRY = process.env.WHATSAPP_DEFAULT_COUNTRY || "57"; // Colombia

// Número escrito por una persona → formato que espera Evolution (solo dígitos, con indicativo).
// `normalizePhone` solo limpia; aquí SÍ se añade el país cuando el número viene local, que es
// como lo escribe todo el mundo («300 123 4567» → «573001234567»).
export function toWhatsappNumber(raw: string, country = DEFAULT_COUNTRY): string | null {
  let d = normalizePhone(raw);
  if (!d) return null;
  // 00 delante = prefijo internacional a la europea.
  if (d.startsWith("00")) d = d.slice(2);
  // Colombia: móvil de 10 dígitos que empieza por 3 → falta el indicativo.
  if (d.length === 10 && country === "57" && d.startsWith("3")) d = country + d;
  else if (d.length <= 10 && !d.startsWith(country)) d = country + d;
  // Rango sano para un número internacional (E.164 admite 8-15).
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

export type WhatsappSendResult = { ok: boolean; error?: string };

// Envía un texto. Devuelve un error legible en vez de un booleano opaco, para que la UI pueda
// decir qué pasó (canal apagado, número inválido, Evolution rechazó).
export async function sendWhatsappText(rawPhone: string, text: string): Promise<WhatsappSendResult> {
  const cfg = getWhatsappConfig();
  if (!cfg) return { ok: false, error: "El canal de WhatsApp no está configurado en el servidor." };
  const phone = toWhatsappNumber(rawPhone);
  if (!phone) return { ok: false, error: "Número de WhatsApp inválido. Escríbelo con indicativo, p. ej. 573001234567." };
  const body = text.trim().slice(0, 3500);
  if (!body) return { ok: false, error: "El mensaje está vacío." };
  const ok = await sendText(cfg, phone, body);
  return ok ? { ok: true } : { ok: false, error: "WhatsApp no aceptó el envío. Revisa que la instancia esté conectada." };
}

// ¿Está el canal disponible? Lo usa la UI para mostrar u ocultar el botón.
export function isWhatsappEnabled(): boolean {
  return getWhatsappConfig() !== null;
}
