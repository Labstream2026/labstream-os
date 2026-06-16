// Cliente CalDAV por usuario para Synology Calendar. Hace descubrimiento (RFC 6764),
// lista calendarios, y permite escribir/borrar/leer eventos en la colección elegida.
// Acepta certificados auto-firmados del NAS si CALDAV_INSECURE_TLS=true.

const INSECURE = process.env.CALDAV_INSECURE_TLS === "true";

// undici se carga perezosamente solo en runtime de servidor (no en bundle cliente/edge).
let dispatcherPromise: Promise<unknown> | undefined;
function getDispatcher(): Promise<unknown> {
  if (!INSECURE) return Promise.resolve(undefined);
  if (!dispatcherPromise) {
    dispatcherPromise = import("undici").then(
      ({ Agent }) => new Agent({ connect: { rejectUnauthorized: false } }),
    );
  }
  return dispatcherPromise;
}

export type CalDavAuth = { serverUrl: string; username: string; password: string };
export type CalendarCollection = { url: string; name: string };
export type RemoteEvent = { href: string; etag: string | null; ics: string };

function authHeader(a: CalDavAuth) {
  return "Basic " + Buffer.from(`${a.username}:${a.password}`).toString("base64");
}

// Resuelve un href (posiblemente relativo) contra el origen del servidor.
function absoluteUrl(serverUrl: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const origin = new URL(serverUrl).origin;
  return origin + (href.startsWith("/") ? href : `/${href}`);
}

type FetchInit = RequestInit & { dispatcher?: unknown };
async function dav(url: string, init: FetchInit, timeoutMs = 12000): Promise<Response> {
  const dispatcher = await getDispatcher();
  return fetch(url, {
    ...init,
    dispatcher,
    signal: AbortSignal.timeout(timeoutMs),
  } as RequestInit);
}

// ── Parseo ligero de multistatus (sin librería XML) ──────────────────────────
// Quita prefijos de namespace (d:, cal:, C:, x1:) para casar por nombre local.
function tagContent(xml: string, local: string): string | null {
  const re = new RegExp(`<[a-z0-9]*:?${local}[^>]*>([\\s\\S]*?)</[a-z0-9]*:?${local}>`, "i");
  const m = re.exec(xml);
  return m ? m[1] : null;
}
function splitResponses(xml: string): string[] {
  return xml.split(/<[a-z0-9]*:?response[\s>]/i).slice(1).map((s) => s.replace(/<\/[a-z0-9]*:?response>[\s\S]*$/i, ""));
}
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#13;/g, "").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

// ── Descubrimiento RFC 6764 ──────────────────────────────────────────────────
async function propfind(a: CalDavAuth, url: string, depth: "0" | "1", body: string): Promise<string> {
  const res = await dav(url, {
    method: "PROPFIND",
    headers: { Authorization: authHeader(a), Depth: depth, "Content-Type": "application/xml; charset=utf-8" },
    body,
  });
  if (res.status === 401) throw new Error("Credenciales CalDAV incorrectas (401).");
  if (res.status !== 207 && !res.ok) throw new Error(`El servidor respondió ${res.status}.`);
  return res.text();
}

