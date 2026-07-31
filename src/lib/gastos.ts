// Catálogo de categorías de gasto del centro Finanzas. Módulo PURO (sin base de datos)
// para poder importarse desde el formulario cliente y desde las acciones de servidor.
// El color es un punto identificador en las filas — misma idea que los colores de pestaña.

export type CategoriaGasto = {
  key: string;
  label: string;
  // Punto de color de la fila (clase Tailwind de fondo, funciona en claro y oscuro).
  dot: string;
};

export const CATEGORIAS_GASTO: CategoriaGasto[] = [
  { key: "nomina", label: "Nómina y honorarios", dot: "bg-violet-500" },
  { key: "arriendo", label: "Arriendo y servicios", dot: "bg-sky-500" },
  { key: "equipos", label: "Equipos y mantenimiento", dot: "bg-slate-500" },
  { key: "software", label: "Software y suscripciones", dot: "bg-emerald-500" },
  { key: "transporte", label: "Transporte y rodajes", dot: "bg-pink-500" },
  { key: "alimentacion", label: "Alimentación", dot: "bg-amber-500" },
  { key: "marketing", label: "Marketing y ventas", dot: "bg-orange-500" },
  { key: "impuestos", label: "Impuestos y banco", dot: "bg-red-500" },
  { key: "otros", label: "Otros", dot: "bg-zinc-400" },
];

const POR_KEY = new Map(CATEGORIAS_GASTO.map((c) => [c.key, c]));

export function categoriaGasto(key: string): CategoriaGasto {
  return POR_KEY.get(key) ?? { key, label: key || "Sin categoría", dot: "bg-zinc-400" };
}

export function esCategoriaGasto(key: string): boolean {
  return POR_KEY.has(key);
}
