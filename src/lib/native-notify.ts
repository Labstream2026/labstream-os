// Puente de notificaciones de escritorio. Funciona en dos contextos:
//  - Dentro de la app Tauri (Mac/Win) → plugin nativo `notification` vía
//    `window.__TAURI__.notification` (requiere withGlobalTauri en el wrapper).
//  - En un navegador normal → API `Notification` (avisa con la pestaña abierta;
//    el push en segundo plano lo añade la Fase B con service worker).
// Es seguro llamarlo en SSR (todo va guardado tras `typeof window`).

type TauriNotif = {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<"granted" | "denied" | "default">;
  sendNotification: (o: { title: string; body?: string }) => void;
};

function tauriNotif(): TauriNotif | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __TAURI__?: { notification?: TauriNotif } };
  return w.__TAURI__?.notification ?? null;
}

/** ¿Estamos corriendo dentro del wrapper de escritorio (Tauri)? */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w;
}

/** ¿El navegador soporta notificaciones nativas? */
export function notificationsSupported(): boolean {
  return isTauri() || (typeof window !== "undefined" && "Notification" in window);
}

/** Estado actual del permiso (sin pedirlo). */
export function notifyPermission(): "granted" | "denied" | "default" | "unsupported" {
  if (typeof window === "undefined") return "unsupported";
  if (isTauri()) return "default"; // Tauri lo resuelve al pedirlo
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Pide permiso de notificaciones. Devuelve true si quedó concedido. */
export async function ensureNotifyPermission(): Promise<boolean> {
  const t = tauriNotif();
  if (t) {
    try {
      if (await t.isPermissionGranted()) return true;
      return (await t.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Muestra una notificación nativa si hay permiso. No-op si no se puede. */
export async function showNative(n: {
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<void> {
  const t = tauriNotif();
  if (t) {
    try {
      const granted = (await t.isPermissionGranted()) || (await t.requestPermission()) === "granted";
      if (granted) t.sendNotification({ title: n.title, body: n.body ?? undefined });
    } catch {
      /* best-effort */
    }
    return;
  }
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    // Tag ÚNICO por aviso: antes un tag fijo "labstream" colapsaba los avisos y solo se veía el
    // último (la campana dispara hasta 3 nuevos de una). Con tag único se muestran todos.
    const tag = `labstream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const note = new Notification(n.title, { body: n.body ?? undefined, tag, icon: "/icons/icon-192.png" });
    if (n.link) {
      note.onclick = () => {
        window.focus();
        window.location.href = n.link as string;
      };
    }
  } catch {
    /* best-effort */
  }
}

// ─── Web Push del navegador (segundo plano; NO aplica dentro de Tauri) ────────
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Suscribe este navegador al Web Push (recibe avisos con la pestaña cerrada).
 * En Tauri no aplica (usa la notificación nativa). Devuelve true si quedó suscrito.
 */
export async function subscribeBrowserPush(): Promise<boolean> {
  if (isTauri()) return false;
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    typeof window === "undefined" ||
    !("PushManager" in window)
  ) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const res = await fetch("/api/push/key");
    const { key } = (await res.json()) as { key: string | null };
    if (!key) return false; // sin VAPID configurado en el server
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      }));
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return true;
  } catch {
    return false;
  }
}
