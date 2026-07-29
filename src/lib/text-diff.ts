// Comparación de dos textos LÍNEA A LÍNEA, para ver qué cambió entre dos versiones de una
// página de la Wiki. Sin dependencias: es el algoritmo clásico de subsecuencia común más
// larga (LCS), que es lo que usa `diff` de toda la vida.
//
// El coste es O(n·m) en memoria, así que para textos muy largos se recorta: comparar dos
// documentos de 5.000 líneas costaría 25 millones de celdas y no merece la pena para lo que
// se usa (avisar de qué se tocó). Pasado el tope se informa del cambio sin detallarlo.

export type DiffLinea = { tipo: "igual" | "mas" | "menos"; texto: string };
export type Diff = { lineas: DiffLinea[]; anadidas: number; quitadas: number; truncado: boolean };

const MAX_LINEAS = 1200;

export function diffLineas(antes: string, despues: string): Diff {
  const a = (antes ?? "").replace(/\r\n/g, "\n").split("\n");
  const b = (despues ?? "").replace(/\r\n/g, "\n").split("\n");

  if (a.length > MAX_LINEAS || b.length > MAX_LINEAS) {
    return {
      lineas: [],
      anadidas: Math.max(0, b.length - a.length),
      quitadas: Math.max(0, a.length - b.length),
      truncado: true,
    };
  }

  // Tabla de longitudes de la subsecuencia común más larga.
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const lineas: DiffLinea[] = [];
  let anadidas = 0;
  let quitadas = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lineas.push({ tipo: "igual", texto: a[i] });
      i++; j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lineas.push({ tipo: "menos", texto: a[i] });
      quitadas++; i++;
    } else {
      lineas.push({ tipo: "mas", texto: b[j] });
      anadidas++; j++;
    }
  }
  while (i < n) { lineas.push({ tipo: "menos", texto: a[i++] }); quitadas++; }
  while (j < m) { lineas.push({ tipo: "mas", texto: b[j++] }); anadidas++; }

  return { lineas, anadidas, quitadas, truncado: false };
}

/**
 * Solo los tramos que cambiaron, con unas pocas líneas de contexto alrededor. Un historial
 * que enseñe el documento entero para señalar una coma no sirve de nada.
 * Devuelve bloques ya separados: entre uno y otro hay texto sin cambios que se omite.
 */
export function diffCompacto(d: Diff, contexto = 2): DiffLinea[][] {
  if (d.truncado || !d.lineas.length) return [];
  const marcadas = d.lineas.map((l) => l.tipo !== "igual");
  const conservar = new Set<number>();
  marcadas.forEach((cambia, idx) => {
    if (!cambia) return;
    for (let k = Math.max(0, idx - contexto); k <= Math.min(d.lineas.length - 1, idx + contexto); k++) conservar.add(k);
  });

  const bloques: DiffLinea[][] = [];
  let actual: DiffLinea[] = [];
  let previo = -2;
  for (const idx of [...conservar].sort((x, y) => x - y)) {
    if (idx !== previo + 1 && actual.length) { bloques.push(actual); actual = []; }
    actual.push(d.lineas[idx]);
    previo = idx;
  }
  if (actual.length) bloques.push(actual);
  return bloques;
}
