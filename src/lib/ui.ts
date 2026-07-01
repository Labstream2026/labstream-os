// Mapas de presentación: colores de avatar, estados, tipos y prioridades.
// Clases literales para que Tailwind las detecte en el escaneo.

import { resolveProjectStatus } from "@/lib/project-status";

export const AVATAR_COLORS: Record<string, string> = {
  indigo: "bg-indigo-500 text-white",
  emerald: "bg-emerald-500 text-white",
  violet: "bg-violet-500 text-white",
  cyan: "bg-cyan-500 text-white",
  amber: "bg-amber-500 text-white",
  rose: "bg-rose-500 text-white",
  orange: "bg-orange-500 text-white",
  slate: "bg-slate-500 text-white",
};

export function avatarColor(key?: string | null) {
  return AVATAR_COLORS[key ?? "slate"] ?? AVATAR_COLORS.slate;
}

// Hex de cada color de avatar (Tailwind 500), para fondos en línea (p. ej. colorear los
// bloques del calendario por persona, donde se usa style={{ background }} y no clases).
export const AVATAR_HEX: Record<string, string> = {
  indigo: "#6366f1",
  emerald: "#10b981",
  violet: "#8b5cf6",
  cyan: "#06b6d4",
  amber: "#f59e0b",
  rose: "#f43f5e",
  orange: "#f97316",
  slate: "#64748b",
};

export function avatarHex(key?: string | null): string {
  return AVATAR_HEX[key ?? ""] ?? AVATAR_HEX.slate;
}

type StatusMeta = { label: string; className: string };

