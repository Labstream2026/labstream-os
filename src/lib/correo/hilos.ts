// ── Conversaciones (hilos) al estilo Gmail ──────────────────────────────────
// Un hilo se identifica por su RAÍZ: el primer Message-ID de la cadena. El estándar la trae
// en References (lista ordenada del más viejo al más nuevo); si falta, In-Reply-To apunta al
// padre directo (aproximación suficiente); y un mensaje sin ninguna de las dos ABRE hilo con
// su propio Message-ID. Puro y probado: agrupar mal es mezclar conversaciones de clientes
// distintos en una sola tarjeta — el tipo de error que hace desconfiar de toda la bandeja.

/** La raíz del hilo de un mensaje entrante. */
export function claveHilo(input: { messageId?: string | null; inReplyTo?: string | null; references?: string | null }): string | null {
  const refs = (input.references ?? "").trim();
  if (refs) {
    // References = ids separados por espacios/saltos; el PRIMERO es la raíz de la cadena.
    const primero = refs.split(/\s+/).find((r) => r.startsWith("<") && r.endsWith(">"));
    if (primero) return primero.slice(0, 300);
  }
  if (input.inReplyTo?.trim()) return input.inReplyTo.trim().slice(0, 300);
  if (input.messageId?.trim()) return input.messageId.trim().slice(0, 300);
  return null;
}

/** «Re: Re: RV: Asunto» → «Asunto», para agrupar de respaldo y para pintar el título. */
export function asuntoLimpio(s: string): string {
  let t = s.trim();
  for (let i = 0; i < 8; i++) {
    const antes = t;
    t = t.replace(/^(re|rv|fwd?|fw)\s*(\[\d+\])?\s*:\s*/i, "").trim();
    if (t === antes) break;
  }
  return t || "(sin asunto)";
}

export type MensajeParaHilo = {
  id: string;
  threadKey: string | null;
  subject: string;
  fromEmail: string | null;
  date: Date;
  seen: boolean;
  flagged: boolean;
  folder: string;
};

export type Hilo<M extends MensajeParaHilo> = {
  clave: string;
  mensajes: M[]; // del más viejo al más nuevo
  ultimo: M;
  noLeidos: number;
  destacado: boolean;
};

/**
 * Agrupa mensajes en hilos y los ordena por actividad (el hilo con el mensaje más reciente
 * primero). Mensajes sin threadKey (muy viejos o rotos) agrupan por asunto limpio, para que
 * al menos las cadenas «Re:» del mismo tema queden juntas.
 */
export function agruparHilos<M extends MensajeParaHilo>(mensajes: M[]): Hilo<M>[] {
  const por = new Map<string, M[]>();
  for (const m of mensajes) {
    const clave = m.threadKey ?? `asunto:${asuntoLimpio(m.subject).toLowerCase()}`;
    const arr = por.get(clave) ?? [];
    arr.push(m);
    por.set(clave, arr);
  }
  const hilos: Hilo<M>[] = [];
  for (const [clave, arr] of por) {
    arr.sort((a, b) => a.date.getTime() - b.date.getTime());
    hilos.push({
      clave,
      mensajes: arr,
      ultimo: arr[arr.length - 1],
      noLeidos: arr.filter((m) => !m.seen && m.folder === "INBOX").length,
      destacado: arr.some((m) => m.flagged),
    });
  }
  return hilos.sort((a, b) => b.ultimo.date.getTime() - a.ultimo.date.getTime());
}

/**
 * El cliente del CRM al que pertenece un remitente. Dos niveles, en orden:
 *   1. Coincidencia EXACTA de correo contra los miembros del portal (la de siempre).
 *   2. Coincidencia por DOMINIO contra las reglas CURADAS («@pepsico.com es Pepsico»):
 *      cualquiera de la compañía queda agrupado, no solo la persona registrada.
 * Sin regla explícita NO se adivina por dominio — media Colombia escribe desde gmail.com y
 * etiquetar mal es peor que no etiquetar.
 */
export function clienteDeRemitente(
  fromEmail: string | null | undefined,
  catalogo: { email: string; clientId: string }[],
  dominios?: Map<string, string>,
): string | null {
  if (!fromEmail) return null;
  const e = fromEmail.trim().toLowerCase();
  if (!e) return null;
  const exacto = catalogo.find((c) => c.email === e)?.clientId;
  if (exacto) return exacto;
  const dominio = dominioDe(e);
  return (dominio && dominios?.get(dominio)) || null;
}

/** El dominio de una dirección («maria@ventas.pepsico.com» → «ventas.pepsico.com»). */
export function dominioDe(email: string): string | null {
  const m = /@([a-z0-9.-]+)$/i.exec(email.trim().toLowerCase());
  return m ? m[1] : null;
}

// Dominios de correo GRATUITO/personal: jamás se agrupan como empresa — «gmail.com» sería
// medio mundo bajo un solo cliente. La regla se rechaza al crearla, no falla en silencio.
const DOMINIOS_LIBRES = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "outlook.es", "live.com",
  "msn.com", "yahoo.com", "yahoo.es", "icloud.com", "me.com", "aol.com", "proton.me",
  "protonmail.com", "gmx.com", "zoho.com", "mail.com", "latinmail.com", "terra.com",
]);

export function esDominioAgrupable(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d) && !DOMINIOS_LIBRES.has(d);
}
