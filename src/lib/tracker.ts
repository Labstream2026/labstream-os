import { createHash, randomBytes } from "node:crypto";

// Credenciales del RASTREADOR de trabajo (modelo TrackerDevice). Mismo diseño que las llaves
// lsk_ de la API (ver api-key.ts) pero en un ESPACIO APARTE a propósito: un token ltk_ robado
// no abre la API — solo sirve para subir bloques de uso del equipo al que pertenece, y se
// revoca desde Ajustes. El secreto se entrega UNA vez (viaja directo al sensor por evento
// Tauri, sin pasar por manos humanas) y en BD solo vive su sha256.

export const TRACKER_PREFIX = "ltk_"; // "labstream tracker key"

export function hashTrackerToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function generateTrackerToken(): { raw: string; tokenHash: string } {
  const raw = TRACKER_PREFIX + randomBytes(24).toString("base64url");
  return { raw, tokenHash: hashTrackerToken(raw) };
}

// ── Validación del lote que sube el sensor ──
// El payload viene de código nuestro, pero el endpoint es internet: se valida TODO con topes
// duros y lo inválido se descarta sin tumbar el lote entero (el sensor reintenta con lo mismo).
export type BloqueEntrante = {
  s: number; // startedAt en ms unix
  d: number; // segundos del bloque
  a: number; // segundos con actividad de entrada
  app: string;
  t?: string; // título de ventana (opcional)
};

export type BloqueLimpio = {
  startedAt: Date;
  seconds: number;
  activeSecs: number;
  app: string;
  title: string;
};

const MAX_BLOQUES = 720; // ~1 día de bloques minuto a minuto; un lote normal trae <40
const MAX_APP = 80;
const MAX_TITULO = 140;
const MAX_SEG = 3600;
const DIA = 86_400_000;

// ── ¿De qué trabajo era este rato? ──
// El título de la ventana suele decirlo: DaVinci Resolve pone «Dermakind agosto - DaVinci
// Resolve», Premiere «Skala_v3.prproj», y el navegador el nombre de la pestaña. Se busca el
// nombre del PROYECTO y, si no, el del CLIENTE. Reglas para no inventar:
//  · se compara normalizado (sin acentos, sin signos, en minúsculas);
//  · el nombre buscado debe medir al menos 4 letras y aparecer como PALABRA, no dentro de
//    otra (así «GRI» no casa con «agridulce» ni «Skala» con «Skalable»);
//  · gana la coincidencia MÁS LARGA (entre «Reel» y «Reel testimonios» manda la segunda);
//  · si no hay nada claro se devuelve null: el rato cuenta en el total y en nadie más.
export type EntradaCatalogo = { projectId: string; nombre: string; clientId: string | null; cliente: string | null };
export type Atribucion = { projectId: string | null; clientId: string | null };

const MIN_LETRAS = 4;

const SIN_ATRIBUIR: Atribucion = { projectId: null, clientId: null };

