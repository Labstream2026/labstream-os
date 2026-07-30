import fs from "node:fs/promises";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { signScopedToken, verifyScopedToken } from "@/lib/signed-token";
import { resolverEntrega, tituloDe, type EntregaEstado } from "@/lib/galeria-entrega";
import {
  galeriaAbs,
  galeriaKind,
  normalizeGaleriaRel,
  exifTakenAt,
  needsProxy,
  proxyRelFor,
  type GaleriaItem,
  type GaleriaScan,
  type GaleriaDay,
} from "@/lib/nas-galeria";

// ── Selecciones compartidas: «mándale SOLO estas piezas» ───────────────────────
// Hermana de la entrega por carpeta (galeria-entrega.ts) y con su misma filosofía: la fila de
// base de datos manda sobre el token. La diferencia es el alcance: aquí el enlace autoriza una
// LISTA de piezas concretas, no todo lo que cuelgue de una carpeta.
//
// El token lleva SOLO el id de la fila, firmado con un ámbito propio («galeria-sel»). Meter la
// lista dentro del token era la alternativa sin base de datos, y se descartó a propósito: con
// cuarenta piezas el enlace medía miles de caracteres (WhatsApp los parte) y, sobre todo, un
// token autónomo no se puede retirar. La fila sí: revocar es marcarla y ya.
//
// La misma regla de siempre: al cliente jamás se le enseña la estructura del NAS. El título es
// el nombre limpio de la carpeta común, o «Selección» si las piezas vienen de varias.

const MAX_PIEZAS = 200;

export function signSeleccionToken(id: string, days: number): string {
  return signScopedToken("galeria-sel", id, days);
}

export function verifySeleccionToken(token: string): string | null {
  return verifyScopedToken("galeria-sel", token);
}

// Normaliza, deduplica y valida la lista que llega del navegador. Solo piezas que la galería
// reconoce (fotos o videos): una selección no es un canal para servir archivos arbitrarios.
function sanearRels(rels: unknown): string[] {
  if (!Array.isArray(rels)) throw new Error("No llegó la lista de piezas.");
  const limpias = new Set<string>();
  for (const r of rels) {
    if (typeof r !== "string") continue;
    const norm = normalizeGaleriaRel(r);
    if (!norm) continue;
    if (!galeriaKind(norm.split("/").pop() || "")) continue;
    limpias.add(norm);
  }
  if (limpias.size === 0) throw new Error("La selección quedó vacía.");
  if (limpias.size > MAX_PIEZAS) throw new Error(`Demasiadas piezas para un solo enlace (máximo ${MAX_PIEZAS}).`);
  return [...limpias];
}

// La carpeta común de la lista («Camilo Ortega/VSL» si todas cuelgan de ahí). De ella sale el
// título que ve el cliente; si las piezas vienen de carpetas distintas, no se inventa nada.
export function carpetaComun(rels: string[]): string {
  let comun: string[] | null = null;
  for (const rel of rels) {
    const dir = rel.split("/").slice(0, -1);
    if (comun === null) {
      comun = dir;
      continue;
    }
    let i = 0;
    while (i < comun.length && i < dir.length && comun[i] === dir[i]) i++;
    comun = comun.slice(0, i);
    if (comun.length === 0) break;
  }
  return (comun ?? []).join("/");
}

export async function crearSeleccion(
  rels: unknown,
  dias: number,
  userId: string | null,
): Promise<{ id: string; token: string; titulo: string; piezas: number }> {
  const limpias = sanearRels(rels);
  const vida = Math.min(365, Math.max(1, Math.floor(dias) || 30));
  const base = carpetaComun(limpias);
  const titulo = base ? `${tituloDe(base)} · selección` : "Selección";
  const id = crypto.randomBytes(6).toString("base64url");
  await db.galeriaSeleccion.create({
    data: {
      id,
      rels: limpias,
      titulo,
      expiresAt: new Date(Date.now() + vida * 86400_000),
      createdById: userId,
    },
  });
  return { id, token: signSeleccionToken(id, vida), titulo, piezas: limpias.length };
}

export async function revocarSeleccion(id: string): Promise<void> {
  await db.galeriaSeleccion.updateMany({ where: { id }, data: { revokedAt: new Date() } });
}

// Que el cliente ABRIÓ la sala de la selección. Solo desde la página, nunca desde las rutas de
// material (contaría una visita por miniatura). Y jamás tumba la sala si falla.
export async function registrarVisitaSeleccion(id: string): Promise<void> {
  try {
    await db.galeriaSeleccion.updateMany({
      where: { id },
      data: { visitas: { increment: 1 }, ultimaVisitaAt: new Date() },
    });
  } catch {
    /* el contador no manda sobre la sala */
  }
}

// ── El guardián único de la sala ───────────────────────────────────────────────
// La sala del cliente (/galeria/[token] y las rutas de material) recibe DOS clases de token con
// la misma pinta: el de carpeta (ámbito «galeria», de galeria-entrega.ts) y el de selección
// (ámbito «galeria-sel»). Este resolver decide cuál es y devuelve un ALCANCE homogéneo, para que
// cada consumidor haga una sola pregunta: ¿esta pieza está dentro de lo autorizado?

export type AlcanceEntrega =
  | { tipo: "carpeta"; folderRel: string }
  | { tipo: "seleccion"; id: string; rels: string[] };

export type AccesoEstado =
  | { ok: true; alcance: AlcanceEntrega; titulo: string }
  | { ok: false; motivo: Exclude<EntregaEstado, { ok: true }>["motivo"]; mensaje: string };