// Descubre las colecciones de calendario del usuario y devuelve las que se pueden
// escribir (las que aceptan VEVENT).
export async function discoverCalendars(a: CalDavAuth): Promise<CalendarCollection[]> {
  // 1) principal del usuario.
  const principalXml = await propfind(
    a, a.serverUrl, "0",
    `<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
  );
  const principalHref = tagContent(tagContent(principalXml, "current-user-principal") ?? "", "href")?.trim();
  const principalUrl = principalHref ? absoluteUrl(a.serverUrl, principalHref) : a.serverUrl;

  // 2) calendar-home-set del principal.
  const homeXml = await propfind(
    a, principalUrl, "0",
    `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`,
  );
  const homeHref = tagContent(tagContent(homeXml, "calendar-home-set") ?? "", "href")?.trim();
  const homeUrl = homeHref ? absoluteUrl(a.serverUrl, homeHref) : principalUrl;

  // 3) listar colecciones bajo el home (Depth:1) y quedarnos con los calendarios.
  const listXml = await propfind(
    a, homeUrl, "1",
    `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/></d:prop></d:propfind>`,
  );
  const out: CalendarCollection[] = [];
  for (const r of splitResponses(listXml)) {
    const href = tagContent(r, "href")?.trim();
    if (!href) continue;
    const isCalendar = /<[a-z0-9]*:?calendar[\s/>]/i.test(tagContent(r, "resourcetype") ?? "");
    if (!isCalendar) continue;
    // Solo calendarios que aceptan VEVENT (no de tareas/contactos).
    const comps = tagContent(r, "supported-calendar-component-set") ?? "";
    if (comps && !/VEVENT/i.test(comps)) continue;
    const name = decodeEntities((tagContent(r, "displayname") ?? "").trim()) || "Calendario";
    out.push({ url: absoluteUrl(a.serverUrl, href), name });
  }
  return out;
}

// Prueba de conexión: si descubre al menos un calendario, está OK.
export async function testConnection(a: CalDavAuth): Promise<{ ok: boolean; error?: string; calendars?: CalendarCollection[] }> {
  try {
    const calendars = await discoverCalendars(a);
    if (!calendars.length) return { ok: false, error: "Conectó, pero no se encontró ningún calendario con eventos." };
    return { ok: true, calendars };
  } catch (e) {
    const m = e instanceof Error ? e.message : "error de conexión";
    return { ok: false, error: /certificate|self-signed|TLS/i.test(m) ? `${m} (prueba CALDAV_INSECURE_TLS=true)` : m };
  }
}

// ── Escritura ────────────────────────────────────────────────────────────────
// Crea/actualiza un .ics en la colección. href = calendarUrl + uid + ".ics".
// Devuelve { href, etag } (el etag puede venir null si el server no lo manda).
export async function putEvent(a: CalDavAuth, calendarUrl: string, uid: string, ics: string): Promise<{ href: string; etag: string | null }> {
  const href = calendarUrl.replace(/\/$/, "") + `/${encodeURIComponent(uid)}.ics`;
  const res = await dav(href, {
    method: "PUT",
    headers: { Authorization: authHeader(a), "Content-Type": "text/calendar; charset=utf-8" },
    body: ics,
  });
  if (!res.ok && res.status !== 201 && res.status !== 204) {
    throw new Error(`PUT respondió ${res.status}`);
  }
  return { href, etag: res.headers.get("etag") };
}

export async function deleteEvent(a: CalDavAuth, href: string): Promise<boolean> {
  const url = absoluteUrl(a.serverUrl, href);
  const res = await dav(url, { method: "DELETE", headers: { Authorization: authHeader(a) } });
  return res.ok || res.status === 404; // 404 = ya no existe → idempotente
}

// ── Lectura (pull) ────────────────────────────────────────────────────────────
// calendar-query: trae los VEVENT del calendario en una ventana de tiempo, con su
// etag y datos. Suficiente y robusto para un equipo pequeño (sondeo cada pocos min).
export async function queryEvents(a: CalDavAuth, calendarUrl: string, from: Date, to: Date): Promise<RemoteEvent[]> {
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}T000000Z`;
  const body =
    `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">` +
    `<d:prop><d:getetag/><c:calendar-data/></d:prop>` +
    `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">` +
    `<c:time-range start="${fmt(from)}" end="${fmt(to)}"/>` +
    `</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const res = await dav(calendarUrl, {
    method: "REPORT",
    headers: { Authorization: authHeader(a), Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
    body,
  });
  if (res.status === 401) throw new Error("Credenciales CalDAV incorrectas (401).");
  if (res.status !== 207 && !res.ok) throw new Error(`REPORT respondió ${res.status}.`);
  const xml = await res.text();
  const out: RemoteEvent[] = [];
  for (const r of splitResponses(xml)) {
    const href = tagContent(r, "href")?.trim();
    const data = tagContent(r, "calendar-data");
    if (!href || !data) continue;
    const etag = tagContent(r, "getetag")?.trim() ?? null;
    out.push({ href: absoluteUrl(a.serverUrl, href), etag, ics: decodeEntities(data) });
  }
  return out;
}
