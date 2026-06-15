// El asistente (wizard): una pregunta por paso. El listado de pasos por plantilla
// es: WIZ_COMMON + (WIZ_EXTRA[tpl] || []) + [Q_BUDGET]. El paso 1 (elegir plantilla)
// lo maneja la propia UI antes de estas preguntas.

import { PAISES, MESES } from "./calendar";

export type WizInput = "text" | "textarea" | "options" | "select" | "budget";
export type WizOption = { v: string; t?: string; d?: string; i?: string };
export type WizQuestion = {
  key: string;
  label: string;
  help?: string;
  input: WizInput;
  ph?: string;
  opts?: WizOption[];
  optional?: boolean;
};

export const WIZ_COMMON: WizQuestion[] = [
  {
    key: "cliente",
    label: "¿Para qué cliente o persona es esta propuesta?",
    help: "Nombre de la empresa, médico o persona. Aparecerá en toda la propuesta.",
    input: "text",
    ph: "Ej: Clínica Vital, Dra. Gómez, Café Aurora",
  },
  {
    key: "sector",
    label: "¿En qué sector o industria está el cliente?",
    input: "text",
    ph: "Ej: gastronomía, salud estética, construcción, moda",
    optional: true,
  },
  {
    key: "publico",
    label: "¿Quién es su público objetivo?",
    input: "text",
    ph: "Ej: mujeres 25-45 interesadas en bienestar; gerentes de compras B2B",
    optional: true,
  },
  {
    key: "tono",
    label: "¿Qué tono debe tener la comunicación?",
    input: "options",
    opts: [
      { v: "cercano y humano", i: "🤝", t: "Cercano", d: "Conversacional, cálido, de tú a tú" },
      { v: "premium y elegante", i: "✨", t: "Premium", d: "Sofisticado, aspiracional, cuidado" },
      { v: "experto y directo", i: "🎯", t: "Experto", d: "Autoridad técnica, datos, sin rodeos" },
    ],
  },
  {
    key: "diferencial",
    label: "¿Qué hace único a este cliente?",
    input: "textarea",
    ph: "Ej: 15 años de experiencia, única clínica con tecnología X, recetas de autor",
    optional: true,
  },
  {
    key: "objetivo",
    label: "¿Cuál es el objetivo principal?",
    help: "Una frase. Se usará en la portada. Puedes dejarlo vacío y usar el texto sugerido.",
    input: "textarea",
    ph: "Ej: Duplicar el alcance en redes y generar 30 citas mensuales",
    optional: true,
  },
  {
    key: "duracion",
    label: "¿Duración o alcance del proyecto?",
    input: "options",
    opts: [
      { v: "1 mes", i: "⚡", t: "1 mes", d: "Proyecto puntual o piloto" },
      { v: "3 meses", i: "🌱", t: "3 meses", d: "Plan recomendado para ver resultados" },
      { v: "6 meses", i: "🚀", t: "6 meses", d: "Crecimiento sostenido" },
      { v: "proyecto único", i: "🎬", t: "Proyecto único", d: "Una sola producción / evento" },
    ],
  },
];

const Q_PAIS: WizQuestion = {
  key: "pais",
  label: "¿En qué país está el cliente?",
  help: "El calendario de contenido y las fechas comerciales se adaptan al país.",
  input: "select",
  opts: PAISES.map((p) => ({ v: p, t: p })),
};

const Q_MES: WizQuestion = {
  key: "mes",
  label: "¿En qué mes arranca el plan?",
  help: "El plan y el calendario se arman con las fechas clave de ese mes en el país elegido.",
  input: "select",
  opts: MESES.map((m) => ({ v: m, t: m })),
};

export const Q_BUDGET: WizQuestion = {
  key: "budget",
  label: "Arma el desglose de inversión",
  help: "Activa lo que esta propuesta necesita y ajusta cantidades y valores. El cliente verá el desglose elegante al final.",
  input: "budget",
};

const videosOpts = (tiers: [string, string, string, string][]): WizOption[] =>
  tiers.map(([v, i, t, d]) => ({ v, i, t, d }));

