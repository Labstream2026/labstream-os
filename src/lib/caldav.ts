import { Agent } from "undici";
import { buildIcs, type IcsEvent } from "@/lib/ics";

// Sincroniza citas INTERNAS del equipo al Synology Calendar vía CalDAV.
// Gateado por env: sin CALDAV_URL/USER/PASSWORD no hace nada (best-effort, nunca
// rompe el flujo). CALDAV_URL = URL de la colección de calendario en el NAS.
const URL_BASE = (process.env.CALDAV_URL || "").replace(/\/$/, "");
const USER = process.env.CALDAV_USER;
const PASSWORD = process.env.CALDAV_PASSWORD;
// Synology Calendar local suele tener cert auto-firmado → permitir aceptarlo.
const INSECURE = process.env.CALDAV_INSECURE_TLS === "true";

export const caldavEnabled = Boolean(URL_BASE && USER && PASSWORD);

function authHeader() {
  return "Basic " + Buffer.from(`${USER}:${PASSWORD}`).toString("base64");
}

// Dispatcher que acepta certificados auto-firmados del NAS cuando CALDAV_INSECURE_TLS=true.
const insecureDispatcher = INSECURE ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;

type FetchInit = RequestInit & { dispatcher?: unknown };
function caldavFetch(url: string, init: FetchInit): Promise<Response> {
  return fetch(url, { ...init, dispatcher: insecureDispatcher } as RequestInit);
}

// Crea/actualiza un evento en el calendario del NAS (idempotente por uid). Best-effort.
export async function pushEventToSynology(event: IcsEvent): Promise<boolean> {
  if (!caldavEnabled) return false;
  try {
    const ics = buildIcs({ ...event, method: "PUBLISH" });
    const res = await caldavFetch(`${URL_BASE}/${encodeURIComponent(event.uid)}.ics`, {
      method: "PUT",
      headers: { Authorization: authHeader(), "Content-Type": "text/calendar; charset=utf-8" },
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
    const res = await caldavFetch(`${URL_BASE}/${encodeURIComponent(uid)}.ics`, {
      method: "DELETE",
      headers: { Authorization: authHeader() },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Prueba de conexión (para el panel de Integraciones): OPTIONS a la colección.
export async function testCaldav(): Promise<{ ok: boolean; error?: string }> {
  if (!caldavEnabled) return { ok: false, error: "CalDAV no configurado (faltan CALDAV_*)." };
  try {
    const res = await caldavFetch(`${URL_BASE}/`, {
      method: "OPTIONS",
      headers: { Authorization: authHeader() },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) return { ok: false, error: "Credenciales CalDAV incorrectas (401)." };
    if (!res.ok && res.status !== 207) return { ok: false, error: `El servidor respondió ${res.status}.` };
    return { ok: true };
  } catch (e) {
    const m = e instanceof Error ? e.message : "error de conexión";
    return { ok: false, error: /certificate|self-signed|TLS/i.test(m) ? `${m} (prueba CALDAV_INSECURE_TLS=true)` : m };
  }
}
