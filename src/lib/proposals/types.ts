// Tipos del constructor de propuestas. Los bloques se guardan como JSON, así que
// el tipo Block es deliberadamente flexible: un objeto con `type` y los campos
// propios de cada tipo. Las funciones del editor leen/escriben campos por nombre.

import { COMPANY } from "@/lib/branding";

export type BlockType =
  | "hero"
  | "text"
  | "cards"
  | "carousel"
  | "acc"
  | "fullvideo"
  | "logos"
  | "stats"
  | "styles"
  | "plan"
  | "calendar"
  | "timeline"
  | "pricing"
  | "budget"
  | "video"
  | "checks"
  | "cta";

export type Block = { type: BlockType; [key: string]: unknown };

// Fondo y tono de una diapositiva en el tema "cine". Vive DENTRO del bloque (JSON), así que
// cada propuesta decide diapositiva por diapositiva sin tocar la base de datos:
//   tone: "dark" | "light"   → alterna el fondo verde-noche y el crema
//   bgVideo: URL del video de fondo (biblioteca /api/proposal-asset/… o externa)
//   bg: imagen de fondo (ya existía en `hero`; en cine vale para cualquier bloque)
export type BlockTone = "dark" | "light";

export type ProposalTheme = "documento" | "presentacion" | "cine";

export type Brand = {
  company: string;
  tagline: string;
  accent: string; // HEX
  email: string;
  whatsapp: string;
  logo?: string;
  // Estilo de presentación al cliente. "documento" (por defecto) = el layout clásico en columna.
  // "presentacion" = experiencia inmersiva a pantalla completa (secciones oscuras, tipografía
  // grande, aparición al desplazar), como una presentación de diapositivas. "cine" = el deck
  // editorial de Labstream (serif de despliegue, verde-noche y crema alternándose, videos de
  // fondo, índice lateral). Se guarda dentro del snapshot de marca (JSON), así que NO requiere
  // migración de base de datos.
  theme?: ProposalTheme;
  // Paleta del tema "cine". Si no viene, se usa la de Labstream (verde-noche/crema/dorado).
  // Editable por propuesta: un cliente con identidad propia puede llevar la suya.
  cine?: { ink?: string; cream?: string; gold?: string };
};

// Paleta por defecto del tema "cine" — la de la propuesta de Mi Páramo.
export const CINE_PALETTE = { ink: "#0E1512", cream: "#F4F1EA", gold: "#E6D2A6" } as const;

export type ProposalStatus = "BORRADOR" | "ENVIADA" | "ACEPTADA" | "VENCIDA";

export type Answers = Record<string, string>;

// Marca por defecto (Labstream). Se snapshotea en cada propuesta y es editable.
// Toma los valores de la marca centralizada de la empresa (branding.ts).
export const BRAND_DEFAULT: Brand = {
  company: COMPANY.name,
  tagline: COMPANY.tagline,
  accent: COMPANY.accent,
  email: COMPANY.email,
  whatsapp: COMPANY.whatsapp,
};

// Etiquetas en español de cada tipo de bloque (para el menú "añadir bloque").
export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Portada",
  text: "Texto",
  cards: "Tarjetas",
  carousel: "Carrusel",
  acc: "Acordeón",
  fullvideo: "Reel",
  logos: "Logos",
  stats: "Datos",
  styles: "Estilos",
  plan: "Plan",
  calendar: "Calendario",
  timeline: "Cronograma",
  pricing: "Inversión",
  budget: "Desglose",
  video: "Video",
  checks: "Lista de ✓",
  cta: "Cierre",
};

export const STATUS_META: Record<ProposalStatus, { label: string; tone: string }> = {
  BORRADOR: { label: "Borrador", tone: "slate" },
  ENVIADA: { label: "Enviada", tone: "blue" },
  ACEPTADA: { label: "Aceptada", tone: "emerald" },
  VENCIDA: { label: "Vencida", tone: "rose" },
};

// Marcas del bloque «logos». Nacieron como un array de TEXTOS y ahora son {name, logo} para
// poder mostrar la imagen del logo. Los tres renderers pasan por aquí, así que una propuesta
// guardada con el formato viejo sigue viéndose igual — y ninguno intenta pintar un objeto
// como texto (que reventaba el render entero).
export function logoItems(raw: unknown): { name: string; logo: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it) => {
    if (typeof it === "string") return { name: it, logo: "" };
    const o = (it ?? {}) as Record<string, unknown>;
    return { name: typeof o.name === "string" ? o.name : "", logo: typeof o.logo === "string" ? o.logo : "" };
  });
}