// Minúsculas, sin acentos y con todo lo que no sea letra o número convertido en espacio.
// Va rodeado de espacios para poder buscar palabras completas con un simple `includes`.
// OJO: NFD también descompone la «ñ» (n + tilde), así que aquí «diseño» queda «diseno». Es
// DELIBERADO: los títulos de ventana llegan a veces sin acentos ni eñes, y como catálogo y
// título pasan por la misma función, casan igual escritos de cualquiera de las dos formas.
export function normalizarTitulo(s: string): string {
  return ` ${s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

// ¿Aparece `aguja` como palabra completa dentro del título ya normalizado?
function contienePalabra(tituloNorm: string, aguja: string): boolean {
  const a = normalizarTitulo(aguja).trim();
  if (a.replace(/[^a-z0-9]/g, "").length < MIN_LETRAS) return false;
  return tituloNorm.includes(` ${a} `);
}

export function atribuir(titulo: string, catalogo: EntradaCatalogo[]): Atribucion {
  if (!titulo.trim()) return SIN_ATRIBUIR;
  const t = normalizarTitulo(titulo);
  // De los candidatos que aparecen en el título, gana el nombre más LARGO.
  const mejorDe = (pares: { nombre: string; at: Atribucion }[]): Atribucion | null => {
    let mejor: { largo: number; at: Atribucion } | null = null;
    for (const p of pares) {
      if (!contienePalabra(t, p.nombre)) continue;
      const largo = p.nombre.trim().length;
      if (!mejor || largo > mejor.largo) mejor = { largo, at: p.at };
    }
    return mejor?.at ?? null;
  };
  // Primero los proyectos (más específicos); el cliente solo si ningún proyecto casó.
  const porProyecto = mejorDe(catalogo.map((p) => ({ nombre: p.nombre, at: { projectId: p.projectId, clientId: p.clientId } })));
  if (porProyecto) return porProyecto;
  const porCliente = mejorDe(
    catalogo
      .filter((p): p is EntradaCatalogo & { cliente: string; clientId: string } => !!p.cliente && !!p.clientId)
      .map((p) => ({ nombre: p.cliente, at: { projectId: null, clientId: p.clientId } })),
  );
  return porCliente ?? SIN_ATRIBUIR;
}

// ── Tramos de inactividad ──
// El sensor 1.9+ manda además `idles: [{ s, d }]`: desde cuándo y cuántos segundos estuvo el
// equipo sin ninguna entrada (más allá del umbral de 3 min, que sigue contando como trabajo).
// Sin app ni título a propósito. Misma actitud que limpiarBloques: el payload es nuestro pero
// el endpoint es internet — topes duros y lo inválido se descarta sin tumbar el lote.
export type OcioEntrante = { s: number; d: number };
export type OcioLimpio = { startedAt: Date; seconds: number };

const MAX_OCIOS = 288;
// Un tramo de inactividad puede ser largo de verdad (almuerzo, reunión, render ajeno), pero el
// sensor cierra cada tramo a las 4 h como máximo (más que eso es ausencia, no descanso) y corta
// al suspender. El tope de acá es la RED DE SEGURIDAD para relojes locos o sensores raros: un
// poco por encima del máximo legítimo, jamás una noche entera.
const MAX_SEG_OCIO = 6 * 3600;
const MIN_SEG_OCIO = 30; // por debajo es ruido del umbral, no un descanso

export function limpiarOcios(entrada: unknown, ahoraMs: number): OcioLimpio[] {
  if (!Array.isArray(entrada)) return [];
  const fuera: OcioLimpio[] = [];
  for (const o of entrada.slice(0, MAX_OCIOS)) {
    if (!o || typeof o !== "object") continue;
    const { s, d } = o as Partial<OcioEntrante>;
    if (typeof s !== "number" || !Number.isFinite(s)) continue;
    if (typeof d !== "number" || !Number.isInteger(d) || d < MIN_SEG_OCIO || d > MAX_SEG_OCIO) continue;
    if (s > ahoraMs + 5 * 60_000 || s < ahoraMs - 30 * DIA) continue;
    fuera.push({ startedAt: new Date(s), seconds: d });
  }
  return fuera;
}

// Algunas ventanas de Windows traen BYTES NULOS (0x00) y otros controles en el título (buffers
// UTF-16 rellenos, overlays de juegos/drivers). Postgres rechaza el 0x00 en TEXT con el error
// 22021 «invalid byte sequence» — y como el insert del lote es UNO solo, un título sucio
// tumbaba el lote ENTERO y el sensor lo reintentaba por siempre. Se barren aquí, en la puerta.
// eslint-disable-next-line no-control-regex -- barrer controles es exactamente la intención
const sinControles = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, "");

export function limpiarBloques(entrada: unknown, ahoraMs: number): BloqueLimpio[] {
  if (!Array.isArray(entrada)) return [];
  const fuera: BloqueLimpio[] = [];
  for (const b of entrada.slice(0, MAX_BLOQUES)) {
    if (!b || typeof b !== "object") continue;
    const { s, d, a, app, t } = b as Partial<BloqueEntrante>;
    if (typeof s !== "number" || !Number.isFinite(s)) continue;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > MAX_SEG) continue;
    if (typeof app !== "string" || !sinControles(app).trim()) continue;
    // Ni del futuro (reloj loco) ni de hace más de 30 días (cola offline con tope real).
    if (s > ahoraMs + 5 * 60_000 || s < ahoraMs - 30 * DIA) continue;
    const activos = typeof a === "number" && Number.isInteger(a) && a >= 0 ? Math.min(a, d) : 0;
    fuera.push({
      startedAt: new Date(s),
      seconds: d,
      activeSecs: activos,
      app: sinControles(app).trim().slice(0, MAX_APP),
      title: typeof t === "string" ? sinControles(t).trim().slice(0, MAX_TITULO) : "",
    });
  }
  return fuera;
}
