// Estados de PROYECTO con etiqueta y color CONFIGURABLES (sin migrar el enum Project.status).
// Los valores siguen siendo las claves del enum; aquí se resuelve cómo se VEN (etiqueta + color),
// con overrides guardados en OrgSettings.projectStatuses (JSON). Este archivo NO importa la BD,
// así puede vivir en el bundle de cliente (lo usa lib/ui → statusMeta, importado en server).
// La caché `_overrides` se calienta por request en el layout raíz (setProjectStatusOverrides).

export type StatusMeta = { label: string; className: string };

// Clave de color → clases de "badge" (claro + oscuro). Es el set de tonos disponibles.
export const STATUS_COLORS: Record<string, string> = {
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};
export const STATUS_COLOR_KEYS = Object.keys(STATUS_COLORS);

// Etiqueta + color POR DEFECTO de cada estado del enum (orden de visualización incluido).
export const PROJECT_STATUS_DEFAULTS: { key: string; label: string; color: string }[] = [
  { key: "NUEVO", label: "Nuevo", color: "slate" },
  { key: "EN_PLANEACION", label: "En planeación", color: "slate" },
  { key: "EN_PREPRODUCCION", label: "Preproducción", color: "indigo" },
  { key: "EN_PRODUCCION", label: "En curso", color: "blue" },
  { key: "EN_EDICION", label: "En edición", color: "violet" },
  { key: "REVISION_INTERNA", label: "En revisión", color: "amber" },
  { key: "REVISION_CLIENTE", label: "Revisión cliente", color: "amber" },
  { key: "CORRECCIONES", label: "Correcciones", color: "orange" },
  { key: "APROBADO", label: "Aprobado", color: "emerald" },
  { key: "ENTREGADO", label: "Entregado", color: "emerald" },
  { key: "CERRADO", label: "Cerrado", color: "slate" },
  { key: "PAUSADO", label: "Bloqueado", color: "rose" },
  { key: "CANCELADO", label: "Cancelado", color: "rose" },
];
const DEFAULT_BY_KEY: Record<string, { label: string; color: string }> = Object.fromEntries(
  PROJECT_STATUS_DEFAULTS.map((s) => [s.key, { label: s.label, color: s.color }]),
);

type Override = { label?: string; color?: string };

function parseOverrides(json: string | null | undefined): Record<string, Override> | null {
  if (!json) return null;
  try { const p = JSON.parse(json); return p && typeof p === "object" ? (p as Record<string, Override>) : null; } catch { return null; }
}

// Caché de proceso (config GLOBAL de la organización, igual para todos). Se calienta por request
// en el layout raíz, así siempre refleja lo último sin TTL.
let _overrides: Record<string, Override> | null = null;
let _warmed = false;
export function setProjectStatusOverrides(json: string | null | undefined): void {
  _overrides = parseOverrides(json);
  _warmed = true;
}
// ¿Ya se calentó la caché de overrides en este proceso? Los route handlers NO ejecutan el layout
// raíz, así que un worker frío cuya PRIMERA petición sea una API (p.ej. /activity) resolvería la
// píldora con los valores por defecto. Con esto pueden calentarla una sola vez, sin re-consultar la BD.
export function projectStatusOverridesWarmed(): boolean {
  return _warmed;
}

// Resuelve cómo se ve un estado (etiqueta + clases). Síncrono → lo usan los 8 sitios sin cambios.
export function resolveProjectStatus(status: string): StatusMeta {
  const def = DEFAULT_BY_KEY[status] ?? DEFAULT_BY_KEY.NUEVO;
  const ov = _overrides?.[status] ?? {};
  const label = (ov.label && ov.label.trim()) || def.label;
  const color = ov.color && STATUS_COLORS[ov.color] ? ov.color : def.color;
  return { label, className: STATUS_COLORS[color] ?? STATUS_COLORS.slate };
}

// Lista efectiva (default + override) a partir del JSON guardado — para el panel de Configuración
// (no depende de la caché de proceso).
export function projectStatusesFromJson(json: string | null | undefined): { key: string; label: string; color: string }[] {
  const ov = parseOverrides(json) ?? {};
  return PROJECT_STATUS_DEFAULTS.map((s) => ({
    key: s.key,
    label: (ov[s.key]?.label && ov[s.key]!.label!.trim()) || s.label,
    color: ov[s.key]?.color && STATUS_COLORS[ov[s.key]!.color!] ? ov[s.key]!.color! : s.color,
  }));
}
