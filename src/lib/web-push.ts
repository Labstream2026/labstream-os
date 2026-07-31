import webpush from "web-push";
import { db } from "@/lib/db";

// Web Push para el navegador (no aplica dentro de Tauri). Si no hay claves VAPID
// configuradas, todo queda desactivado de forma silenciosa (no rompe nada).

let configured = false;
function ensureConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:hola@labstream.co";
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
  }
  return true;
}

export function webPushEnabled(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export type PushAction = { action: string; title: string };
export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  // Icono de marca y tag de agrupación (el service worker los usa al mostrar la notificación).
  // Con un tag por entidad, un aviso nuevo del mismo origen reemplaza al anterior sin tapar a
  // los demás; sin tag por defecto cada aviso es único y no se pisan.
  icon?: string;
  tag?: string;
  // Datos y botones de acción para el service worker (p. ej. posponer/hecho de un recordatorio).
  data?: Record<string, unknown>;
  actions?: PushAction[];
};

/** Envía un push a todas las suscripciones del usuario. Best-effort: borra las
 *  suscripciones muertas (404/410) y nunca lanza.
 *
 *  DEVUELVE EL RESULTADO en vez de tragárselo. Antes cualquier fallo distinto de 404/410
 *  desaparecía sin dejar rastro, y «el push no llega» era indistinguible de «el push no se
 *  intentó»: con dos suscripciones reales en la base no había forma de saber si los envíos
 *  estaban saliendo bien. Los fallos raros se anotan además en el registro del servidor,
 *  que es donde se va a mirar cuando alguien diga que no le llegó. */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ enviados: number; caducadas: number; fallidos: number }> {
  const nada = { enviados: 0, caducadas: 0, fallidos: 0 };
  if (!ensureConfigured()) return nada;
  let subs: { id: string; endpoint: string; p256dh: string; auth: string }[];
  try {
    subs = await db.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
  } catch {
    return nada;
  }
  if (!subs.length) return nada;
  const data = JSON.stringify(payload);
  const resultado = { ...nada };
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data,
        );
        resultado.enviados++;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          // Suscripción muerta (navegador reinstalado, permiso retirado): se limpia y no es
          // un fallo — es el ciclo de vida normal de una suscripción.
          resultado.caducadas++;
          await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          resultado.fallidos++;
          console.error(`[push] envío fallido (HTTP ${code ?? "?"}) a ${s.endpoint.slice(0, 60)}…`);
        }
      }
    }),
  );
  return resultado;
}
