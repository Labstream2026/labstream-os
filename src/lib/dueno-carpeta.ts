import "server-only";
import { db } from "@/lib/db";

// ── De qué cliente es una carpeta, mirando solo su nombre ─────────────────────
//
// En el disco de entregas el vínculo cliente↔carpeta es explícito (Client.galeriaFolder) y no
// hace falta adivinar. En Operaciones_LAB no existe ese vínculo, pero el equipo NOMBRA las
// carpetas como a sus clientes («Danney», «David Reyes»…), y reconocerlas ordena la pantalla
// igual que en el disco de entregas: por el color, sin leer.
//
// La regla es deliberadamente estricta, porque un color mal puesto es peor que ninguno:
//
//   · Se compara por PALABRAS normalizadas (sin tildes, sin títulos): todas las palabras de la
//     carpeta tienen que estar en el nombre del cliente. «Danney» ⊆ «DRA. DANNEY GOMEZ» ✓;
//     «Camilo Ortega Anuncios» ⊄ «CAMILO ORTEGA» ✗ (le sobra una palabra: no se pinta).
//   · Al menos una palabra con cuerpo (≥4 letras): que «Ana» no se cuelgue de cualquiera.
//   · Si DOS clientes encajan, no se pinta ninguno: ambiguo es ambiguo.

export type DuenoCarpeta = { id: string; nombre: string; color: string | null };

const TITULOS = new Set(["dr", "dra", "doctor", "doctora", "sr", "sra", "srta"]);

function palabras(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !TITULOS.has(w));
}

export async function duenosPorNombre(carpetas: { rel: string; name: string }[]): Promise<Record<string, DuenoCarpeta>> {
  const out: Record<string, DuenoCarpeta> = {};
  if (carpetas.length === 0) return out;
  const clientes = await db.client
    .findMany({ select: { id: true, name: true, accentColor: true } })
    .catch(() => [] as { id: string; name: string; accentColor: string | null }[]);
  if (clientes.length === 0) return out;

  const indice = clientes.map((c) => ({ c, del: new Set(palabras(c.name)) }));
  for (const carpeta of carpetas) {
    const p = palabras(carpeta.name);
    if (p.length === 0 || !p.some((w) => w.length >= 4)) continue;
    const candidatos = indice.filter(({ del }) => p.every((w) => del.has(w)));
    if (candidatos.length !== 1) continue; // sin dueño claro: mejor sin color que mal puesto
    const { c } = candidatos[0];
    out[carpeta.rel] = { id: c.id, nombre: c.name, color: c.accentColor };
  }
  return out;
}
