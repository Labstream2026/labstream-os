// Configuración del canal WhatsApp (proveedor Evolution API), por variables de entorno.
// Si falta algún dato obligatorio, el canal queda desactivado (el webhook responde 200 pero
// no procesa). Las credenciales NO se guardan en BD: viven en el .env del NAS.
export type WhatsappConfig = {
  baseUrl: string; // EVOLUTION_API_URL, sin barra final
  apiKey: string; // EVOLUTION_API_KEY (header `apikey`)
  instance: string; // EVOLUTION_INSTANCE (nombre de la instancia emparejada)
  webhookToken: string; // WHATSAPP_WEBHOOK_TOKEN: secreto compartido para validar el webhook
  timezone: string; // DEFAULT_TIMEZONE (zona para fechas ambiguas)
};

export function getWhatsappConfig(): WhatsappConfig | null {
  const baseUrl = (process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY || "";
  const instance = process.env.EVOLUTION_INSTANCE || "";
  if (!baseUrl || !apiKey || !instance) return null;
  return {
    baseUrl,
    apiKey,
    instance,
    webhookToken: process.env.WHATSAPP_WEBHOOK_TOKEN || "",
    timezone: process.env.DEFAULT_TIMEZONE || "America/Bogota",
  };
}

// Normaliza un número/jid a solo dígitos (sin +, sin @s.whatsapp.net, sin sufijos de dispositivo).
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const jid = raw.split("@")[0].split(":")[0]; // quita @s.whatsapp.net y :device
  return jid.replace(/\D/g, "");
}
