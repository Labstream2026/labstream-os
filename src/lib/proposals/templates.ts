// Las 7 plantillas del constructor de propuestas. Cada una expone `build(answers)`
// que devuelve { brand, blocks } interpolando las respuestas del asistente en
// copia en español. El diseño lo aplica el renderer (sistema de diseño de OS).

import { BRAND_DEFAULT, type Block, type Brand, type Answers } from "./types";
import { statsFor } from "./stats";
import { costCatalog, catalogToBudgetSections } from "./budget";
import { planSummary } from "./calendar";

export type TemplateDef = {
  key: string;
  icon: string;
  name: string;
  desc: string;
  build: (a: Answers) => { brand: Brand; blocks: Block[] };
};

// Resalta un valor con <strong>; si está vacío, usa el fallback (sin negrita).
const S = (v: string | undefined, fallback = "") => (v && v.trim() ? `<strong>${v.trim()}</strong>` : fallback);
const plain = (v: string | undefined, fallback = "") => (v && v.trim() ? v.trim() : fallback);

const TONO_COPY: Record<string, string> = {
  "cercano y humano": "cercano y humano",
  "premium y elegante": "premium y elegante",
  "experto y directo": "experto y directo",
};

function heroBlock(title: string, subtitle: string): Block {
  return { type: "hero", title, subtitle, bg: "" };
}

function budgetBlock(tpl: string): Block {
  const sections = catalogToBudgetSections(costCatalog(tpl));
  return {
    type: "budget",
    title: "Inversión detallada",
    sub: "Desglose transparente de equipos, talento y servicios.",
    cur: "COP",
    iva: 19,
    sections,
    note: "Valores antes de IVA. La pauta publicitaria se maneja como presupuesto aparte.",
  };
}

function ctaBlock(): Block {
  return {
    type: "cta",
    title: "Trabajemos juntos",
    sub: "Cuéntanos los detalles y armamos el plan a la medida.",
    btn: "Hablemos",
    email: BRAND_DEFAULT.email,
  };
}

function statsBlock(tpl: string, title: string): Block {
  return { type: "stats", title, items: statsFor(tpl) };
}

function planBlock(tpl: string): Block {
  const { plan } = planSummary(tpl);
  const codeName: Record<string, string> = { R: "Reels", H: "Historias", C: "Carruseles", Y: "Video largo", E: "Extra" };
  const counts = plan.reduce<Record<string, number>>((acc, p) => {
    acc[p.t] = (acc[p.t] ?? 0) + (p.quin ? 2 : 4);
    return acc;
  }, {});
  const rows = Object.entries(counts).map(([code, n]) => [
    codeName[code] ?? code,
    `${n}/mes`,
    code === "R" || code === "Y" ? "Video" : code === "C" ? "Imagen" : "Story",
    "Alcance y comunidad",
  ]);
  return {
    type: "plan",
    title: "Plan de publicación mensual",
    sub: "Cadencia recomendada por formato.",
    cols: ["Formato", "Frecuencia", "Tipo", "Objetivo"],
    rows,
  };
}

function calendarBlock(a: Answers): Block {
  return {
    type: "calendar",
    title: "Calendario de contenido del mes",
    pais: plain(a.pais, "Colombia"),
    mes: plain(a.mes, "Enero"),
    videos: Number(a.videos) || 8,
  };
}

