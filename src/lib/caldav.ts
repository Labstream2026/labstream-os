import { buildIcs, type IcsEvent } from "@/lib/ics";

// Sincroniza citas INTERNAS del equipo al Synology Calendar vía CalDAV.
// Gateado por env: sin CALDAV_URL/USER/PASSWORD no hace nada (best-effort, nunca
// rompe el flujo de la app). CALDAV_URL = URL de la colección de calendario en el NAS.
const URL_BASE = (process.env.CALDAV_URL || "").replace(/\/$/, "");
const USER = process.env.CALDAV_USER;
const PASSWORD = process.env.CALDAV_PASSWORD;

export const caldavEnabled = Boolean(URL_BASE && USER && PASSWORD);

function authHeader() {
  return "Basic " + Buffer.from(`${USER}:${PASSWORD}`).toString("base64");
}

// Crea/actualiza un evento en el calendario del NAS (idempotente por uid).
// Devuelve true si se sincronizó; nunca lanza (best-effort).
export async function pushEventToSynology(event: IcsEvent): Promise<boolean> {
  if (!caldavEnabled) return false;
  try {
    const ics = buildIcs({ ...event, method: "PUBLISH" });
    const res = await fetch(`${URL_BASE}/${encodeURIComponent(event.uid)}.ics`, {
      method: "PUT",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "text/calendar; charset=utf-8",
      },
      body: ics,
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteEventFromSynology(uid: string): Promise<boolean> {
  if (!caldavEnabled) return false;
  try {
    const res = await fetch(`${URL_BASE}/${encodeURIComponent(uid)}.ics`, {
      method: "DELETE",
      headers: { Authorization: authHeader() },
    });
    return res.ok;
  } catch {
    return false;
  }
}
