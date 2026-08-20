// ── Identidad visual de un AUTOR en la sala de revisión ──
// Con varias personas corrigiendo el mismo video (Jaime, Juanse, el cliente…), el nombre en
// gris obligaba a leer corrección por corrección para saber de quién era cada una. Aquí cada
// autor recibe un color ESTABLE: se deriva del nombre con un hash, así que no se guarda nada
// en la base de datos y las correcciones viejas quedan coloreadas solas.
//
// La clave es el NOMBRE normalizado (no el userId): el equipo siempre firma con session.name,
// así que es estable; un cliente que escriba su nombre distinto en dos visitas («Juanse» vs
// «Juan Sebastián») contará como dos personas — limitación conocida y aceptada.
//
// La paleta esquiva a propósito los colores con SIGNIFICADO en la sala: verde/esmeralda
// (hecha), ámbar (pendiente), naranja (obligatoria) y rojo (errores). Cada tono trae dos
// versiones: `base` para fondos sólidos (sello con iniciales, texto blanco encima) y texto
// sobre claro; `claro` para texto y marcas sobre superficies oscuras (HUD, barra del player).

export type ColorAutor = { base: string; claro: string };

// Ordenada intercalando familias para que dos autores con hash vecino no caigan en
// tonos casi iguales (los azules/violetas van separados entre sí).
const PALETA: ColorAutor[] = [
  { base: "#2563eb", claro: "#60a5fa" }, // azul
  { base: "#db2777", claro: "#f472b6" }, // rosa
  { base: "#0891b2", claro: "#22d3ee" }, // cian
  { base: "#7c3aed", claro: "#a78bfa" }, // violeta
  { base: "#e11d48", claro: "#fb7185" }, // frambuesa
  { base: "#0284c7", claro: "#38bdf8" }, // celeste
  { base: "#a21caf", claro: "#e879f9" }, // púrpura
  { base: "#4f46e5", claro: "#818cf8" }, // índigo
];

// Clave de identidad: minúsculas, sin espacios sobrantes y en forma Unicode estable, para que
// «Jaime», «jaime» y «JAIME » sean la misma persona (y también la clave del filtro por autor).
export function claveDeAutor(nombre: string): string {
  return nombre.normalize("NFKC").trim().toLowerCase();
}

// djb2: hash chico, estable entre servidor y navegador (nada de Math.random ni de estado).
function hashDeTexto(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

export function colorDeAutor(nombre: string): ColorAutor {
  const clave = claveDeAutor(nombre);
  if (!clave) return PALETA[0];
  return PALETA[hashDeTexto(clave) % PALETA.length];
}

// Iniciales del sello: primera letra de las dos primeras palabras («Juan Sebastián» → JS),
// o las dos primeras letras si es una sola palabra («Jaime» → JA).
export function inicialesDeAutor(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  const primera = [...palabras[0]];
  if (palabras.length === 1) return primera.slice(0, 2).join("").toUpperCase();
  return (primera[0] + [...palabras[1]][0]).toUpperCase();
}
