import { describe, expect, it } from "vitest";
import { acabaDeExcederse, estadoRonda, extrasDe } from "./rondas";

// Lo que se protege aquí es plata: si el contador se equivoca hacia abajo, el estudio regala
// rondas; si se equivoca hacia arriba, le reclama al cliente algo que sí estaba incluido. Las
// dos equivocaciones cuestan, así que los bordes van clavados.

describe("estadoRonda", () => {
  it("sin cambios pedidos no enseña nada", () => {
    // Un chip «Ronda 0 de 4» en cada pieza recién enviada sería ruido en toda la bandeja.
    expect(estadoRonda(0, 4).texto).toBeNull();
    expect(estadoRonda(0, null).texto).toBeNull();
  });

  it("sin tope pactado cuenta igual, pero sin techo", () => {
    const e = estadoRonda(3, null);
    expect(e.texto).toBe("Ronda 3");
    expect(e.extra).toBe(0);
    expect(e.tono).toBe("neutro");
  });

  it("dentro de lo pactado va tranquilo", () => {
    const e = estadoRonda(2, 4);
    expect(e.texto).toBe("Ronda 2 de 4");
    expect(e.tono).toBe("ok");
    expect(e.extra).toBe(0);
  });

  it("la ÚLTIMA incluida avisa, que es cuando aún se puede hablar con el cliente", () => {
    const e = estadoRonda(4, 4);
    expect(e.tono).toBe("aviso");
    expect(e.extra).toBe(0);
    expect(e.texto).toBe("Ronda 4 de 4");
  });

  it("pasarse una ronda ya es cobrable, en singular", () => {
    const e = estadoRonda(5, 4);
    expect(e.tono).toBe("excedido");
    expect(e.extra).toBe(1);
    expect(e.texto).toBe("Ronda 5 de 4 · 1 por cobrar");
  });

  it("y varias, en plural", () => {
    expect(estadoRonda(7, 4).texto).toBe("Ronda 7 de 4 · 3 por cobrar");
  });

  it("un tope de 0 o negativo se trata como «sin pactar», no como «cero rondas»", () => {
    // Si no, un proyecto mal configurado marcaría TODAS sus piezas como cobrables.
    expect(estadoRonda(2, 0).texto).toBe("Ronda 2");
    expect(estadoRonda(2, -3).texto).toBe("Ronda 2");
    expect(estadoRonda(2, 0).extra).toBe(0);
  });

  it("no inventa rondas negativas", () => {
    expect(estadoRonda(-5, 4).ronda).toBe(0);
    expect(estadoRonda(-5, 4).texto).toBeNull();
  });
});

describe("extrasDe", () => {
  it("suma solo lo que se pasó de su propio tope", () => {
    const extras = extrasDe([
      { rondas: 5, tope: 4 }, // 1
      { rondas: 2, tope: 4 }, // 0
      { rondas: 9, tope: 3 }, // 6
      { rondas: 8, tope: null }, // 0: sin tope no hay exceso que cobrar
    ]);
    expect(extras).toBe(7);
  });

  it("sin piezas, cero", () => {
    expect(extrasDe([])).toBe(0);
  });
});

describe("acabaDeExcederse", () => {
  it("es verdad SOLO en la ronda que cruza el tope", () => {
    expect(acabaDeExcederse(5, 4)).toBe(true);
    expect(acabaDeExcederse(6, 4)).toBe(false); // ya se avisó en la 5
    expect(acabaDeExcederse(4, 4)).toBe(false); // aún va dentro
  });

  it("sin tope no avisa nunca", () => {
    expect(acabaDeExcederse(9, null)).toBe(false);
  });
});
