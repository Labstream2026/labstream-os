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
      const sesiones = plain(a.sesiones, "1");
      const sesTxt = sesiones === "1" ? "una sesión" : `${sesiones} sesiones`;
      const loc = plain(a.locacion, "en locación o estudio");
      const fotos = plain(a.fotos);
      const retoque = plain(a.retoque, "profesional");
      const especifico = `Contemplamos ${S(sesTxt)} ${loc}${fotos ? `, con entrega de ${S(`${fotos} fotos`)} editadas (retoque ${retoque})` : ""}.`;
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
            body: `Diseñamos ${sesTxt} de fotografía para ${S(a.cliente, "tu marca")} en el sector ${S(a.sector, "de tu industria")}, pensada para ${S(a.publico, "tu público")}. El estilo será ${TONO_COPY[plain(a.tono)] ?? "cuidado y profesional"}, alineado con lo que te hace único: ${plain(a.diferencial, "tu sello propio")}. ${especifico}`,
          },
          {
            type: "cards",
            title: "Qué incluye",
            items: [
              { icon: "📸", t: "Dirección de fotografía", d: `Concepto, encuadres y dirección ${loc}.` },
              { icon: "💡", t: "Iluminación profesional", d: plain(a.locacion) === "en estudio" ? "Set de estudio con fondos e iluminación controlada." : "Esquemas de luz para producto, retrato o exteriores." },
              { icon: "🎨", t: "Retoque y entrega", d: fotos ? `${fotos} fotos editadas (retoque ${retoque}) en galería online.` : "Selección y posproducción de las mejores tomas." },
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
      const cobertura = plain(a.cobertura, "foto y video");
      const dur = plain(a["duracion-cobertura"], "");
      const camaras = plain(a.camaras, "");
      const dron = plain(a.dron) === "sí";
      const tecnico = [
        cobertura ? `cobertura de ${cobertura}` : "",
        camaras ? `${camaras} cámara(s)` : "",
        dur ? dur : "",
        dron ? "tomas con dron" : "",
      ].filter(Boolean).join(" · ");
      const items = [
        cobertura !== "solo fotografía" ? { icon: "🎥", t: "Video del evento", d: `Cobertura de los momentos clave${camaras ? ` con ${camaras} cámara(s)` : ""}.` } : null,
        cobertura !== "solo video" ? { icon: "📷", t: "Fotografía", d: "Galería editada del evento." } : null,
        dron ? { icon: "🚁", t: "Tomas aéreas", d: "Plano del lugar y la asistencia con dron." } : null,
        { icon: "⚡", t: "Highlights ágiles", d: plain(a["entrega-rapida"]) === "sí" ? "Teaser corto el mismo día del evento." : "Piezas cortas para redes." },
      ].filter(Boolean) as { icon: string; t: string; d: string }[];
      return {
        brand: { ...BRAND_DEFAULT },
        blocks: [
          heroBlock(`Cubrimiento para ${cliente}`, plain(a.objetivo, "Capturamos cada momento que importa.")),
          {
            type: "text",
            title: "La propuesta",
            body: `Acompañamos a ${S(a.cliente, "tu organización")} en el cubrimiento audiovisual del evento, con un enfoque ${TONO_COPY[plain(a.tono)] ?? "ágil y profesional"} para ${S(a.publico, "tu audiencia")}.${tecnico ? ` Incluye ${S(tecnico)}.` : ""} Entregamos material listo para redes y un resumen que revive la experiencia.`,
          },
          {
            type: "cards",
            title: "Qué incluye",
            items,
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
              { icon: "✍️", t: "Concepto y guion", d: plain(a.guion) === "lo entrega el cliente" ? "Partimos del guion que ya tienes." : plain(a.guion) === "co-creado" ? "Guion y storyboard co-creados contigo." : "Idea, guion y storyboard de nuestra parte." },
              { icon: "🎥", t: "Rodaje", d: `${plain(a.dias, "1–2")} día(s) de producción${plain(a.talento) ? `, con ${plain(a.talento)}` : ""}.` },
              { icon: "🎞️", t: "Postproducción", d: plain(a.post) === "cine (color + motion + sonido)" ? "Edición, colorización, motion graphics y diseño sonoro." : plain(a.post) === "con motion graphics" ? "Edición, música, color y motion graphics." : "Edición, música y corrección de color." },
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
      const camaras = plain(a.camaras, "");
      const horas = plain(a.horas, "");
      const plataformas = plain(a.plataformas, "");
      const realiz = camaras === "1" ? "realización a una cámara" : "realización multicámara";
      const tecnico = [camaras ? `${camaras} cámara(s)` : "", horas || "", plataformas || ""].filter(Boolean).join(" · ");
      return {
        brand: { ...BRAND_DEFAULT },
        blocks: [
          heroBlock(`Streaming para ${cliente}`, plain(a.objetivo, "Transmite en vivo con calidad de TV.")),
          {
            type: "text",
            title: "La propuesta",
            body: `Montamos la transmisión en vivo de ${S(evento)} para ${S(a.cliente, "tu marca")}, con ${realiz} y un tono ${TONO_COPY[plain(a.tono)] ?? "dinámico y profesional"} para ${S(a.publico, "tu audiencia en línea")}.${tecnico ? ` Plan técnico: ${S(tecnico)}.` : ""}`,
          },
          {
            type: "cards",
            title: "Qué incluye",
            items: [
              { icon: "🎛️", t: realiz === "realización a una cámara" ? "Realización 1 cámara" : "Realización multicámara", d: `Switcher en vivo y gráficas${camaras ? ` (${camaras} cámaras)` : ""}.` },
              { icon: "📶", t: "Streaming estable", d: plataformas === "multistreaming" ? "Salida simultánea a YouTube, Meta y más." : plataformas === "privada / pago por evento" ? "Enlace privado o pago por evento (PPV)." : "Salida a YouTube, Meta o RTMP." },
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

  // ── Documental de causa ── el deck de Mi Páramo hecho plantilla. Nace en tema «cine»: es
  // la única que estrena el deck editorial (verde-noche y crema, videos de fondo, índice
  // lateral). Los fondos se eligen luego desde la biblioteca, en el editor.
  {
    key: "documental_causa",
    icon: "⛰️",
    name: "Documental de causa",
    desc: "Cobertura y pieza documental para fundaciones, territorios y causas. Deck a pantalla completa.",
    build: (a) => {
      const cliente = plain(a.cliente, "la organización");
      const publico = plain(a.publico, "sus aliados y comunidades");
      const objetivo = plain(a.objetivo, "contar la causa con emoción y verdad");
      const duracion = plain(a.duracion, "2 minutos");
      return {
        brand: { ...BRAND_DEFAULT, theme: "cine" },
        blocks: [
          {
            type: "hero",
            kicker: `${BRAND_DEFAULT.company} · Propuesta de cobertura audiovisual`,
            title: plain(a.proyecto, "Nombre del proyecto"),
            subtitle: "una historia que merece contarse",
            intro: `Cobertura audiovisual y pieza documental de la jornada, para ${cliente}.`,
            bg: "",
            bgVideo: "",
            tone: "dark",
            meta: [
              { k: "Jornada de campo", v: plain(a.fecha, "por definir") },
              { k: "Locación", v: plain(a.locacion, "por definir") },
              { k: "Para", v: cliente },
            ],
          },
          {
            type: "logos",
            kicker: "Con quiénes hemos trabajado",
            title: "Historias que dejan huella, para quienes construyen país.",
            sub: `Somos una casa productora que traduce causas, marcas y territorios en piezas audiovisuales con alma.`,
            tone: "dark",
            items: [{ name: "Marca aliada", logo: "" }],
          },
          {
            type: "cards",
            kicker: "El punto de partida",
            title: "Lo que entendimos de su iniciativa.",
            sub: "Antes de proponer, escuchamos. Esto guiará cada decisión creativa.",
            tone: "light",
            items: [
              { icon: "01", t: "Una jornada, una historia", d: "El día de trabajo en campo como punto de partida del relato." },
              { icon: "02", t: "La voz de los aliados", d: `Testimonios de ${publico} como fragmentos que construyen la historia, no como entrevistas.` },
              { icon: "03", t: "Ritmo y emoción", d: `Una pieza ágil y fresca, con narrativa emocional de aproximadamente ${duracion}.` },
              { icon: "04", t: "Territorio protagonista", d: "Paisaje, trabajo en campo y equipo humano con mirada cinematográfica." },
            ],
          },
          {
            type: "text",
            kicker: "Concepto creativo",
            title: "La gran idea.",
            tone: "dark",
            body: `No filmamos un evento: filmamos ${S(objetivo, objetivo)}. Construimos la pieza como un pequeño poema documental —territorio, manos que trabajan y voces que creen— montado con un ritmo que emociona sin sobreexplicar.`,
          },
          {
            type: "checks",
            kicker: "Alcance del servicio",
            title: "Todo lo que incluye esta propuesta.",
            tone: "light",
            items: [
              "Cobertura audiovisual completa de la jornada en campo, de principio a fin.",
              "Captura del paisaje, las actividades, el equipo de trabajo y los momentos más representativos.",
              "Grabación de entrevistas a los voceros definidos por la organización.",
              "Entrega del material en crudo, organizado y listo para su archivo.",
              `Edición y entrega de un video final de aproximadamente ${duracion}.`,
              "Tres a cuatro rondas de ajustes sobre la versión editada.",
            ],
          },
          {
            type: "cards",
            kicker: "Lo que reciben",
            title: "Entregables.",
            tone: "dark",
            items: [
              { icon: "🎬", t: `Video final · ~${duracion}`, d: "Master en alta resolución, horizontal 16:9, con color, música licenciada y diseño sonoro." },
              { icon: "🗂", t: "Material en crudo", d: "Todas las tomas y entrevistas del día, organizadas y entregadas por disco o transferencia." },
              { icon: "🔁", t: "Hasta 4 rondas de ajustes", d: "Acompañamiento en la revisión hasta lograr la versión que los represente." },
              { icon: "📱", t: "Versión vertical · opcional", d: "Adaptación 9:16 pensada para Reels, TikTok e Instagram." },
            ],
          },
          {
            type: "timeline",
            kicker: "Logística y tiempos",
            title: "Del rodaje a la entrega.",
            tone: "light",
            steps: [
              { phase: "Salida y llegada", dur: "6:00 a.m.", desc: "Equipo, cámaras y transporte listos para desplazarse al punto de encuentro." },
              { phase: "En campo", dur: "Día", desc: "Cobertura de las actividades, testimonios de los voceros y planos de apoyo." },
              { phase: "Primer corte", dur: "+5 días", desc: "Entrega de la primera versión editada tras el rodaje." },
              { phase: "Entrega final", dur: "Cierre", desc: "Master final más el material en crudo organizado." },
            ],
          },
          {
            type: "stats",
            kicker: "En cifras",
            title: "La jornada, en números.",
            tone: "light",
            items: [
              { n: "1", p: "Día de rodaje", f: "" },
              { n: `${duracion}`, p: "Video final", f: "" },
              { n: "4", p: "Rondas de ajuste", f: "" },
            ],
          },
          { ...budgetBlock("video_institucional"), kicker: "Inversión", title: "Cotización.", tone: "light" },
          {
            type: "cards",
            kicker: "Por qué nosotros",
            title: "Contamos causas, no solo eventos.",
            tone: "dark",
            items: [
              { icon: "❦", t: "Narrativa emocional", d: "Sabemos convertir una jornada en una historia que se siente y se recuerda." },
              { icon: "⚡", t: "Agilidad en campo", d: "Equipo compacto y resolutivo, cómodo en territorio y en condiciones exigentes." },
              { icon: "◈", t: "Calidad cinematográfica", d: "Cuidado de imagen, color y sonido a la altura de una marca premium." },
              { icon: "♥", t: "Compromiso con la causa", d: "Nos mueve el impacto y quienes lo hacen posible." },
            ],
          },
          {
            type: "cta",
            kicker: "Estamos listos",
            title: "¿Contamos juntos esta historia?",
            sub: `Nos encantaría acompañar a ${cliente} en esta jornada. Quedamos atentos a sus comentarios.`,
            btn: "Hablemos",
            email: BRAND_DEFAULT.email,
            tone: "dark",
          },
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
