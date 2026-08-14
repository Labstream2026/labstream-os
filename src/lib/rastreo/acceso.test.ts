import { describe, expect, it } from "vitest";
import { filtroSujetos, type AccesoRastreo } from "./acceso";

// El filtro es la última línea entre el dato personal del equipo y quien no debe verlo: si se
// equivoca hacia el lado flojo, un `where` vacío enseña a TODO el mundo. Estas pruebas fijan
// justamente eso — que «no puede» y «no le compartieron nada» devuelvan null (corta antes de
// ir a la base) y que solo el acceso de gestión produzca el filtro abierto.

const acc = (p: Partial<AccesoRastreo>): AccesoRastreo => ({ puede: false, gestiona: false, sujetos: [], ...p });

describe("filtroSujetos", () => {
  it("no deja pasar a quien no puede", () => {
    expect(filtroSujetos(acc({ puede: false, sujetos: null }))).toBeNull();
    expect(filtroSujetos(acc({ puede: false, sujetos: ["u1"] }))).toBeNull();
  });

  it("quien gestiona ve a todos (filtro abierto)", () => {
    expect(filtroSujetos(acc({ puede: true, gestiona: true, sujetos: null }))).toEqual({});
  });

  it("con compartición solo ve a los suyos", () => {
    expect(filtroSujetos(acc({ puede: true, sujetos: ["u1", "u2"] }))).toEqual({ userId: { in: ["u1", "u2"] } });
  });

  it("una lista vacía corta en vez de abrirse", () => {
    // El caso peligroso: `{ userId: { in: [] } }` sería inofensivo en Prisma, pero un `{}` por
    // descuido enseñaría a todo el equipo. Devolver null obliga a quien llama a parar.
    expect(filtroSujetos(acc({ puede: true, sujetos: [] }))).toBeNull();
  });
});