export const PROJECT_STATUS: Record<string, StatusMeta> = {
  NUEVO: { label: "Nuevo", className: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
  EN_PLANEACION: { label: "En planeación", className: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
  EN_PREPRODUCCION: { label: "Preproducción", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" },
  EN_PRODUCCION: { label: "En curso", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  EN_EDICION: { label: "En edición", className: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  REVISION_INTERNA: { label: "En revisión", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  REVISION_CLIENTE: { label: "Revisión cliente", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  CORRECCIONES: { label: "Correcciones", className: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  APROBADO: { label: "Aprobado", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  ENTREGADO: { label: "Entregado", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  CERRADO: { label: "Cerrado", className: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
  PAUSADO: { label: "Bloqueado", className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  CANCELADO: { label: "Cancelado", className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
};

export function statusMeta(status: string): StatusMeta {
  // Etiqueta/color CONFIGURABLES (overrides en OrgSettings, cacheados por request); si no hay
  // override usa los valores por defecto. PROJECT_STATUS (arriba) sigue como defaults estáticos
  // para quienes lo importan directo (IA, formulario de creación).
  return resolveProjectStatus(status);
}

export const PROJECT_TYPE: Record<string, string> = {
  REEL: "Reel",
  PODCAST: "Podcast",
  DOCUMENTAL: "Documental",
  STREAMING: "Streaming",
  CURSO: "Curso",
  PUBLICIDAD: "Publicidad",
  EVENTO: "Evento",
  CORPORATIVO: "Producción corporativa",
  INSTITUCIONAL: "Video institucional",
  FOTOGRAFIA: "Fotografía",
  CAMPANA_MENSUAL: "Campaña mensual",
};

export const PRIORITY: Record<string, StatusMeta> = {
  BAJA: { label: "Baja", className: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
  MEDIA: { label: "Media", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  ALTA: { label: "Alta", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  URGENTE: { label: "Urgente", className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
};

export function formatShortDate(date?: Date | string | null) {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(d);
}

// Fecha larga para documentos formales: "21 de noviembre de 2024".
export function formatLongDate(date?: Date | string | null) {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

// ── Tareas ──
export const TASK_STATUS: Record<string, StatusMeta> = {
  PENDIENTE: { label: "Pendiente", className: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
  EN_PROCESO: { label: "En proceso", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  EN_ESPERA: { label: "En espera", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  EN_REVISION: { label: "En revisión", className: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  COMPLETADA: { label: "Completada", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  CANCELADA: { label: "Cancelada", className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
};

export const TASK_STATUS_ORDER = ["PENDIENTE", "EN_PROCESO", "EN_REVISION", "COMPLETADA"] as const;

export function taskStatusMeta(s: string): StatusMeta {
  return TASK_STATUS[s] ?? TASK_STATUS.PENDIENTE;
}

// ── Entregables ──
export const DELIVERABLE_STATUS: Record<string, StatusMeta> = {
  PENDIENTE: { label: "Pendiente", className: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
  EN_PRODUCCION: { label: "En producción", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  EN_EDICION: { label: "En edición", className: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  REVISION_INTERNA: { label: "Revisión interna", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  ENVIADO_CLIENTE: { label: "Enviado a cliente", className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300" },
  CORRECCIONES: { label: "Correcciones", className: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  APROBADO: { label: "Aprobado", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  ENTREGADO: { label: "Entregado", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

export function deliverableStatusMeta(s: string): StatusMeta {
  return DELIVERABLE_STATUS[s] ?? DELIVERABLE_STATUS.PENDIENTE;
}

// Etiquetas visibles del tipo de contenido. Las CLAVES del enum (REEL, VIDEO_LARGO…) NO
// cambian para no requerir migración; solo cambia el texto que ve el usuario. "Video vertical"
// (antes "Reel") y "Video horizontal" (antes "Video largo") nombran por ORIENTACIÓN, que es lo
// que define el formato de revisión (ver deliverableOrientation).
export const DELIVERABLE_TYPE: Record<string, string> = {
  REEL: "Video vertical",
  VIDEO_LARGO: "Video horizontal",
  FOTOGRAFIA: "Fotografía",
  SHORT: "Short vertical",
  PODCAST: "Podcast",
  TEASER: "Teaser",
  DOCUMENTO: "Documento",
  OTRO: "Otro",
};

// Orientación del material según el tipo de entregable: reels y shorts son verticales
// (9:16); el resto se asume horizontal (16:9). Define la diagramación de la pestaña de
// revisión: vertical → video a la izquierda + comentarios a la derecha; horizontal →
// video arriba a todo el ancho + comentarios debajo. El tipo (la casilla "Reel") es lo
// que predefine cómo se visualiza la revisión.
export type MediaOrientation = "vertical" | "horizontal";
export function deliverableOrientation(type: string | null | undefined): MediaOrientation {
  return type === "REEL" || type === "SHORT" ? "vertical" : "horizontal";
}

// Segundo de un video → "m:ss" o, para masters largos (≥ 1 h, videos de 2–5 h), "h:mm:ss".
// Se usa en los timecodes de los comentarios de revisión. Puro: cliente y servidor.
export function formatTimecode(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export const FILE_KIND_LABEL: Record<string, string> = {
  LOCAL: "Archivo",
  DRIVE: "Google Drive",
  LINK: "Enlace",
  NAS: "Ruta del NAS",
};

// ── Cotizaciones ──
export function formatMoney(amount: number, currency = "COP") {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export const QUOTE_STATUS: Record<string, StatusMeta> = {
  BORRADOR: { label: "Borrador", className: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
  ENVIADA: { label: "Enviada", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  APROBADA: { label: "Aprobada", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  RECHAZADA: { label: "Rechazada", className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
};

export function quoteStatusMeta(s: string): StatusMeta {
  return QUOTE_STATUS[s] ?? QUOTE_STATUS.BORRADOR;
}

export const INVOICE_STATUS: Record<string, StatusMeta> = {
  BORRADOR: { label: "Borrador", className: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
  ENVIADA: { label: "Enviada", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  PAGADA: { label: "Pagada", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  VENCIDA: { label: "Vencida", className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  ANULADA: { label: "Anulada", className: "bg-zinc-100 text-zinc-500 line-through dark:bg-zinc-500/15 dark:text-zinc-400" },
};

export function invoiceStatusMeta(s: string): StatusMeta {
  return INVOICE_STATUS[s] ?? INVOICE_STATUS.BORRADOR;
}

// Total de una cotización (subtotal + IVA) a partir de sus líneas.
export function quoteTotals(
  items: { quantity: number; unitPrice: number }[],
  taxRate = 0,
) {
  const subtotal = items.reduce((n, i) => n + i.quantity * i.unitPrice, 0);
  const tax = Math.round((subtotal * taxRate) / 100);
  return { subtotal, tax, total: subtotal + tax };
}