// ── Plantillas ──
export const TEMPLATES: TemplateDef[] = [
  {
    key: "cubrimiento_fotografico",
    icon: "📷",
    name: "Cubrimiento fotográfico",
    desc: "Sesión o jornada de fotografía profesional: producto, marca, retrato o cubrimiento.",
    build: (a) => {
      const cliente = plain(a.cliente, "tu marca");
      return {
        brand: { ...BRAND_DEFAULT },
        blocks: [
          heroBlock(
            `Fotografía para ${cliente}`,
            plain(a.objetivo, "Imágenes que elevan la percepción de tu marca."),
          ),
          {
            type: "text",
            title: "La propuesta",
            body: `Diseñamos una sesión fotográfica para ${S(a.cliente, "tu marca")} en el sector ${S(a.sector, "de tu industria")}, pensada para ${S(a.publico, "tu público")}. El estilo será ${TONO_COPY[plain(a.tono)] ?? "cuidado y profesional"}, alineado con lo que te hace único: ${plain(a.diferencial, "tu sello propio")}.`,
          },
          {
            type: "cards",
            title: "Qué incluye",
            items: [
              { icon: "📸", t: "Dirección de fotografía", d: "Concepto, encuadres y dirección en set." },
              { icon: "💡", t: "Iluminación profesional", d: "Esquemas de luz para producto o retrato." },
              { icon: "🎨", t: "Retoque y entrega", d: "Selección y posproducción de las mejores tomas." },
            ],
          },
          {
            type: "timeline",
            title: "Cómo trabajamos",
            steps: [
              { phase: "Brief", dur: "Día 1", desc: "Alineamos referencias y objetivos." },
              { phase: "Sesión", dur: "Jornada", desc: "Producción fotográfica en locación o estudio." },
              { phase: "Entrega", dur: "Días 3–5", desc: "Selección, retoque y galería final." },
            ],
          },
          budgetBlock("cubrimiento_fotografico"),
          ctaBlock(),
        ],
      };
    },
  },
  {
    key: "cubrimiento_evento",
    icon: "🎪",
    name: "Cubrimiento de evento",
    desc: "Cobertura audiovisual de eventos: foto, video, highlights y entrega ágil.",
    build: (a) => {
      const cliente = plain(a.cliente, "tu evento");
      return {
        brand: { ...BRAND_DEFAULT },
        blocks: [
          heroBlock(`Cubrimiento para ${cliente}`, plain(a.objetivo, "Capturamos cada momento que importa.")),
          {
            type: "text",
            title: "La propuesta",
            body: `Acompañamos a ${S(a.cliente, "tu organización")} en el cubrimiento audiovisual del evento, con un enfoque ${TONO_COPY[plain(a.tono)] ?? "ágil y profesional"} para ${S(a.publico, "tu audiencia")}. Entregamos material listo para redes y un resumen que revive la experiencia.`,
          },
          {
            type: "cards",
            title: "Qué incluye",
            items: [
              { icon: "🎥", t: "Video del evento", d: "Cobertura de los momentos clave." },
              { icon: "📷", t: "Fotografía", d: "Galería editada del evento." },
              { icon: "⚡", t: "Highlights ágiles", d: "Piezas cortas para publicar el mismo día." },
            ],
          },
          {
            type: "timeline",
            title: "Cómo trabajamos",
            steps: [
              { phase: "Planeación", dur: "Previo", desc: "Run of show y puntos de cubrimiento." },
              { phase: "Evento", dur: "Día E", desc: "Cobertura de foto y video en vivo." },
              { phase: "Entrega", dur: "24–72 h", desc: "Highlights, galería y video resumen." },
            ],
          },
          budgetBlock("cubrimiento_evento"),
          ctaBlock(),
        ],
      };
    },
  },
  {
    key: "marca_personal",
    icon: "👤",
    name: "Marca Personal",
    desc: "Crear o evolucionar una marca personal: posicionamiento, identidad, contenido y canales.",
    build: (a) => {
      const cliente = plain(a.cliente, "tu marca personal");
      const modo = plain(a.modo) === "crear" ? "construir desde cero" : "llevar al siguiente nivel";
      return {
        brand: { ...BRAND_DEFAULT },
        blocks: [
          heroBlock(`Marca personal de ${cliente}`, plain(a.objetivo, "Tu voz, tu autoridad, tu comunidad.")),
          {
            type: "text",
            title: "El reto",
            body: `Vamos a ${modo} la marca personal de ${S(a.cliente, "nuestro protagonista")} en ${S(a.sector, "su sector")}, conectando con ${S(a.publico, "su audiencia")} desde un tono ${TONO_COPY[plain(a.tono)] ?? "auténtico"}. Lo que te diferencia: ${plain(a.diferencial, "una historia que vale la pena contar")}.`,
          },
          statsBlock("marca_personal", "Por qué la marca personal importa"),
          {
            type: "cards",
            title: "Pilares de contenido",
            items: [
              { icon: "🎯", t: "Autoridad", d: "Contenido experto que posiciona." },
              { icon: "💬", t: "Cercanía", d: "Historias que humanizan la marca." },
              { icon: "🚀", t: "Crecimiento", d: "Formatos pensados para alcance." },
            ],
          },
          planBlock("marca_personal"),
          calendarBlock(a),
          {
            type: "timeline",
            title: "Hoja de ruta",
            steps: [
              { phase: "Estrategia", dur: "Semana 1", desc: "Posicionamiento y línea editorial." },
              { phase: "Producción", dur: "Mensual", desc: "Jornada de rodaje del mes." },
              { phase: "Publicación", dur: "Continuo", desc: "Edición, calendario y comunidad." },
            ],
          },
          budgetBlock("marca_personal"),
          ctaBlock(),
        ],
      };
    },
  },
  {
    key: "contenido_empresa",
    icon: "🏢",
    name: "Contenido para Empresa",
    desc: "Estrategia y producción de contenido audiovisual continuo para marcas y empresas.",
    build: (a) => {
      const cliente = plain(a.cliente, "tu empresa");
      return {
        brand: { ...BRAND_DEFAULT },
        blocks: [
          heroBlock(`Contenido para ${cliente}`, plain(a.objetivo, "Contenido que construye marca y vende.")),
          {
            type: "text",
            title: "La propuesta",
            body: `Producimos contenido audiovisual continuo para ${S(a.cliente, "tu empresa")} en ${S(a.sector, "su industria")}, dirigido a ${S(a.publico, "su público objetivo")}, con un tono ${TONO_COPY[plain(a.tono)] ?? "profesional y cercano"}. Diferencial: ${plain(a.diferencial, "una propuesta de valor clara")}.`,
          },
          statsBlock("contenido_empresa", "El video es el formato que más convierte"),
          {
            type: "cards",
            title: "Qué hacemos cada mes",
            items: [
              { icon: "🧭", t: "Estrategia", d: "Línea editorial y guiones." },
              { icon: "🎬", t: "Producción", d: "Jornada de rodaje mensual." },
              { icon: "✂️", t: "Edición", d: "Reels, videos cortos y piezas." },
            ],
          },
          planBlock("contenido_empresa"),
          calendarBlock(a),
          budgetBlock("contenido_empresa"),
          ctaBlock(),
        ],
      };
    },
  },
  {
    key: "contenido_medico",
    icon: "🩺",
    name: "Contenido Médico",
    desc: "Contenido para profesionales de la salud: educación al paciente, plan de marketing y estilos de grabación.",
    build: (a) => {
      const cliente = plain(a.cliente, "tu práctica");
      return {
        brand: { ...BRAND_DEFAULT },
        blocks: [
          heroBlock(`Contenido para ${cliente}`, plain(a.objetivo, "Educa, genera confianza y atrae pacientes.")),
          {
            type: "text",
            title: "La propuesta",
            body: `Creamos contenido educativo para ${S(a.cliente, "tu práctica")} en ${S(a.sector, "el sector salud")}, pensado para ${S(a.publico, "tus pacientes")} con un tono ${TONO_COPY[plain(a.tono)] ?? "experto y empático"}. Tu diferencial: ${plain(a.diferencial, "el cuidado y la cercanía con el paciente")}.`,
          },
          statsBlock("contenido_medico", "Los pacientes deciden con información"),
          {
            type: "cards",
            title: "Líneas de contenido",
            items: [
              { icon: "🧠", t: "Educación", d: "Explica procedimientos y mitos." },
              { icon: "❤️", t: "Confianza", d: "Testimonios y casos reales." },
              { icon: "📅", t: "Conversión", d: "Llamados a agendar cita." },
            ],
          },
          planBlock("contenido_medico"),
          calendarBlock(a),
          budgetBlock("contenido_medico"),
          ctaBlock(),
        ],
      };
    },
  },
  {
    key: "video_institucional",
    icon: "🏛",
    name: "Video Institucional",
    desc: "Producción de videos corporativos e institucionales: concepto, rodaje y postproducción.",
    build: (a) => {
      const cliente = plain(a.cliente, "tu organización");
      const dur = plain(a["duracion-de-video"], "2–3 minutos");
      return {
        brand: { ...BRAND_DEFAULT },
        blocks: [
          heroBlock(`Video institucional para ${cliente}`, plain(a.objetivo, "Una historia que representa quién eres.")),
          {
            type: "text",
            title: "La propuesta",
            body: `Producimos un video institucional de ${S(dur)} para ${S(a.cliente, "tu organización")}, dirigido a ${S(a.publico, "tus audiencias clave")}, con un tono ${TONO_COPY[plain(a.tono)] ?? "sobrio y profesional"}. Diferencial: ${plain(a.diferencial, "lo que hace única a la organización")}.`,
          },
          statsBlock("video_institucional", "El video comunica como ningún otro formato"),
          {
            type: "cards",
            title: "Qué incluye",
            items: [
              { icon: "✍️", t: "Concepto y guion", d: "Idea, guion y storyboard." },
              { icon: "🎥", t: "Rodaje", d: `${plain(a.dias, "1–2")} día(s) de producción.` },
              { icon: "🎞️", t: "Postproducción", d: "Edición, color, sonido y motion." },
            ],
          },
          {
            type: "timeline",
            title: "Cronograma",
            steps: [
              { phase: "Preproducción", dur: "Semana 1", desc: "Guion, casting y locaciones." },
              { phase: "Rodaje", dur: "Semana 2", desc: "Producción audiovisual." },
              { phase: "Postproducción", dur: "Semanas 3–4", desc: "Edición y entrega final." },
            ],
          },
          budgetBlock("video_institucional"),
          ctaBlock(),
        ],
      };
    },
  },
  {
    key: "streaming",
    icon: "📡",
    name: "Streaming Profesional",
    desc: "Transmisiones en vivo multicámara para eventos, lanzamientos y formatos en directo.",
    build: (a) => {
      const cliente = plain(a.cliente, "tu evento");
      const evento = plain(a.evento, "tu transmisión");
      return {
        brand: { ...BRAND_DEFAULT },
        blocks: [
          heroBlock(`Streaming para ${cliente}`, plain(a.objetivo, "Transmite en vivo con calidad de TV.")),
          {
            type: "text",
            title: "La propuesta",
            body: `Montamos la transmisión en vivo de ${S(evento)} para ${S(a.cliente, "tu marca")}, con realización multicámara y un tono ${TONO_COPY[plain(a.tono)] ?? "dinámico y profesional"} para ${S(a.publico, "tu audiencia en línea")}.`,
          },
          {
            type: "cards",
            title: "Qué incluye",
            items: [
              { icon: "🎛️", t: "Realización multicámara", d: "Switcher en vivo y gráficas." },
              { icon: "📶", t: "Streaming estable", d: "Salida a YouTube, Meta o RTMP." },
              { icon: "🎙️", t: "Audio e iluminación", d: "Set técnico completo." },
            ],
          },
          {
            type: "timeline",
            title: "Cómo trabajamos",
            steps: [
              { phase: "Preproducción", dur: "Previo", desc: "Run of show y pruebas técnicas." },
              { phase: "Transmisión", dur: "Día E", desc: "Realización en vivo." },
              { phase: "Entrega", dur: "Posterior", desc: "Grabación y clips destacados." },
            ],
          },
          budgetBlock("streaming"),
          ctaBlock(),
        ],
      };
    },
  },
];

export const TEMPLATE_MAP: Record<string, TemplateDef> = Object.fromEntries(TEMPLATES.map((t) => [t.key, t]));

export function buildProposal(templateKey: string, answers: Answers): { brand: Brand; blocks: Block[] } {
  const tpl = TEMPLATE_MAP[templateKey] ?? TEMPLATES[0];
  return tpl.build(answers);
}
