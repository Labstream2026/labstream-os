import { describe, it, expect } from "vitest";
import { noteTaskLines, countNoteTasks, toggleNoteTask, toggleNoteTaskByText } from "./note-tasks";

const NOTA = [
  "Puntos del rodaje:",
  "",
  "- [ ] confirmar locación",
  "- [x] pedir permisos",
  "* [ ] llamar al DF jueves 7am",
  "",
  "Ojo con la batería del dron.",
].join("\n");

describe("noteTaskLines", () => {
  it("encuentra las casillas con su número de línea, texto y estado", () => {
    expect(noteTaskLines(NOTA)).toEqual([
      { line: 2, text: "confirmar locación", done: false },
      { line: 3, text: "pedir permisos", done: true },
      { line: 4, text: "llamar al DF jueves 7am", done: false },
    ]);
  });

  it("ignora las viñetas normales y el texto suelto", () => {
    expect(noteTaskLines("- una lista normal\ntexto suelto")).toEqual([]);
  });
});

describe("countNoteTasks", () => {
  it("cuenta hechas sobre el total", () => {
    expect(countNoteTasks(NOTA)).toEqual({ done: 1, total: 3 });
  });

  it("una nota sin casillas da total 0", () => {
    expect(countNoteTasks("solo texto")).toEqual({ done: 0, total: 0 });
  });
});

describe("toggleNoteTask", () => {
  it("marca una pendiente conservando la sangría y la viñeta", () => {
    const out = toggleNoteTask("  - [ ]   comprar cinta", 0);
    expect(out).toBe("  - [x]   comprar cinta");
  });

  it("desmarca una hecha", () => {
    expect(toggleNoteTask("- [X] listo", 0)).toBe("- [ ] listo");
  });

  it("no toca el resto de la nota", () => {
    const out = toggleNoteTask(NOTA, 2);
    expect(out.split("\n")[2]).toBe("- [x] confirmar locación");
    expect(out.split("\n")[3]).toBe("- [x] pedir permisos");
    expect(out.split("\n")[6]).toBe("Ojo con la batería del dron.");
  });

  it("una línea que no es tarea se devuelve intacta (clic en el sitio equivocado)", () => {
    expect(toggleNoteTask(NOTA, 0)).toBe(NOTA);
    expect(toggleNoteTask(NOTA, 99)).toBe(NOTA);
  });

  it("con `force` es idempotente", () => {
    const once = toggleNoteTask(NOTA, 2, true);
    expect(toggleNoteTask(once, 2, true)).toBe(once);
  });
});

describe("toggleNoteTaskByText", () => {
  it("marca la casilla por su texto aunque haya cambiado de línea", () => {
    const movida = "línea nueva arriba\n" + NOTA;
    const out = toggleNoteTaskByText(movida, "  Confirmar  Locación ", true);
    expect(out).toContain("- [x] confirmar locación");
  });

  it("si el texto ya no está, no cambia nada", () => {
    expect(toggleNoteTaskByText(NOTA, "algo que no existe", true)).toBe(NOTA);
  });
});
