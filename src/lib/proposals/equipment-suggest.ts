// Sugerencia de EQUIPOS según las respuestas del asistente. Devuelve "necesidades" por
// categoría/tags (no ítems concretos): el componente las cruza con el inventario real para
// mostrar qué equipo del inventario haría falta y si hay suficiente. Función pura (cliente y
// servidor). Se conecta con el inventario de la Wiki (categorías y tags de [[labstream-os-equipos]]).

export type EquipNeed = { label: string; qty: number; cats: string[]; tags: string[] };

// Interpreta "1" / "2-3" / "4+" tomando la cota superior.
function num(v: string | undefined, fallback = 1): number {
  if (!v) return fallback;
  const c = v.replace("+", "");
  if (c.includes("-")) {
    const parts = c.split("-").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));
    return parts.length ? Math.max(...parts) : fallback;
  }
  const n = parseInt(c, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function suggestEquipment(tpl: string, a: Record<string, string>): EquipNeed[] {
  // Matching por CATEGORÍA del inventario (preciso). Solo se usan tags cuando la categoría
  // no basta (estabilizadores y dron viven en "Otro" pero tienen tag propio).
  switch (tpl) {
    case "streaming": {
      const cams = num(a.camaras, 2);
      return [
        { label: "Cámaras", qty: cams, cats: ["Cámara"], tags: [] },
        { label: "Switcher / encoder de streaming", qty: 1, cats: ["Streaming"], tags: [] },
        { label: "Kit de audio", qty: 1, cats: ["Audio"], tags: [] },
        { label: "Iluminación de set", qty: 1, cats: ["Iluminación"], tags: [] },
        ...((a.plataformas ?? "") === "multistreaming" ? [{ label: "Cómputo / red para multistreaming", qty: 1, cats: ["Cómputo"], tags: [] }] : []),
      ];
    }
    case "video_institucional":
      return [
        { label: "Cámara cinema", qty: 1, cats: ["Cámara"], tags: [] },
        { label: "Ópticas / lentes", qty: 1, cats: ["Lente"], tags: [] },
        { label: "Iluminación y grip", qty: 1, cats: ["Iluminación"], tags: [] },
        { label: "Sonido directo", qty: 1, cats: ["Audio"], tags: [] },
        { label: "Trípode / estabilizador", qty: 1, cats: ["Trípode/Soporte"], tags: ["estabilizador"] },
      ];
    case "cubrimiento_fotografico":
      return [
        { label: "Cámara", qty: 1, cats: ["Cámara"], tags: [] },
        { label: "Lente", qty: 1, cats: ["Lente"], tags: [] },
        ...((a.locacion ?? "").includes("estudio") ? [{ label: "Iluminación de estudio", qty: 1, cats: ["Iluminación"], tags: [] }] : []),
      ];
    case "cubrimiento_evento":
      return [
        { label: "Cámaras", qty: num(a.camaras, 2), cats: ["Cámara"], tags: [] },
        { label: "Kit de audio", qty: 1, cats: ["Audio"], tags: [] },
        { label: "Iluminación", qty: 1, cats: ["Iluminación"], tags: [] },
        ...((a.dron ?? "") === "sí" ? [{ label: "Dron", qty: 1, cats: [], tags: ["dron"] }] : []),
      ];
    default: // contenido (marca/empresa/médico)
      return [
        { label: "Cámara", qty: 1, cats: ["Cámara"], tags: [] },
        { label: "Iluminación", qty: 1, cats: ["Iluminación"], tags: [] },
        { label: "Audio", qty: 1, cats: ["Audio"], tags: [] },
      ];
  }
}

// ¿Un equipo del inventario satisface una necesidad? (por categoría o por tag).
export function matchesNeed(
  item: { category: string | null; tags: string[] },
  need: EquipNeed,
): boolean {
  if (item.category && need.cats.includes(item.category)) return true;
  return need.tags.some((t) => item.tags.includes(t));
}
