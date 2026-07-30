import { db } from "@/lib/db";
import { listGaleriaFolders, normalizeGaleriaRel, type GaleriaFolder } from "@/lib/nas-galeria";

// ── La espina del árbol de la galería ──────────────────────────────────────────
// El panel lateral tiene que salir YA ABIERTO hasta donde estás: si se cargara por peticiones
// del navegador, cada visita empezaría con un árbol plegado que se despliega solo un instante
// después, y el sitio donde estás es justo lo que no puede parpadear.
//
// Así que el servidor manda solo los niveles que hacen falta para dibujar esa rama: la raíz y
// los hijos de cada tramo de la ruta actual. Son `profundidad + 1` lecturas de directorio, no
// el NAS entero — recorrer los 7 TB para pintar una barra lateral sería absurdo. Lo demás se
// pide al expandir (ver /api/galeria/carpetas).

export type NivelesArbol = Record<string, GaleriaFolder[]>;

// Claves: "" es la raíz; el resto, la ruta del padre. Un nivel que falta = «no leído todavía»,
// que es distinto de un nivel vacío (`[]` = leído y sin subcarpetas).
export async function espinaDelArbol(rel: string): Promise<NivelesArbol> {
  let norm = "";
  try {
    norm = normalizeGaleriaRel(rel || "");
  } catch {
    norm = "";
  }
  // Los padres de la ruta actual, de fuera hacia dentro, incluyendo la propia carpeta: al estar
  // en «Skincenter/Campaña abril» se leen la raíz, Skincenter y Campaña abril (para ver sus
  // subcarpetas ya desplegadas).
  const tramos = norm ? norm.split("/") : [];
  const padres = [""];
  for (let i = 0; i < tramos.length; i++) padres.push(tramos.slice(0, i + 1).join("/"));

  // En paralelo: sobre NFS cada lectura es un viaje de red y encadenarlas multiplica la espera.
  const leidos = await Promise.all(
    padres.map(async (p) => [p, await listGaleriaFolders(p).catch(() => [])] as const),
  );
  return Object.fromEntries(leidos);
}

// ── De quién es cada carpeta ───────────────────────────────────────────────────
// El punto de color de una rama es el del CLIENTE al que está vinculada, la misma paleta de su
// cabecera y sus proyectos. Se pide de una vez para TODAS las carpetas de la espina (una sola
// consulta), no carpeta por carpeta.

export type DuenoRama = { nombre: string; color: string | null };

export async function duenosDeRamas(niveles: NivelesArbol): Promise<Record<string, DuenoRama>> {
  const rels = Object.values(niveles).flatMap((fs) => fs.map((f) => f.rel));
  if (rels.length === 0) return {};
  const clientes = await db.client
    .findMany({
      where: { galeriaFolder: { in: rels } },
      select: { name: true, accentColor: true, galeriaFolder: true },
    })
    .catch(() => []);
  return Object.fromEntries(
    clientes.map((c) => [c.galeriaFolder as string, { nombre: c.name, color: c.accentColor }]),
  );
}