export const WIZ_EXTRA: Record<string, WizQuestion[]> = {
  marca_personal: [
    Q_PAIS,
    Q_MES,
    {
      key: "modo",
      label: "¿Crear desde cero o evolucionar la marca?",
      input: "options",
      opts: [
        { v: "crear", i: "✨", t: "Crear desde cero", d: "Aún no tiene presencia construida" },
        { v: "evolucionar", i: "📈", t: "Evolucionar", d: "Ya tiene marca, hay que llevarla al siguiente nivel" },
      ],
    },
    {
      key: "videos",
      label: "¿Cuántas piezas de video al mes?",
      input: "options",
      opts: videosOpts([
        ["4", "🌙", "4 piezas", "Presencia básica"],
        ["8", "⭐", "8 piezas", "Ritmo recomendado"],
        ["16", "🔥", "16 piezas", "Dominio del feed"],
      ]),
    },
  ],
  contenido_empresa: [
    Q_PAIS,
    Q_MES,
    {
      key: "videos",
      label: "¿Cuántas piezas de contenido al mes?",
      input: "options",
      opts: videosOpts([
        ["8", "🌙", "8 piezas", "Plan inicial"],
        ["12", "⭐", "12 piezas", "Ritmo recomendado"],
        ["20", "🔥", "20+ piezas", "Alta intensidad"],
      ]),
    },
  ],
  contenido_medico: [
    Q_PAIS,
    Q_MES,
    {
      key: "videos",
      label: "¿Cuántas piezas de contenido al mes?",
      input: "options",
      opts: videosOpts([
        ["8", "🌙", "8 piezas", "Plan inicial"],
        ["12", "⭐", "12 piezas", "Ritmo recomendado"],
        ["16", "🔥", "16 piezas", "Alta intensidad"],
      ]),
    },
  ],
  video_institucional: [
    {
      key: "duracion-de-video",
      label: "¿Duración del video principal?",
      input: "options",
      opts: [
        { v: "60-90 segundos", i: "⚡", t: "60-90 seg", d: "Directo y compartible" },
        { v: "2-3 minutos", i: "⭐", t: "2-3 min", d: "El estándar institucional — recomendado" },
        { v: "4-5 minutos", i: "🎬", t: "4-5 min", d: "Narrativa profunda / documental" },
      ],
    },
    {
      key: "dias",
      label: "¿Cuántos días de rodaje estimas?",
      input: "options",
      opts: [
        { v: "1", i: "☀️", t: "1 día", d: "Una locación, formato ágil" },
        { v: "2", i: "🌗", t: "2 días", d: "Varias locaciones — recomendado" },
        { v: "3", i: "🌑", t: "3+ días", d: "Producción grande, varias sedes" },
      ],
    },
  ],
  streaming: [
    {
      key: "evento",
      label: "¿Qué evento es y cuándo?",
      help: "Nombre y fecha aproximada: personaliza el run of show.",
      input: "text",
      ph: "Ej: Congreso anual de cardiología — 15 de agosto",
      optional: true,
    },
    {
      key: "audiencia",
      label: "¿Audiencia esperada en línea?",
      input: "options",
      opts: [
        { v: "menos de 200", i: "👥", t: "<200", d: "Evento interno o de nicho" },
        { v: "200 a 1.000", i: "🏟", t: "200–1.000", d: "Lanzamiento o congreso" },
        { v: "más de 1.000", i: "📡", t: "1.000+", d: "Gran audiencia / abierto" },
      ],
    },
  ],
  cubrimiento_fotografico: [
    {
      key: "tipo-sesion",
      label: "¿Qué tipo de sesión es?",
      input: "options",
      opts: [
        { v: "producto", i: "📦", t: "Producto", d: "Catálogo o e-commerce" },
        { v: "retrato", i: "🧑", t: "Retrato / marca personal", d: "Personas y branding" },
        { v: "cubrimiento", i: "🎥", t: "Cubrimiento", d: "Jornada o evento" },
      ],
    },
  ],
  cubrimiento_evento: [
    {
      key: "tipo-evento",
      label: "¿Qué tipo de evento es?",
      input: "options",
      opts: [
        { v: "corporativo", i: "🏢", t: "Corporativo", d: "Lanzamiento, congreso, feria" },
        { v: "social", i: "🎉", t: "Social", d: "Celebración o experiencia" },
        { v: "cultural", i: "🎭", t: "Cultural", d: "Concierto, festival, show" },
      ],
    },
  ],
};

// Lista de pasos del asistente para una plantilla (sin el paso de selección).
export function wizardSteps(templateKey: string): WizQuestion[] {
  return [...WIZ_COMMON, ...(WIZ_EXTRA[templateKey] ?? []), Q_BUDGET];
}