const MSG_SEL: Record<"invalido" | "revocado" | "caducado", string> = {
  invalido: "Este enlace no es válido. Puede que se haya copiado a medias: pide el enlace completo a tu productor.",
  revocado: "Este enlace ya no está disponible. Pide uno nuevo a tu productor.",
  caducado: "Este enlace ya venció. Pide uno nuevo a tu productor y lo tendrás en un momento.",
};

function falloSel(motivo: "invalido" | "revocado" | "caducado"): AccesoEstado {
  return { ok: false, motivo, mensaje: MSG_SEL[motivo] };
}

export async function resolverAcceso(token: string): Promise<AccesoEstado> {
  // 1) ¿Es una selección? El ámbito propio hace que un token de carpeta NUNCA verifique aquí
  //    (la firma cubre el prefijo), así que no hay ambigüedad posible entre las dos clases.
  const selId = verifySeleccionToken(token);
  if (selId) {
    let fila: { rels: unknown; titulo: string | null; expiresAt: Date; revokedAt: Date | null } | null;
    try {
      fila = await db.galeriaSeleccion.findUnique({
        where: { id: selId },
        select: { rels: true, titulo: true, expiresAt: true, revokedAt: true },
      });
    } catch {
      // Sin poder consultar, se cierra: un enlace retirado que sigue abriendo es mucho peor
      // que una sala que no abre durante un rato. Mismo criterio que la entrega por carpeta.
      return falloSel("revocado");
    }
    if (!fila) return falloSel("invalido");
    if (fila.revokedAt) return falloSel("revocado");
    // El token ya venció solo si su exp pasó (verify lo corta); esta es la caducidad de la
    // FILA, que manda aunque alguien firme tokens más largos por error.
    if (fila.expiresAt.getTime() < Date.now()) return falloSel("caducado");

    let rels: string[];
    try {
      rels = sanearRels(fila.rels);
    } catch {
      return falloSel("invalido");
    }
    return { ok: true, alcance: { tipo: "seleccion", id: selId, rels }, titulo: fila.titulo || "Selección" };
  }

  // 2) Entrega por carpeta: el guardián de siempre decide, aquí solo se le da forma de alcance.
  const estado = await resolverEntrega(token);
  if (!estado.ok) return estado;
  return { ok: true, alcance: { tipo: "carpeta", folderRel: estado.folderRel }, titulo: estado.titulo };
}

// ¿La pieza pedida está dentro de lo que autoriza el alcance? Para carpeta se compara SEGMENTO
// a segmento (un token de «boda-lopez» no abre «boda-lopez-2»); para selección, la pieza tiene
// que estar EXACTAMENTE en la lista — las derivadas (.proxy) las resuelve el servidor por su
// cuenta a partir de la pieza, nunca por una ruta que mande el navegador.
export function alcanceAutoriza(alcance: AlcanceEntrega, rel: string): boolean {
  if (!rel) return false;
  if (alcance.tipo === "seleccion") return alcance.rels.includes(rel);
  const base = alcance.folderRel;
  if (!base) return false;
  const b = base.split("/");
  const p = rel.split("/");
  if (p.length <= b.length) return false;
  return b.every((seg, i) => seg === p[i]);
}

// ── La línea de tiempo de una selección ────────────────────────────────────────
// Igual que scanGaleria pero sobre una LISTA: se mira cada pieza (existe, pesa, fecha EXIF) y
// se agrupa por día y mes. Una pieza que ya no está en el disco simplemente no sale — el
// cliente no tiene nada que hacer con «aquí había un archivo».

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function scanSeleccion(rels: string[]): Promise<GaleriaScan> {
  const items: GaleriaItem[] = [];
  let bytes = 0;

  for (const rel of rels.slice(0, MAX_PIEZAS)) {
    const name = rel.split("/").pop() || "";
    const kind = galeriaKind(name);
    if (!kind) continue;
    let abs: string;
    try {
      abs = await galeriaAbs(rel);
    } catch {
      continue;
    }
    const st = await fs.stat(abs).catch(() => null);
    if (!st || !st.isFile()) continue;

    let takenAt = new Date(st.mtimeMs);
    let exact = false;
    if (kind === "photo") {
      const ex = await exifTakenAt(abs);
      if (ex) {
        takenAt = ex;
        exact = true;
      }
    }
    bytes += st.size;
    items.push({
      rel,
      name,
      kind,
      size: st.size,
      ext: (name.split(".").pop() || "").toLowerCase(),
      takenAt: takenAt.toISOString(),
      exact,
      needsProxy: needsProxy(name),
      proxyRel: proxyRelFor(rel, kind),
    });
  }

  items.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const porDia = new Map<string, GaleriaItem[]>();
  for (const it of items) {
    const clave = ymd(new Date(it.takenAt));
    const arr = porDia.get(clave);
    if (arr) arr.push(it);
    else porDia.set(clave, [it]);
  }
  const porMes = new Map<string, GaleriaDay[]>();
  for (const [date, its] of porDia) {
    const clave = date.slice(0, 7);
    const arr = porMes.get(clave);
    if (arr) arr.push({ date, items: its });
    else porMes.set(clave, [{ date, items: its }]);
  }
  const months = [...porMes.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, days]) => {
      const [y, m] = month.split("-");
      return {
        month,
        label: `${MESES[Number(m) - 1]} de ${y}`,
        count: days.reduce((n, d) => n + d.items.length, 0),
        days: days.sort((a, b) => b.date.localeCompare(a.date)),
      };
    });

  return {
    months,
    total: items.length,
    photos: items.filter((i) => i.kind === "photo").length,
    videos: items.filter((i) => i.kind === "video").length,
    bytes,
    truncated: false,
  };
}
