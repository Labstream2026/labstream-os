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
  stage?: string; // fase/columna del tablero (debe existir en content.stages)
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

export type ColumnType =
  | "TEXT" | "NUMBER" | "SELECT" | "DATE" | "PERSON" | "CHECKBOX" | "URL" | "EVENT";

export type TemplateColumn = {
  name: string;
  type: ColumnType;
  options?: { id: string; label: string; color: string }[]; // solo SELECT
};

// Tablero colaborativo especializado (estilo Notion) que se crea con el proyecto.
export type TemplateTable = {
  name: string;
  description?: string;
  columns: TemplateColumn[];
  rows?: number; // filas vacías iniciales
};

export type TemplateContent = {
  stages: string[];
  folders: string[];
  tasks: TemplateTask[];
  deliverables: TemplateDeliverable[];
  tables?: TemplateTable[];
};

// ── Tableros especializados reutilizables para producción audiovisual ──
const sel = (...labels: [string, string][]): { id: string; label: string; color: string }[] =>
  labels.map(([label, color], i) => ({ id: `o${i}`, label, color }));

export const SPECIAL_TABLES: Record<string, TemplateTable> = {
  planRodaje: {
    name: "Plan de rodaje",
    description: "Escenas, locaciones y horarios del día de grabación.",
    columns: [
      { name: "Escena", type: "TEXT" },
      { name: "Locación", type: "TEXT" },
      { name: "Día / hora", type: "TEXT" },
      { name: "Estado", type: "SELECT", options: sel(["Pendiente", "slate"], ["Listo para grabar", "amber"], ["Grabado", "emerald"]) },
      { name: "Responsable", type: "PERSON" },
      { name: "Cita de rodaje", type: "EVENT" },
    ],
    rows: 4,
  },
  shotList: {
    name: "Shot list",
    description: "Lista de planos a grabar.",
    columns: [
      { name: "#", type: "TEXT" },
      { name: "Descripción del plano", type: "TEXT" },
      { name: "Tipo", type: "SELECT", options: sel(["Plano general", "blue"], ["Plano medio", "cyan"], ["Primer plano", "violet"], ["Detalle", "rose"]) },
      { name: "Movimiento", type: "SELECT", options: sel(["Fijo", "slate"], ["Paneo", "blue"], ["Travelling", "amber"], ["Dron", "emerald"]) },
      { name: "Duración", type: "TEXT" },
      { name: "Grabado", type: "CHECKBOX" },
    ],
    rows: 6,
  },
  broll: {
    name: "Lista de B-roll",
    description: "Tomas de recurso para la edición.",
    columns: [
      { name: "Descripción", type: "TEXT" },
      { name: "Locación", type: "TEXT" },
      { name: "Prioridad", type: "SELECT", options: sel(["Alta", "rose"], ["Media", "amber"], ["Baja", "slate"]) },
      { name: "Grabado", type: "CHECKBOX" },
    ],
    rows: 5,
  },
  callSheet: {
    name: "Llamados del equipo",
    description: "Quién va, su rol y a qué hora llega.",
    columns: [
      { name: "Persona", type: "PERSON" },
      { name: "Rol", type: "TEXT" },
      { name: "Contacto", type: "TEXT" },
      { name: "Llamado", type: "EVENT" },
    ],
    rows: 4,
  },
  invitados: {
    name: "Invitados",
    description: "Invitados del episodio y su confirmación.",
    columns: [
      { name: "Invitado", type: "TEXT" },
      { name: "Tema", type: "TEXT" },
      { name: "Confirmado", type: "SELECT", options: sel(["Por contactar", "slate"], ["Invitado", "amber"], ["Confirmado", "emerald"]) },
      { name: "Contacto", type: "TEXT" },
      { name: "Grabación", type: "EVENT" },
    ],
    rows: 3,
  },
  calendarioContenido: {
    name: "Calendario de contenido",
    description: "Piezas del mes, formato y fecha de publicación.",
    columns: [
      { name: "Pieza", type: "TEXT" },
      { name: "Formato", type: "SELECT", options: sel(["Reel", "violet"], ["Short", "cyan"], ["Carrusel", "amber"], ["Foto", "blue"]) },
      { name: "Estado", type: "SELECT", options: sel(["Idea", "slate"], ["Guion", "blue"], ["Grabado", "amber"], ["Editado", "violet"], ["Publicado", "emerald"]) },
      { name: "Responsable", type: "PERSON" },
      { name: "Publicación", type: "DATE" },
    ],
    rows: 8,
  },
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

// Wizard: preguntas al crear el proyecto desde plantilla. Cada paso apunta a una
// tarea (por título) y pide responsable y/o fecha, que se aplican tras crearlo.
export type WizardStep = {
  taskTitle: string; // debe coincidir con el título de una tarea de la plantilla
  askAssignee?: boolean;
  askDate?: boolean;
  dateLabel?: string;
};

export const WIZARDS: Record<string, WizardStep[]> = {
  "reel-medico": [
    { taskTitle: "Guion y storyboard", askAssignee: true },
    { taskTitle: "Grabación en locación", askAssignee: true, askDate: true, dateLabel: "Fecha de grabación" },
    { taskTitle: "Edición V1", askAssignee: true },
    { taskTitle: "Envío a cliente", askDate: true, dateLabel: "Fecha de entrega al cliente" },
  ],
  podcast: [
    { taskTitle: "Definir tema e invitado", askAssignee: true },
    { taskTitle: "Grabación del episodio", askAssignee: true, askDate: true, dateLabel: "Fecha de grabación" },
    { taskTitle: "Edición de audio y video", askAssignee: true },
    { taskTitle: "Publicación y distribución", askDate: true, dateLabel: "Fecha de publicación" },
  ],
  streaming: [
    { taskTitle: "Plan técnico y escaleta", askAssignee: true },
    { taskTitle: "Transmisión en vivo", askAssignee: true, askDate: true, dateLabel: "Fecha del evento" },
    { taskTitle: "Generar clips destacados", askAssignee: true },
  ],
  "video-institucional": [
    { taskTitle: "Guion técnico y literario", askAssignee: true },
    { taskTitle: "Grabación", askAssignee: true, askDate: true, dateLabel: "Fecha de rodaje" },
    { taskTitle: "Edición y color", askAssignee: true },
    { taskTitle: "Entrega de masters", askDate: true, dateLabel: "Fecha de entrega" },
  ],
  "campana-mensual": [
    { taskTitle: "Planeación de contenido del mes", askAssignee: true },
    { taskTitle: "Día de grabación", askAssignee: true, askDate: true, dateLabel: "Día de grabación" },
    { taskTitle: "Revisión del cliente", askDate: true, dateLabel: "Fecha de revisión" },
  ],
};

export function wizardFor(key: string): WizardStep[] {
  return WIZARDS[key] ?? [];
}

export const TEMPLATES: TemplateDef[] = [
  {
    key: "reel-medico",
    name: "Reel médico",
    emoji: "🩺",
    description: "Reel corto para clínicas y profesionales de salud.",
    type: "REEL",
    content: {
      stages: PROD_STAGES,
      folders: [],
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
      tables: [SPECIAL_TABLES.planRodaje, SPECIAL_TABLES.shotList, SPECIAL_TABLES.broll],
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
      folders: [],
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
      tables: [SPECIAL_TABLES.invitados, SPECIAL_TABLES.callSheet],
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
      folders: [],
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
      tables: [SPECIAL_TABLES.planRodaje, SPECIAL_TABLES.callSheet],
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
      folders: [],
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
      tables: [SPECIAL_TABLES.planRodaje, SPECIAL_TABLES.shotList, SPECIAL_TABLES.callSheet, SPECIAL_TABLES.broll],
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
      folders: [],
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
      tables: [SPECIAL_TABLES.calendarioContenido, SPECIAL_TABLES.planRodaje],
    },
  },
];
