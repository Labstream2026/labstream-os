// ── Biblioteca de medios de las propuestas ──
// Videos de fondo, logos e imágenes que se suben UNA vez, se etiquetan por categoría y se
// reutilizan en cualquier propuesta. La categoría es lo que hace rápido el trabajo: al armar
// una propuesta de streaming se filtra por «streaming» y ahí están los fondos que sirven.
//
// Los archivos viven en el NAS bajo `proposal-lib/<kind>/` y se sirven por
// `/api/proposal-asset/<id>` (con Range, para que los videos hagan seek).

export type AssetKind = "VIDEO" | "LOGO" | "IMAGE";

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  VIDEO: "Video de fondo",
  LOGO: "Logo",
  IMAGE: "Imagen",
};

export type AssetCategory = { key: string; label: string; icon: string };

// Catálogo de categorías. Pensado por TIPO DE TRABAJO (que es como el equipo busca), no por
// estética. Añadir una categoría aquí basta: la UI y la validación la recogen solas.
export const ASSET_CATEGORIES: AssetCategory[] = [
  { key: "streaming", label: "Streaming", icon: "📡" },
  { key: "fotografia", label: "Fotografía", icon: "📷" },
  { key: "evento", label: "Eventos", icon: "🎪" },
  { key: "documental", label: "Documental", icon: "🎬" },
  { key: "corporativo", label: "Corporativo", icon: "🏢" },
  { key: "marca_personal", label: "Marca personal", icon: "👤" },
  { key: "dron", label: "Dron y aéreas", icon: "🚁" },
  { key: "naturaleza", label: "Naturaleza y territorio", icon: "⛰️" },
  { key: "producto", label: "Producto", icon: "📦" },
  { key: "general", label: "General", icon: "✦" },
];

export const ASSET_CATEGORY_KEYS = ASSET_CATEGORIES.map((c) => c.key);

export function assetCategory(key: string): AssetCategory {
  return ASSET_CATEGORIES.find((c) => c.key === key) ?? ASSET_CATEGORIES[ASSET_CATEGORIES.length - 1];
}

// Extensiones aceptadas por tipo. El video se guarda TAL CUAL (no se transcodifica): son piezas
// que el equipo ya exporta optimizadas, y meter ffmpeg aquí bloquearía la subida.
export const VIDEO_RE = /\.(mp4|webm|mov|m4v)$/i;
export const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

export const MAX_ASSET_BYTES: Record<AssetKind, number> = {
  VIDEO: 120 * 1024 * 1024, // un fondo de 10-20 s en H.264 pesa mucho menos; 120 MB es techo amplio
  LOGO: 4 * 1024 * 1024,
  IMAGE: 12 * 1024 * 1024,
};

// URL pública del medio. Es la que se guarda dentro del bloque, así que debe ser estable.
export function assetUrl(id: string): string {
  return `/api/proposal-asset/${id}`;
}

export function isAssetUrl(u: unknown): u is string {
  return typeof u === "string" && u.startsWith("/api/proposal-asset/");
}

export function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
