// ── Proyectos de EDICIÓN: qué proyecto está abierto en Resolve/Premiere/After Effects ──
//
// Igual que la navegación: CERO captura nueva. Los programas de edición ponen el proyecto en
// el título de la ventana —Resolve «Dermakind agosto - DaVinci Resolve», Premiere la ruta del
// .prproj, After Effects el .aep— y el sensor lo guarda desde la fase 1 (es la base de la
// atribución a clientes). Aquí solo se EXTRAE el nombre para responder «¿en qué proyecto está
// trabajando cada quien, y en qué programa?».
//
// Lo que no se reconoce con certeza se descarta (null): mejor un proyecto de menos que una
// etiqueta inventada. La pantalla de inicio de Premiere o el Project Manager de Resolve no
// son proyectos.

export type ProyectoEdicion = { proyecto: string; programa: string };

// La MISMA lista alimenta la consulta SQL de datos.ts (contains, insensible a mayúsculas).
export const APPS_EDICION = ["Resolve", "Premiere", "After Effects"];

export function programaEdicion(app: string): string | null {
  const a = app.toLowerCase();
  if (a.includes("resolve")) return "Resolve";
  if (a.includes("premiere")) return "Premiere";
  if (a.includes("after effects")) return "After Effects";
  return null;
}

const MAX_NOMBRE = 60;

export function proyectoEdicionDe(app: string, titulo: string): ProyectoEdicion | null {
  const programa = programaEdicion(app);
  if (!programa) return null;
  const t = titulo.trim();
  if (!t) return null;

  let proyecto: string | null = null;
  if (programa === "Resolve") {
    // Observado: «<proyecto> - DaVinci Resolve» (a veces con versión). También se acepta la
    // forma invertida «DaVinci Resolve - <proyecto>» por si otra versión la usa.
    const sufijo = t.match(/^(.+?)\s*[-–—]\s*davinci resolve\b/i);
    const prefijo = t.match(/^davinci resolve[^-–—]*[-–—]\s*(.+)$/i);
    proyecto = sufijo?.[1] ?? prefijo?.[1] ?? null;
    // Las ventanas que no son un proyecto abierto: el gestor y la ventana pelada.
    if (proyecto && /^(project manager|gestor de proyectos)$/i.test(proyecto.trim())) proyecto = null;
    if (!proyecto && /^davinci resolve\b/i.test(t)) return null;
  } else {
    // Premiere / After Effects: el proyecto es el ARCHIVO del título (puede venir con ruta
    // completa y con «*» de cambios sin guardar). Sin archivo (pantalla de inicio) no hay
    // proyecto.
    const m = t.match(/([^\\/]+?)\.(prproj|aep|aepx)\b/i);
    proyecto = m ? m[1] : null;
  }

  if (!proyecto) return null;
  const limpio = proyecto.replace(/\*+\s*$/, "").replace(/\s+/g, " ").trim().slice(0, MAX_NOMBRE);
  return limpio ? { proyecto: limpio, programa } : null;
}