// Estado efectivo: si la fecha de validez ya pasó, se considera VENCIDA.
export function effectiveStatus(p: { status: ProposalStatus; expiresAt?: Date | string | null }): ProposalStatus {
  if (p.status === "ACEPTADA") return "ACEPTADA";
  if (p.expiresAt) {
    const exp = typeof p.expiresAt === "string" ? new Date(p.expiresAt) : p.expiresAt;
    if (exp.getTime() < Date.now()) return "VENCIDA";
  }
  return p.status;
}

// Formas por defecto al añadir un bloque manualmente desde el editor.
export function newBlock(type: BlockType, brandEmail = BRAND_DEFAULT.email): Block {
  switch (type) {
    case "hero":
      return { type, title: "Título de la propuesta", subtitle: "Subtítulo o eslogan", bg: "" };
    case "text":
      return { type, title: "Nueva sección", body: "Escribe aquí el contenido…" };
    case "cards":
      return { type, title: "Nueva sección", items: [{ icon: "✦", t: "Elemento", d: "Descripción." }] };
    case "carousel":
      return {
        type,
        title: "Nuevo carrusel",
        sub: "Descripción corta.",
        items: [
          { img: "", t: "Slide 1", d: "Descripción." },
          { img: "", t: "Slide 2", d: "Descripción." },
        ],
      };
    case "acc":
      return { type, title: "Preguntas frecuentes", items: [{ q: "Pregunta", a: "Respuesta." }] };
    case "fullvideo":
      return { type, title: "Reel", url: "", caption: "" };
    case "logos":
      return { type, title: "Marcas con las que trabajamos", items: ["Marca 1", "Marca 2", "Marca 3"] };
    case "stats":
      return { type, title: "Por qué el video importa", items: [{ n: "89%", p: "frase de respaldo", f: "Fuente" }] };
    case "styles":
      return { type, title: "Estilos de grabación", items: [{ icon: "🎥", t: "Estilo", d: "Descripción.", url: "" }] };
    case "plan":
      return {
        type,
        title: "Plan de marketing",
        sub: "Frecuencia por canal.",
        cols: ["Canal", "Frecuencia", "Formatos", "Objetivo"],
        rows: [["Instagram", "3/semana", "Reels", "Alcance"]],
      };
    case "calendar":
      return { type, title: "Calendario de contenido", pais: "Colombia", mes: "Enero", videos: 8 };
    case "timeline":
      return { type, title: "Cronograma", steps: [{ phase: "Fase 1", dur: "Semana 1", desc: "Descripción." }] };
    case "pricing":
      return {
        type,
        title: "Inversión",
        rows: [{ c: "Concepto", d: "Detalle.", p: "$" }],
        total: "A convenir",
        note: "Valores antes de IVA.",
      };
    case "budget":
      return {
        type,
        title: "Inversión",
        sub: "Tu inversión para este proyecto.",
        cur: "COP",
        iva: 19,
        // Precio DE CARA AL CLIENTE (lo único que ve): precio base, descuento e IVA.
        price: 0,
        discountPct: 0,
        // Las secciones son el costo INTERNO (del catálogo) — NO se muestran al cliente; el
        // % de transporte/imprevistos también es interno. showIncluded lista los servicios
        // incluidos (solo nombres, sin precios) en la propuesta del cliente.
        contingencyPct: 10,
        showIncluded: true,
        sections: [],
        note: "Valores antes de IVA. La pauta publicitaria se maneja como presupuesto aparte.",
      };
    case "video":
      return { type, url: "", caption: "Descripción del video" };
    case "checks":
      return {
        type,
        kicker: "Alcance del servicio",
        title: "Todo lo que incluye esta propuesta.",
        items: ["Primer punto incluido.", "Segundo punto incluido."],
      };
    case "cta":
      return { type, title: "Trabajemos juntos", sub: "Escríbenos y conversemos.", btn: "Contactar", email: brandEmail };
  }
}
