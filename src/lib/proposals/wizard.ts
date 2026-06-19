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

// Jornadas de grabación al mes (planes de contenido).
const Q_JORNADAS: WizQuestion = {
  key: "jornadas",
  label: "¿Cuántas jornadas de grabación al mes?",
  help: "En una jornada grabamos en lote el contenido del mes.",
  input: "options",
  opts: [
    { v: "1", i: "📅", t: "1 jornada", d: "Grabación mensual en lote" },
    { v: "2", i: "📅", t: "2 jornadas", d: "Más variedad y locaciones" },
  ],
};

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
    Q_JORNADAS,
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
    Q_JORNADAS,
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
    Q_JORNADAS,
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
    {
      key: "guion",
      label: "¿Quién escribe el guion?",
      input: "options",
      opts: [
        { v: "lo escribimos nosotros", i: "✍️", t: "Lo escribimos", d: "Guion y storyboard de nuestra parte" },
        { v: "co-creado", i: "🤝", t: "Co-creado", d: "Lo armamos juntos" },
        { v: "lo entrega el cliente", i: "📄", t: "Lo entrega el cliente", d: "Ya tienen el mensaje listo" },
      ],
    },
    {
      key: "talento",
      label: "¿Quién aparece en cámara?",
      input: "options",
      opts: [
        { v: "el equipo del cliente", i: "🧑‍💼", t: "Su equipo", d: "Colaboradores / voceros propios" },
        { v: "un presentador", i: "🎤", t: "Presentador", d: "Conductor profesional" },
        { v: "actores / modelos", i: "🎭", t: "Actores / modelos", d: "Casting y talento contratado" },
        { v: "sin personas (b-roll)", i: "🎞️", t: "Sin personas", d: "Solo imágenes, producto o instalaciones" },
      ],
    },
    {
      key: "post",
      label: "¿Nivel de postproducción?",
      input: "options",
      opts: [
        { v: "estándar", i: "✂️", t: "Estándar", d: "Edición, música y corrección de color" },
        { v: "con motion graphics", i: "✨", t: "Con motion graphics", d: "Animaciones, títulos y gráficos" },
        { v: "cine (color + motion + sonido)", i: "🎬", t: "Cine", d: "Colorización, motion y diseño sonoro" },
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
    {
      key: "camaras",
      label: "¿Con cuántas cámaras?",
      input: "options",
      opts: [
        { v: "1", i: "🎥", t: "1 cámara", d: "Formato directo, charla o clase" },
        { v: "2-3", i: "🎬", t: "2–3 cámaras", d: "Realización dinámica — recomendado" },
        { v: "4+", i: "📺", t: "4+ cámaras", d: "Gran formato, escenario y público" },
      ],
    },
    {
      key: "horas",
      label: "¿Cuántas horas de transmisión?",
      input: "options",
      opts: [
        { v: "hasta 2 horas", i: "⏱️", t: "Hasta 2 h", d: "Charla o lanzamiento" },
        { v: "media jornada", i: "🕓", t: "Media jornada", d: "Hasta 4 horas" },
        { v: "jornada completa", i: "🌞", t: "Jornada completa", d: "Congreso de día completo" },
      ],
    },
    {
      key: "plataformas",
      label: "¿En cuántas plataformas a la vez?",
      help: "Multistreaming = YouTube + Meta + otras al mismo tiempo (requiere más subida).",
      input: "options",
      opts: [
        { v: "1 plataforma", i: "▶️", t: "1 plataforma", d: "Solo YouTube o solo Meta" },
        { v: "multistreaming", i: "🌐", t: "Multistreaming", d: "Varias plataformas simultáneas" },
        { v: "privada / pago por evento", i: "🔒", t: "Privada / PPV", d: "Enlace privado o pago por ver" },
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
        { v: "lifestyle", i: "🌿", t: "Lifestyle / social", d: "Ambiente, estilo de vida" },
        { v: "cubrimiento", i: "🎥", t: "Cubrimiento", d: "Jornada o evento" },
      ],
    },
    {
      key: "sesiones",
      label: "¿Cuántas sesiones?",
      input: "options",
      opts: [
        { v: "1", i: "1️⃣", t: "1 sesión", d: "Puntual" },
        { v: "2-3", i: "📸", t: "2–3 sesiones", d: "Varias fechas o looks" },
        { v: "4+", i: "🔁", t: "4+ sesiones", d: "Plan recurrente" },
      ],
    },
    {
      key: "locacion",
      label: "¿Dónde se realiza?",
      input: "options",
      opts: [
        { v: "en estudio", i: "🏢", t: "Estudio", d: "Set controlado con fondos e iluminación" },
        { v: "en locación del cliente", i: "📍", t: "Locación del cliente", d: "En sus instalaciones" },
        { v: "en exteriores", i: "🌳", t: "Exteriores", d: "Luz natural / ciudad" },
        { v: "estudio y locación", i: "🔀", t: "Estudio + locación", d: "Mixto" },
      ],
    },
    {
      key: "fotos",
      label: "¿Cuántas fotos editadas entregamos?",
      input: "options",
      opts: [
        { v: "10 a 20", i: "🖼️", t: "10–20", d: "Selección esencial" },
        { v: "30 a 50", i: "🖼️", t: "30–50", d: "Cobertura amplia — recomendado" },
        { v: "50 o más", i: "🖼️", t: "50+", d: "Catálogo extenso" },
      ],
    },
    {
      key: "retoque",
      label: "¿Nivel de retoque?",
      input: "options",
      opts: [
        { v: "básico", i: "✨", t: "Básico", d: "Color, luz y encuadre" },
        { v: "avanzado", i: "🎨", t: "Avanzado", d: "Piel, fondos y composición" },
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
    {
      key: "cobertura",
      label: "¿Qué cubrimos?",
      input: "options",
      opts: [
        { v: "foto y video", i: "🎬", t: "Foto + video", d: "Cobertura completa — recomendado" },
        { v: "solo video", i: "🎥", t: "Solo video", d: "Resumen y momentos clave" },
        { v: "solo fotografía", i: "📷", t: "Solo fotografía", d: "Galería del evento" },
      ],
    },
    {
      key: "duracion-cobertura",
      label: "¿Cuánto dura la cobertura?",
      input: "options",
      opts: [
        { v: "hasta 4 horas", i: "⏱️", t: "Hasta 4 h", d: "Media jornada" },
        { v: "jornada completa", i: "🌞", t: "Jornada (8 h)", d: "Día completo" },
        { v: "varios días", i: "🗓️", t: "Varios días", d: "Festival o convención" },
      ],
    },
    {
      key: "camaras",
      label: "¿Con cuántas cámaras?",
      input: "options",
      opts: [
        { v: "1", i: "🎥", t: "1 cámara", d: "Cobertura ágil" },
        { v: "2", i: "🎬", t: "2 cámaras", d: "Más ángulos — recomendado" },
        { v: "3+", i: "📺", t: "3+ cámaras", d: "Escenario y público" },
      ],
    },
    {
      key: "dron",
      label: "¿Incluimos tomas con dron?",
      input: "options",
      opts: [
        { v: "sí", i: "🚁", t: "Sí, con dron", d: "Tomas aéreas del lugar" },
        { v: "no", i: "🚫", t: "Sin dron", d: "No aplica o no es necesario" },
      ],
    },
    {
      key: "entrega-rapida",
      label: "¿Entrega de avance el mismo día?",
      input: "options",
      optional: true,
      opts: [
        { v: "sí", i: "⚡", t: "Sí, teaser el mismo día", d: "Pieza corta para publicar al instante" },
        { v: "no", i: "🗂️", t: "Entrega estándar", d: "En 24–72 h" },
      ],
    },
  ],
};

// Lista de pasos del asistente para una plantilla (sin el paso de selección).
export function wizardSteps(templateKey: string): WizQuestion[] {
  return [...WIZ_COMMON, ...(WIZ_EXTRA[templateKey] ?? []), Q_BUDGET];
}
