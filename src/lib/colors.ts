// Paleta de ~20 tonos reutilizable para estados, prioridades, fases, carpetas y proyectos.
// Cada tono trae clases para chip (bg+text+border), un punto sólido y un valor HEX
// (para el calendario y bordes). El equipo elige por nombre (key).

export type Tone = {
  key: string;
  label: string;
  chip: string; // clases para etiqueta/badge
  dot: string; // clase de fondo sólido (punto)
  hex: string; // color base (para calendario, barras)
};

export const TONES: Tone[] = [
  { key: "slate", label: "Gris", chip: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30", dot: "bg-slate-400", hex: "#64748b" },
  { key: "gray", label: "Plomo", chip: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-500/15 dark:text-gray-300 dark:border-gray-500/30", dot: "bg-gray-400", hex: "#6b7280" },
  { key: "zinc", label: "Carbón", chip: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-300 dark:border-zinc-500/30", dot: "bg-zinc-500", hex: "#71717a" },
  { key: "red", label: "Rojo", chip: "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30", dot: "bg-red-500", hex: "#ef4444" },
  { key: "rose", label: "Rosa", chip: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30", dot: "bg-rose-500", hex: "#f43f5e" },
  { key: "pink", label: "Fucsia", chip: "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30", dot: "bg-pink-500", hex: "#ec4899" },
  { key: "fuchsia", label: "Magenta", chip: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30", dot: "bg-fuchsia-500", hex: "#d946ef" },
  { key: "purple", label: "Morado", chip: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30", dot: "bg-purple-500", hex: "#a855f7" },
  { key: "violet", label: "Violeta", chip: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30", dot: "bg-violet-500", hex: "#8b5cf6" },
  { key: "indigo", label: "Índigo", chip: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30", dot: "bg-indigo-500", hex: "#6366f1" },
  { key: "blue", label: "Azul", chip: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30", dot: "bg-blue-500", hex: "#3b82f6" },
  { key: "sky", label: "Celeste", chip: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30", dot: "bg-sky-500", hex: "#0ea5e9" },
  { key: "cyan", label: "Cian", chip: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30", dot: "bg-cyan-500", hex: "#06b6d4" },
  { key: "teal", label: "Turquesa", chip: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30", dot: "bg-teal-500", hex: "#14b8a6" },
  { key: "emerald", label: "Esmeralda", chip: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30", dot: "bg-emerald-500", hex: "#10b981" },
  { key: "green", label: "Verde", chip: "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30", dot: "bg-green-500", hex: "#22c55e" },
  { key: "lime", label: "Lima", chip: "bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-500/15 dark:text-lime-300 dark:border-lime-500/30", dot: "bg-lime-500", hex: "#84cc16" },
  { key: "yellow", label: "Amarillo", chip: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30", dot: "bg-yellow-400", hex: "#eab308" },
  { key: "amber", label: "Ámbar", chip: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30", dot: "bg-amber-500", hex: "#f59e0b" },
  { key: "orange", label: "Naranja", chip: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30", dot: "bg-orange-500", hex: "#f97316" },
  { key: "brown", label: "Café", chip: "bg-stone-200 text-stone-700 border-stone-300 dark:bg-stone-500/20 dark:text-stone-300 dark:border-stone-500/30", dot: "bg-stone-500", hex: "#78716c" },
];

export const TONE_MAP: Record<string, Tone> = Object.fromEntries(TONES.map((t) => [t.key, t]));

export function tone(key: string | null | undefined): Tone {
  return (key && TONE_MAP[key]) || TONES[0];
}

// ── Etiquetas configurables (estados / prioridades de tarea) ──
// Fila ligera que viaja del servidor a los componentes cliente.
export type LabelRow = { key: string; label: string; color: string; isDefault: boolean; isDone: boolean };

// Devuelve { value, label } para poblar un <select>.
export function labelOptions(rows: LabelRow[]): { value: string; label: string }[] {
  return rows.map((r) => ({ value: r.key, label: r.label }));
}

// Presentación de una etiqueta por su key: nombre + clases del chip (con color).
export function labelMeta(rows: LabelRow[], key: string): { label: string; chip: string } {
  const r = rows.find((x) => x.key === key);
  return { label: r?.label ?? key, chip: tone(r?.color).chip };
}

// key del valor por defecto (o el primero) — para los formularios de "nueva tarea".
export function defaultKey(rows: LabelRow[]): string {
  return (rows.find((r) => r.isDefault) ?? rows[0])?.key ?? "";
}
