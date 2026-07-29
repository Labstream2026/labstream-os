// Árbol de páginas de la Wiki. El modelo YA tenía `parentId`/`children` desde el
// principio, pero nunca hubo interfaz que lo usara: todo se veía como una lista plana.
// Aquí se arma la jerarquía a partir de las páginas en crudo.
//
// Regla: una página SIN madre cuelga de su sección (categoría plana), y una página CON
// madre cuelga de ella, aunque la madre esté en otra sección — manda el parentesco, que
// es lo que el equipo decidió a mano.

export type WikiNodeInput = {
  id: string;
  title: string;
  icon: string | null;
  section: string | null;
  parentId: string | null;
  updatedAt: Date;
};

export type WikiNode = {
  id: string;
  title: string;
  icon: string | null;
  hijos: WikiNode[];
};

export type WikiGroup = { section: string; paginas: WikiNode[] };

// Profundidad máxima que se pinta. Más allá el sangrado deja de ayudar y la barra se
// vuelve ilegible; además acota el coste de un ciclo accidental en los datos.
export const WIKI_TREE_MAX_DEPTH = 4;

/**
 * Agrupa por sección y anida por parentesco. Es tolerante con datos torcidos:
 * - una madre que no existe (o que no se puede ver) → la hija sube a su sección;
 * - un ciclo (A madre de B y B madre de A) → se corta y ambas suben a su sección,
 *   así la barra nunca entra en bucle ni desaparece.
 */
export function buildWikiTree(pages: WikiNodeInput[], sectionOrder: readonly string[], otras = "Otras páginas"): WikiGroup[] {
  const porId = new Map(pages.map((p) => [p.id, p]));
  const hijosDe = new Map<string, WikiNodeInput[]>();
  const raices: WikiNodeInput[] = [];

  // ¿La cadena de madres de `p` llega a una raíz sin repetirse? Si no, es un ciclo.
  const cadenaSana = (p: WikiNodeInput): boolean => {
    const vistos = new Set<string>([p.id]);
    let cur = p.parentId ? porId.get(p.parentId) : undefined;
    let saltos = 0;
    while (cur) {
      if (vistos.has(cur.id) || saltos++ > WIKI_TREE_MAX_DEPTH * 4) return false;
      vistos.add(cur.id);
      cur = cur.parentId ? porId.get(cur.parentId) : undefined;
    }
    return true;
  };

  for (const p of pages) {
    const madre = p.parentId ? porId.get(p.parentId) : undefined;
    if (madre && cadenaSana(p)) {
      (hijosDe.get(madre.id) ?? hijosDe.set(madre.id, []).get(madre.id)!).push(p);
    } else {
      raices.push(p);
    }
  }

  const orden = (a: WikiNodeInput, b: WikiNodeInput) => a.title.localeCompare(b.title, "es", { sensitivity: "base" });

  const nodo = (p: WikiNodeInput, depth: number): WikiNode => ({
    id: p.id,
    title: p.title,
    icon: p.icon,
    hijos: depth >= WIKI_TREE_MAX_DEPTH ? [] : [...(hijosDe.get(p.id) ?? [])].sort(orden).map((h) => nodo(h, depth + 1)),
  });

  const porSeccion = new Map<string, WikiNodeInput[]>();
  for (const p of raices) {
    const key = p.section && sectionOrder.includes(p.section) ? p.section : otras;
    (porSeccion.get(key) ?? porSeccion.set(key, []).get(key)!).push(p);
  }

  const secciones = [...sectionOrder.filter((s) => porSeccion.has(s)), ...(porSeccion.has(otras) ? [otras] : [])];
  return secciones.map((section) => ({
    section,
    paginas: [...(porSeccion.get(section) ?? [])].sort(orden).map((p) => nodo(p, 1)),
  }));
}

/** Ruta desde la raíz hasta `id` (migas de pan). Vacía si no existe. */
export function wikiBreadcrumb(pages: WikiNodeInput[], id: string): WikiNodeInput[] {
  const porId = new Map(pages.map((p) => [p.id, p]));
  const out: WikiNodeInput[] = [];
  const vistos = new Set<string>();
  let cur = porId.get(id);
  while (cur && !vistos.has(cur.id)) {
    vistos.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? porId.get(cur.parentId) : undefined;
  }
  return out;
}

/**
 * Ids que NO pueden ser madre de `id`: ella misma y toda su descendencia (si no, se
 * crearía un ciclo y la página desaparecería del árbol).
 */
export function wikiDescendants(pages: WikiNodeInput[], id: string): Set<string> {
  const hijosDe = new Map<string, string[]>();
  for (const p of pages) {
    if (!p.parentId) continue;
    (hijosDe.get(p.parentId) ?? hijosDe.set(p.parentId, []).get(p.parentId)!).push(p.id);
  }
  const out = new Set<string>([id]);
  const pila = [id];
  while (pila.length) {
    for (const h of hijosDe.get(pila.pop()!) ?? []) {
      if (out.has(h)) continue; // datos con ciclo: no volver a entrar
      out.add(h);
      pila.push(h);
    }
  }
  return out;
}
