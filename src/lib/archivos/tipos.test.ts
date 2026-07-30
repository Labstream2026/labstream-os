import { describe, expect, it } from "vitest";
import { resumenArchivos, viveEnLaApp, type ArchivoItem } from "./tipos";

const base: ArchivoItem = {
  id: "1", name: "a.pdf", kind: "LOCAL", url: null, path: null, size: 10,
  createdAt: "2026-07-01T10:00:00.000Z", updatedAt: "2026-07-01T10:00:00.000Z",
  autor: null, pinned: false, version: 1, editable: false, viaClientLink: false,
};
const f = (over: Partial<ArchivoItem>): ArchivoItem => ({ ...base, ...over });

describe("resumenArchivos", () => {
  it("el total incluye TODO lo que el panel va a pintar, marca incluida", () => {
    // Es el fallo que arregla: la pastilla contaba 8 y la cabecera 7 porque una excluía la marca.
    const r = resumenArchivos([f({ id: "1" }), f({ id: "2", esMarca: true })]);
    expect(r.total).toBe(2);
    expect(r.deMarca).toBe(1);
  });

  it("cuenta proyectos distintos, no archivos", () => {
    const p = { id: "p1", name: "Uno", emoji: null };
    const r = resumenArchivos([f({ id: "1", proyecto: p }), f({ id: "2", proyecto: p }), f({ id: "3", proyecto: { id: "p2", name: "Dos", emoji: null } })]);
    expect(r.proyectos).toBe(2);
  });

  it("el último es la actividad MÁS reciente, no la primera de la lista", () => {
    const r = resumenArchivos([
      f({ id: "1", updatedAt: "2026-07-01T00:00:00.000Z" }),
      f({ id: "2", updatedAt: "2026-07-20T00:00:00.000Z" }),
      f({ id: "3", updatedAt: "2026-07-10T00:00:00.000Z" }),
    ]);
    expect(r.ultimo).toBe("2026-07-20T00:00:00.000Z");
  });

  it("lista vacía no revienta", () => {
    expect(resumenArchivos([])).toEqual({ total: 0, deMarca: 0, proyectos: 0, ultimo: null });
  });
});

describe("viveEnLaApp", () => {
  it("los documentos editables de Office se quedan en la app", () => {
    for (const n of ["Guion.docx", "Presupuesto.xlsx", "Pitch.pptx", "notas.odt"]) {
      expect(viveEnLaApp({ name: n, kind: "LOCAL" })).toBe(true);
    }
  });

  it("el material NO lleva distintivo: va al NAS como todo lo demás", () => {
    for (const n of ["brief.pdf", "master.mov", "foto.jpg"]) {
      expect(viveEnLaApp({ name: n, kind: "LOCAL" })).toBe(false);
    }
  });

  it("un .docx que YA vive en el disco compartido no se marca", () => {
    // kind OPS = archivo vivo en la carpeta del NAS: ahí sí está fuera de la app.
    expect(viveEnLaApp({ name: "Guion.docx", kind: "OPS" })).toBe(false);
  });

  it("un enlace a un Google Doc no es un archivo de la app", () => {
    expect(viveEnLaApp({ name: "Guion.docx", kind: "DRIVE" })).toBe(false);
  });
});
