// Catálogo de costos por plantilla + motor de cálculo del bloque de inversión.
// Cada plantilla tiene secciones { s, items: Item[] }. El asistente y el editor
// permiten activar/desactivar ítems y ajustar cantidad (q) y valor unitario (v).

export type CostItem = {
  t: string; // concepto
  d: string; // detalle
  u: string; // unidad
  q: number; // cantidad
  v: number; // valor unitario (COP)
  on: boolean; // activo por defecto
};

export type CostSection = { s: string; items: CostItem[] };

// Helper para declarar ítems de forma compacta.
const IT = (t: string, d: string, u: string, q: number, v: number, on = true): CostItem => ({ t, d, u, q, v, on });

export const COSTOS: Record<string, CostSection[]> = {
  streaming: [
    {
      s: "Equipo de video",
      items: [
        IT("Cámaras multicámara", "2–3 cámaras con operador", "evento", 1, 1800000),
        IT("Switcher multicámara", "Realización en vivo (ATEM)", "evento", 1, 900000),
        IT("Encoder y streaming", "Salida a YouTube/Meta/RTMP", "evento", 1, 600000),
        IT("Monitoreo y back-up", "Grabación de respaldo ISO", "evento", 1, 400000, false),
      ],
    },
    {
      s: "Audio e iluminación",
      items: [
        IT("Kit de audio", "Microfonía + consola", "evento", 1, 700000),
        IT("Iluminación de set", "Esquema de 3 puntos", "evento", 1, 500000),
      ],
    },
    {
      s: "Talento y servicios",
      items: [
        IT("Director de transmisión", "Coordinación en vivo", "día", 1, 800000),
        IT("Productor de campo", "Logística y run of show", "día", 1, 600000),
        IT("Gráficas en vivo", "Lower thirds y placas", "evento", 1, 450000, false),
      ],
    },
  ],
  video_institucional: [
    {
      s: "Preproducción",
      items: [
        IT("Guion y concepto", "Idea, guion y storyboard", "proyecto", 1, 900000),
        IT("Dirección", "Dirección creativa", "proyecto", 1, 800000),
      ],
    },
    {
      s: "Rodaje",
      items: [
        IT("Equipo de cámara", "Cámara cinema + óptica", "día", 2, 1200000),
        IT("Iluminación y grip", "Set de luces y soportería", "día", 2, 600000),
        IT("Sonido directo", "Microfonista + equipo", "día", 2, 400000),
      ],
    },
    {
      s: "Postproducción",
      items: [
        IT("Edición y montaje", "Corte, ritmo y estructura", "proyecto", 1, 1100000),
        IT("Color y sonido", "Colorización y mezcla", "proyecto", 1, 700000),
        IT("Motion graphics", "Animación de marca", "proyecto", 1, 600000, false),
      ],
    },
  ],
  contenido_empresa: [
    {
      s: "Estrategia",
      items: [
        IT("Estrategia de contenido", "Línea editorial mensual", "mes", 1, 700000),
        IT("Guiones", "Guiones de las piezas", "mes", 1, 500000),
      ],
    },
    {
      s: "Producción",
      items: [
        IT("Jornada de rodaje", "Grabación mensual", "día", 1, 1400000),
        IT("Fotografía de apoyo", "Banco de imágenes", "mes", 1, 500000, false),
      ],
    },
    {
      s: "Postproducción",
      items: [
        IT("Edición de piezas", "Reels y videos cortos", "mes", 1, 1200000),
        IT("Diseño y plantillas", "Gráficas y portadas", "mes", 1, 400000),
      ],
    },
  ],
  contenido_medico: [
    {
      s: "Estrategia y guion",
      items: [
        IT("Estrategia clínica", "Educación al paciente", "mes", 1, 750000),
        IT("Guiones con base médica", "Revisión de contenido", "mes", 1, 550000),
      ],
    },
    {
      s: "Producción",
      items: [
        IT("Jornada de rodaje", "Grabación en consultorio", "día", 1, 1300000),
        IT("Set y ambientación", "Fondo y utilería", "día", 1, 350000, false),
      ],
    },
    {
      s: "Postproducción",
      items: [
        IT("Edición de piezas", "Reels educativos", "mes", 1, 1150000),
        IT("Subtítulos y accesibilidad", "Texto en pantalla", "mes", 1, 300000),
      ],
    },
  ],
  marca_personal: [
    {
      s: "Estrategia",
      items: [
        IT("Posicionamiento", "Narrativa y pilares", "proyecto", 1, 800000),
        IT("Línea editorial", "Calendario mensual", "mes", 1, 500000),
      ],
    },
    {
      s: "Producción",
      items: [
        IT("Jornada de rodaje", "Grabación mensual", "día", 1, 1200000),
        IT("Dirección de cámara", "Coaching frente a cámara", "día", 1, 400000, false),
      ],
    },
    {
      s: "Postproducción",
      items: [
        IT("Edición de piezas", "Reels y cápsulas", "mes", 1, 1100000),
        IT("Identidad visual", "Plantillas y portadas", "mes", 1, 350000),
      ],
    },
  ],
  cubrimiento_fotografico: [
    {
      s: "Producción fotográfica",
      items: [
        IT("Jornada de fotografía", "Fotógrafo + asistente", "jornada", 1, 1200000),
        IT("Iluminación de estudio", "Esquema profesional", "jornada", 1, 400000, false),
      ],
    },
    {
      s: "Postproducción",
      items: [
        IT("Selección y retoque", "Edición de las mejores tomas", "paquete", 1, 600000),
        IT("Entrega en alta", "Galería digital", "paquete", 1, 200000),
      ],
    },
  ],
  cubrimiento_evento: [
    {
      s: "Cubrimiento",
      items: [
        IT("Foto y video del evento", "Equipo de cubrimiento", "evento", 1, 1600000),
        IT("Segundo operador", "Cobertura simultánea", "evento", 1, 600000, false),
      ],
    },
    {
      s: "Entrega",
      items: [
        IT("Highlights del evento", "Video resumen", "pieza", 1, 700000),
        IT("Galería fotográfica", "Selección editada", "paquete", 1, 400000),
      ],
    },
  ],
};

