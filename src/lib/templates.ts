// Estructura de carpetas sugerida (spec sección 11) y plantillas de proyecto (sección 5).
// Se usan tanto en el seed como al crear un proyecto desde plantilla (automatización v1).

export const DEFAULT_FOLDERS = [
  "01 Brief",
  "02 Guiones",
  "03 Producción",
  "04 Material bruto",
  "05 Edición",
  "06 Revisión",
  "07 Finales",
  "08 Facturación",
  "09 Recursos",
];

export type TemplateTask = {
  title: string;
  priority?: "BAJA" | "MEDIA" | "ALTA" | "URGENTE";
};

export type TemplateDeliverable = {
  name: string;
  type:
    | "REEL"
    | "SHORT"
    | "VIDEO_LARGO"
    | "FOTOGRAFIA"
    | "PODCAST"
    | "TEASER"
    | "DOCUMENTO"
    | "OTRO";
};

export type TemplateContent = {
  stages: string[];
  folders: string[];
  tasks: TemplateTask[];
  deliverables: TemplateDeliverable[];
};

export type TemplateDef = {
  key: string;
  name: string;
  emoji: string;
  description: string;
  type:
    | "REEL"
    | "PODCAST"
    | "DOCUMENTAL"
    | "STREAMING"
    | "CURSO"
    | "PUBLICIDAD"
    | "EVENTO"
    | "CORPORATIVO"
    | "INSTITUCIONAL"
    | "FOTOGRAFIA"
    | "CAMPANA_MENSUAL";
  content: TemplateContent;
};

const PROD_STAGES = ["Preproducción", "Producción", "Edición", "Revisión", "Entrega"];

export const TEMPLATES: TemplateDef[] = [
  {
    key: "reel-medico",
    name: "Reel médico",
    emoji: "🩺",
    description: "Reel corto para clínicas y profesionales de salud.",
    type: "REEL",
    content: {
      stages: PROD_STAGES,
      folders: DEFAULT_FOLDERS,
      tasks: [
        { title: "Brief con el cliente", priority: "ALTA" },
        { title: "Guion y storyboard" },
        { title: "Agendar grabación", priority: "ALTA" },
        { title: "Grabación en locación" },
        { title: "Selección de tomas" },
        { title: "Edición V1" },
        { title: "Revisión interna", priority: "MEDIA" },
        { title: "Envío a cliente" },
      ],
      deliverables: [
        { name: "Reel principal", type: "REEL" },
        { name: "Short vertical", type: "SHORT" },
        { name: "Set de fotografías", type: "FOTOGRAFIA" },
      ],
    },
  },
  {
    key: "podcast",
    name: "Podcast",
    emoji: "🎙️",
    description: "Episodio de podcast con cortes para redes.",
    type: "PODCAST",
    content: {
      stages: ["Preproducción", "Grabación", "Edición", "Publicación"],
      folders: DEFAULT_FOLDERS,
      tasks: [
        { title: "Definir tema e invitado", priority: "ALTA" },
        { title: "Preparar preguntas" },
        { title: "Montaje de set y audio" },
        { title: "Grabación del episodio", priority: "ALTA" },
        { title: "Edición de audio y video" },
        { title: "Cortes para redes" },
        { title: "Publicación y distribución" },
      ],
      deliverables: [
        { name: "Episodio completo", type: "VIDEO_LARGO" },
        { name: "3 cortes verticales", type: "SHORT" },
        { name: "Audio del episodio", type: "PODCAST" },
      ],
    },
  },
  {
    key: "streaming",
    name: "Streaming / Evento en vivo",
    emoji: "📡",
    description: "Transmisión en vivo multicámara.",
    type: "STREAMING",
    content: {
      stages: ["Preproducción", "Montaje técnico", "Transmisión", "Postevento"],
      folders: DEFAULT_FOLDERS,
      tasks: [
        { title: "Plan técnico y escaleta", priority: "ALTA" },
        { title: "Prueba de conectividad", priority: "URGENTE" },
        { title: "Montaje de cámaras y switcher" },
        { title: "Ensayo general" },
        { title: "Transmisión en vivo", priority: "URGENTE" },
        { title: "Exportar grabación maestra" },
        { title: "Generar clips destacados" },
      ],
      deliverables: [
        { name: "Grabación maestra", type: "VIDEO_LARGO" },
        { name: "Clips destacados", type: "SHORT" },
        { name: "Teaser del evento", type: "TEASER" },
      ],
    },
  },
  {
    key: "video-institucional",
    name: "Video institucional",
    emoji: "🏢",
    description: "Video corporativo para empresa o institución.",
    type: "INSTITUCIONAL",
    content: {
      stages: PROD_STAGES,
      folders: DEFAULT_FOLDERS,
      tasks: [
        { title: "Reunión de brief", priority: "ALTA" },
        { title: "Guion técnico y literario" },
        { title: "Casting y locaciones" },
        { title: "Plan de rodaje" },
        { title: "Grabación", priority: "ALTA" },
        { title: "Edición y color" },
        { title: "Musicalización" },
        { title: "Revisión interna" },
        { title: "Entrega de masters" },
      ],
      deliverables: [
        { name: "Video institucional master", type: "VIDEO_LARGO" },
        { name: "Versión 60s para redes", type: "SHORT" },
        { name: "Teaser", type: "TEASER" },
      ],
    },
  },
  {
    key: "campana-mensual",
    name: "Campaña mensual de contenido",
    emoji: "📅",
    description: "Paquete mensual de contenido para redes.",
    type: "CAMPANA_MENSUAL",
    content: {
      stages: ["Planeación", "Grabación", "Edición", "Publicación"],
      folders: DEFAULT_FOLDERS,
      tasks: [
        { title: "Planeación de contenido del mes", priority: "ALTA" },
        { title: "Día de grabación", priority: "ALTA" },
        { title: "Edición de 10 reels" },
        { title: "Edición de 4 shorts" },
        { title: "Diseño de carruseles" },
        { title: "Calendario de publicación" },
        { title: "Revisión del cliente" },
      ],
      deliverables: [
        { name: "10 reels", type: "REEL" },
        { name: "4 shorts", type: "SHORT" },
        { name: "Set de fotografías", type: "FOTOGRAFIA" },
      ],
    },
  },
];
