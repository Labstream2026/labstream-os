// ── Las casillas de una nota ──
// En una nota, «- [ ] llamar al cliente» es una tarea pendiente y «- [x] …» una hecha.
// Aquí vive TODO lo que hay que saber sobre esas líneas: encontrarlas, contarlas y
// marcarlas. Son funciones puras (texto → texto) para poder probarlas sin navegador; el
// editor de notas y el render de Markdown solo las llaman.
//
// El índice de línea es el mismo que usa `renderMarkdown(..., { interactiveTasks: true })`
// en `data-md-task`: la posición dentro de `content.split("\n")`.

const TASK_RE = /^(\s*[-*+]\s+)\[( |x|X)\](\s+)(.*)$/;

export type NoteTaskLine = { line: number; text: string; done: boolean };

// Clave con la que una TAREA recuerda de qué línea nació. Es el texto, no el número de
// línea: así el vínculo sobrevive a que la nota se reordene o se le añadan renglones
// arriba. La usan por igual el servidor (al crear/reencontrar) y el render de la nota.
export function noteTaskKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 300);
}

// Todas las líneas de tarea de la nota, en orden.
export function noteTaskLines(content: string): NoteTaskLine[] {
  const out: NoteTaskLine[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = TASK_RE.exec(lines[i]);
    if (m) out.push({ line: i, text: m[4].trim(), done: m[2].toLowerCase() === "x" });
  }
  return out;
}

// Cuántas hechas de cuántas. `total: 0` = la nota no tiene casillas (no se muestra contador).
export function countNoteTasks(content: string): { done: number; total: number } {
  const rows = noteTaskLines(content);
  return { done: rows.filter((r) => r.done).length, total: rows.length };
}

// Marca o desmarca la casilla de una línea. Si esa línea no es una tarea, devuelve el texto
// tal cual (nunca corrompe la nota por un clic en el sitio equivocado).
export function toggleNoteTask(content: string, line: number, force?: boolean): string {
  const src = content.replace(/\r\n/g, "\n");
  const lines = src.split("\n");
  if (line < 0 || line >= lines.length) return content;
  const m = TASK_RE.exec(lines[line]);
  if (!m) return content;
  const done = m[2].toLowerCase() === "x";
  const next = force === undefined ? !done : force;
  if (next === done) return src;
  lines[line] = `${m[1]}[${next ? "x" : " "}]${m[3]}${m[4]}`;
  return lines.join("\n");
}

// Marca la casilla cuyo TEXTO coincide (para reflejar en la nota que su tarea se completó,
// aunque entretanto se hayan movido líneas). Compara sin may/min ni espacios de sobra.
export function toggleNoteTaskByText(content: string, text: string, done: boolean): string {
  const target = noteTaskKey(text);
  if (!target) return content;
  const hit = noteTaskLines(content).find((r) => noteTaskKey(r.text) === target);
  return hit ? toggleNoteTask(content, hit.line, done) : content;
}