// Devuelve el catálogo de una plantilla (con fallback a contenido_empresa).
export function costCatalog(tpl: string): CostSection[] {
  const base = COSTOS[tpl] ?? COSTOS.contenido_empresa;
  // copia profunda para no mutar el catálogo compartido
  return base.map((sec) => ({ s: sec.s, items: sec.items.map((it) => ({ ...it })) }));
}

// Interpreta una respuesta numérica del asistente ("1", "2-3", "4+", "12") tomando la cota
// superior cuando es un rango (más realista para cámaras/sesiones). Defecto si no aplica.
function answerNum(v: string | undefined, fallback = 1): number {
  if (!v) return fallback;
  const c = v.replace("+", "");
  if (c.includes("-")) {
    const parts = c.split("-").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));
    return parts.length ? Math.max(...parts) : fallback;
  }
  const n = parseInt(c, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Ajusta el catálogo de costos según las respuestas concretas del asistente: cantidades
// (días de rodaje, nº de cámaras, sesiones, jornadas) y activación de ítems (motion graphics,
// guion, iluminación de estudio, segundo operador). Es un PRE-LLENADO no destructivo: el
// equipo siempre puede afinarlo después. Si los nombres del catálogo no coinciden, no toca nada.
export function applyAnswersToCatalog(tpl: string, a: Record<string, string>, sections: CostSection[]): CostSection[] {
  const out = sections.map((sec) => ({ s: sec.s, items: sec.items.map((it) => ({ ...it })) }));
  const each = (fn: (it: CostItem) => void) => out.forEach((sec) => sec.items.forEach(fn));
  const has = (it: CostItem, kw: string) => it.t.toLowerCase().includes(kw);

  if (tpl === "video_institucional") {
    const dias = answerNum(a.dias, 2);
    each((it) => { if (it.u === "día") it.q = dias; }); // equipo de rodaje por día
    const post = a.post ?? "";
    each((it) => { if (has(it, "motion")) it.on = post.includes("motion") || post.includes("cine"); });
    each((it) => { if (has(it, "guion")) it.on = a.guion !== "lo entrega el cliente"; });
  } else if (tpl === "streaming") {
    const cam = answerNum(a.camaras, 1);
    // Solo la línea de cámaras (no el switcher "multicámara"): nombre que empieza por "cámara".
    each((it) => { const n = it.t.toLowerCase(); if (n.startsWith("cámara") || n.startsWith("camara")) it.q = cam; });
    if ((a.plataformas ?? "") === "multistreaming") each((it) => { if (has(it, "gráfica") || has(it, "grafica")) it.on = true; });
  } else if (tpl === "cubrimiento_fotografico") {
    const ses = answerNum(a.sesiones, 1);
    each((it) => { if (has(it, "jornada") || has(it, "retoque")) it.q = ses; });
    if ((a.locacion ?? "").includes("estudio")) each((it) => { if (has(it, "iluminación de estudio") || has(it, "iluminacion de estudio")) it.on = true; });
  } else if (tpl === "cubrimiento_evento") {
    if (answerNum(a.camaras, 1) > 1) each((it) => { if (has(it, "segundo operador")) it.on = true; });
    if ((a["duracion-cobertura"] ?? "") === "varios días") each((it) => { if (has(it, "foto y video")) it.q = 2; });
  } else if (tpl === "marca_personal" || tpl === "contenido_empresa" || tpl === "contenido_medico") {
    const jornadas = answerNum(a.jornadas, 1);
    each((it) => { if (has(it, "jornada de rodaje")) it.q = jornadas; });
  }
  return out;
}

// Convierte el catálogo (con on/off) en las secciones que guarda el bloque budget.
export function catalogToBudgetSections(catalog: CostSection[]) {
  return catalog
    .map((sec) => ({
      s: sec.s,
      items: sec.items.filter((it) => it.on).map((it) => ({ t: it.t, d: it.d, u: it.u, q: it.q, v: it.v })),
    }))
    .filter((sec) => sec.items.length > 0);
}

export type BudgetLine = { t: string; d: string; u: string; q: number; v: number };
export type BudgetSection = { s: string; items: BudgetLine[] };

// Totales del bloque budget: subtotal, IVA y total.
export function budgetTotals(sections: BudgetSection[], iva = 19) {
  const subtotal = sections.reduce(
    (sum, sec) => sum + sec.items.reduce((s, it) => s + (Number(it.q) || 0) * (Number(it.v) || 0), 0),
    0,
  );
  const tax = Math.round((subtotal * (Number(iva) || 0)) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

export function sectionSubtotal(sec: BudgetSection) {
  return sec.items.reduce((s, it) => s + (Number(it.q) || 0) * (Number(it.v) || 0), 0);
}

// Costo INTERNO (no se muestra al cliente): suma de ítems del catálogo + % de transporte
// e imprevistos. Sirve al equipo para fijar el precio con margen.
export function internalCost(sections: BudgetSection[], contingencyPct = 0) {
  const items = sections.reduce(
    (sum, sec) => sum + sec.items.reduce((s, it) => s + (Number(it.q) || 0) * (Number(it.v) || 0), 0),
    0,
  );
  const contingency = Math.round((items * (Number(contingencyPct) || 0)) / 100);
  return { items, contingency, total: items + contingency };
}

// Totales DE CARA AL CLIENTE: precio base − descuento, + IVA. Es lo ÚNICO que ve el cliente
// (nunca el desglose de costos internos).
export function clientTotals(opts: { price: number; discountPct?: number; iva?: number }) {
  const base = Math.max(0, Number(opts.price) || 0);
  // El descuento se ACOTA a [0,100] y el IVA a ≥0: el editor de bloques no valida estos campos, así
  // que sin el clamp un descuento >100% daría un total NEGATIVO y uno negativo lo INFLARÍA — y esa
  // cifra es justo la que ve el cliente en el portal público. Se defiende en el punto de cálculo.
  const discountPct = Math.max(0, Math.min(100, Number(opts.discountPct) || 0));
  const discount = Math.round((base * discountPct) / 100);
  const subtotal = base - discount;
  const iva = Math.max(0, Number(opts.iva) || 0);
  const tax = Math.round((subtotal * iva) / 100);
  return { base, discount, subtotal, tax, total: subtotal + tax };
}
