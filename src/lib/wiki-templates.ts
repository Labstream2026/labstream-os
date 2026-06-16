// Secciones y plantillas de la Wiki. La idea (basada en buenas prácticas de
// information architecture): el FORMATO encaja con el CONTENIDO y cada cosa vive en
// UN solo lugar (single source of truth). Las páginas son para conocimiento narrativo
// (procesos, políticas); las listas con campos repetidos van en TABLAS (Inventario,
// Ubicación); los archivos pesados, en la Biblioteca/NAS y se enlazan.

// Secciones sugeridas (categorías planas, máx. ~6 para no perderse).
export const WIKI_SECTIONS = [
  "Empieza aquí",
  "Cómo trabajamos",
  "Equipo y técnica",
  "Clientes y marcas",
  "Plantillas y recursos",
  "Administración",
] as const;
export type WikiSection = (typeof WIKI_SECTIONS)[number];

export type WikiTemplate = {
  key: string;
  name: string;
  icon: string;
  section: WikiSection;
  tags: string[];
  description: string;
  content: string;
};

export const WIKI_TEMPLATES: WikiTemplate[] = [
  {
    key: "blank",
    name: "Página en blanco",
    icon: "📄",
    section: "Cómo trabajamos",
    tags: [],
    description: "Empieza desde cero.",
    content: "",
  },
  {
    key: "sop",
    name: "Procedimiento (SOP)",
    icon: "🧭",
    section: "Cómo trabajamos",
    tags: ["proceso", "sop"],
    description: "Paso a paso de una tarea repetible (rodaje, entrega, backup…).",
    content: [
      "## Objetivo",
      "Qué logra este procedimiento y cuándo se usa.",
      "",
      "## Antes de empezar",
      "- Requisitos / accesos necesarios",
      "- Herramientas",
      "",
      "## Pasos",
      "1. Primer paso",
      "2. Segundo paso",
      "3. …",
      "",
      "## Checklist de cierre",
      "- [ ] Punto 1",
      "- [ ] Punto 2",
      "",
      "## Errores comunes",
      "- …",
    ].join("\n"),
  },
  {
    key: "policy",
    name: "Política interna",
    icon: "📜",
    section: "Administración",
    tags: ["política"],
    description: "Norma o acuerdo del equipo (vacaciones, uso de equipos, seguridad…).",
    content: [
      "## Resumen",
      "En una frase: qué regula esta política.",
      "",
      "## Alcance",
      "A quién aplica.",
      "",
      "## La política",
      "- Punto 1",
      "- Punto 2",
      "",
      "## Excepciones",
      "Cómo se piden y quién las aprueba.",
      "",
      "## Preguntas frecuentes",
      "**¿…?** …",
    ].join("\n"),
  },
  {
    key: "client",
    name: "Ficha / guía de marca de cliente",
    icon: "🏢",
    section: "Clientes y marcas",
    tags: ["cliente", "marca"],
    description: "Datos clave y lineamientos de marca de un cliente. (Los proyectos viven en /clientes.)",
    content: [
      "> La ficha operativa del cliente vive en **/clientes** — enlázala, no la dupliques.",
      "",
      "## Contactos clave",
      "- Nombre · cargo · correo · teléfono",
      "",
      "## Lineamientos de marca",
      "- **Logos:** (enlace a la Biblioteca)",
      "- **Colores:** #…",
      "- **Tipografías:**",
      "- **Tono / qué evitar:**",
      "",
      "## Especificaciones de entrega",
      "- Formato, resolución, codec, relación de aspecto",
      "- Dónde se entrega",
      "",
      "## Notas",
      "- …",
    ].join("\n"),
  },
  {
    key: "tech",
    name: "Especificaciones técnicas",
    icon: "🎛️",
    section: "Equipo y técnica",
    tags: ["técnica", "specs"],
    description: "Ajustes y estándares técnicos (cámara, LUTs, formatos de entrega).",
    content: [
      "## Estándar",
      "Para qué sirve y cuándo aplicarlo.",
      "",
      "## Ajustes",
      "| Parámetro | Valor |",
      "| --- | --- |",
      "| … | … |",
      "",
      "## Notas",
      "- Enlaces a presets/LUTs en la Biblioteca",
    ].join("\n"),
  },
  {
    key: "onboarding",
    name: "Empieza aquí / Onboarding",
    icon: "👋",
    section: "Empieza aquí",
    tags: ["onboarding"],
    description: "Página índice para que alguien nuevo sepa por dónde empezar.",
    content: [
      "# Bienvenida al equipo 👋",
      "Esta wiki tiene toda la información de la empresa. Empieza por aquí.",
      "",
      "## Tus accesos",
      "- Cómo entrar (SSO), correo, calendario, NAS",
      "",
      "## Cómo trabajamos",
      "- Flujo de producción (enlaza la página de proceso)",
      "- Convenciones de nombres de archivos",
      "",
      "## Dónde está cada cosa",
      "- **Inventario y ubicación del material** → pestañas de la Wiki",
      "- **Plantillas y recursos** → sección Plantillas",
      "- **Contraseñas** → pestaña de la Wiki (cifradas)",
      "",
      "## A quién preguntar",
      "- …",
    ].join("\n"),
  },
];

export function wikiTemplate(key: string | null | undefined): WikiTemplate | undefined {
  return WIKI_TEMPLATES.find((t) => t.key === key);
}

// Días tras los cuales una página se considera "para revisar" si nadie la ha
// revisado (o se revisó hace mucho). Gobernanza ligera contra el contenido obsoleto.
export const WIKI_REVIEW_STALE_DAYS = 120;
