import { describe, expect, it } from "vitest";
import { repartirCierre, casaProyecto, type TareaCierre } from "./reparto";

// El reparto del cierre del día: las pistas del sensor (proyecto de edición, cuenta del
// cliente) se convierten en sugerencias explicadas. La persona corrige; esto solo propone.

const H = 3600;
const nombres = new Map([
  ["c1", "Bancolombia"],
  ["c2", "Mi Páramo"],
]);

const tarea = (over: Partial<TareaCierre> & { id: string }): TareaCierre => ({
  clientId: null,
  proyectoNombre: null,
  completadaHoy: false,
  venceMs: null,
  ...over,
});

describe("casaProyecto", () => {
  it("contención en ambos sentidos, sin tildes ni mayúsculas", () => {
    expect(casaProyecto("Reel Agosto", "reel agosto — Bancolombia")).toBe(true);
    expect(casaProyecto("Café Don José", "cafe don jose")).toBe(true);
    expect(casaProyecto("Reel Agosto", "Documental Páramo")).toBe(false);
  });
  it("nombres cortos solo casan por igualdad exacta (evita falsos positivos)", () => {
    expect(casaProyecto("Ad", "Adiós Nonino")).toBe(false);
    expect(casaProyecto("ad", "AD")).toBe(true);
  });
  it("sin proyecto no casa", () => {
    expect(casaProyecto("Reel", null)).toBe(false);
  });
});

describe("repartirCierre", () => {
  it("la pista de edición manda la plata a la tarea de ese proyecto, con motivo", () => {
    const s = repartirCierre({
      restanteMin: 300,
      cuentas: [{ clientId: "c1", seg: 4 * H }],
      edicion: [{ proyecto: "Reel Agosto", seg: 3 * H }],
      tareas: [
        tarea({ id: "t1", clientId: "c1", proyectoNombre: "Reel Agosto" }),
        tarea({ id: "t2", clientId: "c1", proyectoNombre: "Otro" }),
      ],
      nombreCliente: nombres,
    });
    const t1 = s.find((x) => x.taskId === "t1")!;
    expect(t1.motivo).toContain("Reel Agosto");
    expect(t1.motivo).toContain("editor");
    // La hora restante de la cuenta (4h − 3h de edición) cae en la mejor tarea del cliente.
    const total = s.reduce((n, x) => n + x.minutos, 0);
    expect(total).toBeLessThanOrEqual(300);
    expect(total).toBeGreaterThanOrEqual(230); // ~4h escaladas a 5h restantes → sin recorte drástico
  });

  it("la edición NO se cuenta dos veces: se descuenta de la cuenta del cliente", () => {
    const s = repartirCierre({
      restanteMin: 600, // holgado: sin escalar
      cuentas: [{ clientId: "c1", seg: 3 * H }],
      edicion: [{ proyecto: "Reel", seg: 3 * H }], // TODO el tiempo del cliente fue edición
      tareas: [
        tarea({ id: "t1", clientId: "c1", proyectoNombre: "Reel" }),
        tarea({ id: "t2", clientId: "c1" }),
      ],
      nombreCliente: nombres,
    });
    // t1 se lleva las 3 h de edición; a t2 no le queda nada de la cuenta (3−3=0).
    expect(s.find((x) => x.taskId === "t1")?.minutos).toBe(180);
    expect(s.find((x) => x.taskId === "t2")).toBeUndefined();
  });

  it("dentro de un cliente gana la tarea completada hoy; si no hay, la de entrega más próxima", () => {
    const s = repartirCierre({
      restanteMin: 480,
      cuentas: [{ clientId: "c2", seg: 2 * H }],
      edicion: [],
      tareas: [
        tarea({ id: "lejos", clientId: "c2", venceMs: 2000 }),
        tarea({ id: "hecha", clientId: "c2", completadaHoy: true, venceMs: 9000 }),
        tarea({ id: "cerca", clientId: "c2", venceMs: 1000 }),
      ],
      nombreCliente: nombres,
    });
    expect(s[0].taskId).toBe("hecha");
    expect(s[0].motivo).toContain("Mi Páramo");
  });

  it("el tiempo «Sin atribuir» no genera sugerencia: lo decide la persona", () => {
    const s = repartirCierre({
      restanteMin: 300,
      cuentas: [{ clientId: null, seg: 5 * H }],
      edicion: [],
      tareas: [tarea({ id: "t1", clientId: "c1" })],
      nombreCliente: nombres,
    });
    expect(s).toEqual([]);
  });

  it("si lo atribuido supera lo que falta, escala a proporción y respeta el tope", () => {
    const s = repartirCierre({
      restanteMin: 60, // solo falta 1 h por anotar
      cuentas: [
        { clientId: "c1", seg: 3 * H },
        { clientId: "c2", seg: 1 * H },
      ],
      edicion: [],
      tareas: [tarea({ id: "t1", clientId: "c1" }), tarea({ id: "t2", clientId: "c2" })],
      nombreCliente: nombres,
    });
    const total = s.reduce((n, x) => n + x.minutos, 0);
    expect(total).toBeLessThanOrEqual(60);
    // Proporción 3:1 → 45/15.
    expect(s.find((x) => x.taskId === "t1")?.minutos).toBe(45);
    expect(s.find((x) => x.taskId === "t2")?.minutos).toBe(15);
  });

  it("bloques de 5 min: nada de sugerencias de 7 minutos", () => {
    const s = repartirCierre({
      restanteMin: 480,
      cuentas: [{ clientId: "c1", seg: 437 }], // 7,3 min
      edicion: [],
      tareas: [tarea({ id: "t1", clientId: "c1" })],
      nombreCliente: nombres,
    });
    expect(s.every((x) => x.minutos % 5 === 0)).toBe(true);
  });

  it("sin restante o sin tareas, no hay nada que sugerir", () => {
    expect(repartirCierre({ restanteMin: 0, cuentas: [{ clientId: "c1", seg: H }], edicion: [], tareas: [tarea({ id: "t" })], nombreCliente: nombres })).toEqual([]);
    expect(repartirCierre({ restanteMin: 60, cuentas: [{ clientId: "c1", seg: H }], edicion: [], tareas: [], nombreCliente: nombres })).toEqual([]);
  });
});
