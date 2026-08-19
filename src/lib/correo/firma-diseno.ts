import { PALETA_CORREO } from "./redactar";

// ── El DISEÑADOR de firmas: de un formulario a HTML de correo impecable ─────
// La firma corporativa no se escribe en HTML a mano: se eligen datos (empresa, web,
// teléfono, redes), un layout y un color, y ESTE generador produce la tabla email-safe con
// estilos en línea — la misma receta de los grandes (tablas, nada de CSS externo, colores
// pegados al elemento). El resultado lleva los campos {{nombre}} y {{cargo}} donde van, y
// `cid:firma@labstream` donde va el logo — el mismo contrato de siempre con lib/correo/firma.
//
// Es puro a propósito: corre igual en el servidor (guardar regenera desde el config, sin
// confiar en HTML del navegador) y en el cliente (la vista previa del diseñador es EXACTA).

export type RedFirma = { etiqueta: string; url: string };

export type DisenoFirma = {
  /** clasica = logo a la izquierda con línea de acento · apilada = texto y logo debajo ·
   *  banner = texto y una imagen ancha debajo · texto = sin imagen. */
  layout: "clasica" | "apilada" | "banner" | "texto";
  acento: string; // uno de PALETA_FIRMA
  empresa: string;
  web?: string;
  telefono?: string;
  ciudad?: string;
  redes: RedFirma[]; // máx. 4
  /** Ancho del logo en px (clásica/apilada). El banner es ancho fijo. */
  anchoImagen: 110 | 160 | 220;
};

export const PALETA_FIRMA = PALETA_CORREO;
export const CID_FIRMA_DISENO = "firma@labstream";
export const REDES_SUGERIDAS = ["Instagram", "YouTube", "Behance", "TikTok", "LinkedIn", "X", "Sitio"] as const;

export const DISENO_BASE: DisenoFirma = {
  layout: "clasica",
  acento: PALETA_CORREO[2], // el azul del estudio
  empresa: "Labstream Studio",
  web: "labstreamsas.com",
  telefono: "",
  ciudad: "Bogotá, Colombia",
  redes: [],
  anchoImagen: 160,
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** URL navegable: se antepone https:// si vino «a lo humano» («labstreamsas.com»). */
const urlViva = (s: string): string | null => {
  const t = s.trim();
  if (!t) return null;
  const conEsquema = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(conEsquema);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
};

/** Valida y NORMALIZA un config que llega del navegador (o de la BD). null = irrecuperable. */
export function normalizarDiseno(crudo: unknown): DisenoFirma | null {
  if (!crudo || typeof crudo !== "object") return null;
  const c = crudo as Record<string, unknown>;
  const layout = ["clasica", "apilada", "banner", "texto"].includes(String(c.layout)) ? (String(c.layout) as DisenoFirma["layout"]) : "clasica";
  const acento = (PALETA_CORREO as readonly string[]).includes(String(c.acento)) ? String(c.acento) : DISENO_BASE.acento;
  const ancho = [110, 160, 220].includes(Number(c.anchoImagen)) ? (Number(c.anchoImagen) as DisenoFirma["anchoImagen"]) : 160;
  const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const redes: RedFirma[] = Array.isArray(c.redes)
    ? c.redes
        .slice(0, 4)
        .map((r) => ({ etiqueta: texto((r as RedFirma)?.etiqueta, 24), url: texto((r as RedFirma)?.url, 300) }))
        .filter((r) => r.etiqueta && urlViva(r.url))
    : [];
  return {
    layout,
    acento,
    empresa: texto(c.empresa, 80) || DISENO_BASE.empresa,
    web: texto(c.web, 120),
    telefono: texto(c.telefono, 40),
    ciudad: texto(c.ciudad, 80),
    redes,
    anchoImagen: ancho,
  };
}

/** El bloque de TEXTO de la firma (compartido por los cuatro layouts). */
function bloqueTexto(d: DisenoFirma): string {
  const lineas: string[] = [];
  lineas.push(`<b style="font-size:15px;color:#18181b">{{nombre}}</b>`);
  // El cargo vacío no deja línea huérfana: aplicarPlantillaFirma barre el span vacío + <br>.
  lineas.push(`<span style="color:${d.acento};font-weight:600">{{cargo}}</span>`);
  const empresa = `<span style="color:#18181b">${esc(d.empresa)}</span>${d.ciudad ? `<span style="color:#71717a"> · ${esc(d.ciudad)}</span>` : ""}`;
  lineas.push(empresa);
  const contacto: string[] = [];
  const web = d.web ? urlViva(d.web) : null;
  if (web) contacto.push(`<a href="${esc(web)}" target="_blank" rel="noopener" style="color:${d.acento};text-decoration:none">${esc(d.web!.replace(/^https?:\/\//i, ""))}</a>`);
  if (d.telefono) contacto.push(`<span style="color:#71717a">${esc(d.telefono)}</span>`);
  if (contacto.length) lineas.push(contacto.join(`<span style="color:#71717a"> · </span>`));
  const redes = d.redes
    .map((r) => {
      const u = urlViva(r.url);
      return u ? `<a href="${esc(u)}" target="_blank" rel="noopener" style="color:${d.acento};text-decoration:none;font-size:12px">${esc(r.etiqueta)}</a>` : null;
    })
    .filter(Boolean);
  if (redes.length) lineas.push(redes.join(`<span style="color:#71717a;font-size:12px"> · </span>`));
  return `<p style="margin:0;font-size:13px;line-height:1.5">${lineas.join("<br>")}</p>`;
}

/**
 * El HTML de la plantilla, listo para guardar: tokens sin sustituir y el logo por cid.
 * `conImagen` lo decide quien guarda (¿hay logo subido?): sin logo, todo layout degrada a
 * solo-texto — nunca una celda vacía ni un cid roto.
 */
export function generarHtmlFirma(d: DisenoFirma, opts: { conImagen: boolean }): string {
  const texto = bloqueTexto(d);
  const img = (ancho: number, extra = "") => `<img src="cid:${CID_FIRMA_DISENO}" alt="" width="${ancho}" style="max-width:${ancho}px;height:auto;display:block${extra}">`;

  if (!opts.conImagen || d.layout === "texto") {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tbody><tr><td style="border-left:3px solid ${d.acento};padding:2px 0 2px 12px">${texto}</td></tr></tbody></table>`;
  }
  if (d.layout === "clasica") {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tbody><tr><td style="vertical-align:middle;padding:0 14px 0 0">${img(d.anchoImagen)}</td><td style="vertical-align:middle;border-left:3px solid ${d.acento};padding:2px 0 2px 14px">${texto}</td></tr></tbody></table>`;
  }
  if (d.layout === "apilada") {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tbody><tr><td style="padding:0 0 8px 0">${texto}</td></tr><tr><td>${img(d.anchoImagen)}</td></tr></tbody></table>`;
  }
  // banner: texto y una imagen ancha debajo (la promo, el demo reel del mes).
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tbody><tr><td style="border-left:3px solid ${d.acento};padding:2px 0 2px 12px">${texto}</td></tr><tr><td style="padding:10px 0 0 0">${img(420)}</td></tr></tbody></table>`;
}
