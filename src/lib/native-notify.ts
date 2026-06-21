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
    const note = new Notification(n.title, { body: n.body ?? undefined, tag: "labstream" });
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
