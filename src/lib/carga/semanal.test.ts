import { describe, expect, it } from "vitest";
import { capacidadSemana, claveDia, diasHabiles, festivosDeVentana, lunesDe, repartirCarga, semanasDesde } from "./semanal";

// Lo que protegen estas pruebas: que el número de carga vuelva a significar algo. La tarjeta
// vieja mentía por construcción (sumaba dos meses de tareas contra una semana de capacidad);
// si alguien reintroduce ese error, esto cae.

// hoy = martes 18 de agosto de 2026 en Bogotá (15:00 UTC = 10:00 a. m. local).
const HOY = new Date("2026-08-18T15:00:00.000Z");
const SIN_FESTIVOS = new Set<string>();

const tarea = (min: number, ini: string | null, fin: string | null, quien = "u1", proyecto: string | null = "p1") => ({
  assigneeId: quien,
  projectId: proyecto,
  estimatedMinutes: min,
  startDate: ini ? new Date(`${ini}T12:00:00.000Z`) : null,
  dueDate: fin ? new Date(`${fin}T12:00:00.000Z`) : null,
});

describe("días de Bogotá", () => {
  it("un instante de la noche UTC sigue siendo el día ANTERIOR en Bogotá", () => {
    // 03:00 UTC del 19 = 10 p. m. del 18 en Bogotá. Sin esto, «vence hoy» caería en mañana.
    expect(claveDia(new Date("2026-08-19T03:00:00.000Z"))).toBe("2026-08-18");
  });

  it("lunesDe encuentra el lunes, y el lunes es su propio lunes", () => {
    expect(lunesDe("2026-08-18")).toBe("2026-08-17"); // martes → su lunes
    expect(lunesDe("2026-08-23")).toBe("2026-08-17"); // domingo cierra la semana del 17
    expect(lunesDe("2026-08-17")).toBe("2026-08-17");
  });

  it("semanasDesde arranca en la semana actual", () => {
    expect(semanasDesde(HOY, 4)).toEqual(["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"]);
  });

  it("diasHabiles salta fines de semana y festivos", () => {
    const dias = diasHabiles("2026-08-17", "2026-08-23", new Set(["2026-08-19"]));
    expect(dias).toEqual(["2026-08-17", "2026-08-18", "2026-08-20", "2026-08-21"]);
  });
});

describe("repartirCarga — las tres reglas", () => {
  it("1: una tarea se reparte entre sus días hábiles, no cae entera en hoy", () => {
    // 10 h del martes 18 al lunes 24: 5 días hábiles (18,19,20,21 | 24) → 2 h por día.
    const r = repartirCarga([tarea(600, "2026-08-18", "2026-08-24")], semanasDesde(HOY, 4), SIN_FESTIVOS, HOY);
    const u1 = r.get("u1")!;
    expect(Math.round(u1.get("2026-08-17")!.totalMin)).toBe(480); // 4 días de esta semana
    expect(Math.round(u1.get("2026-08-24")!.totalMin)).toBe(120); // 1 día de la siguiente
  });

  it("2: lo vencido cae ENTERO en la semana actual — el trabajo no hecho se amontona en el ahora", () => {
    const r = repartirCarga([tarea(300, "2026-08-03", "2026-08-07")], semanasDesde(HOY, 4), SIN_FESTIVOS, HOY);
    expect(r.get("u1")!.get("2026-08-17")!.totalMin).toBe(300);
    expect(r.get("u1")!.get("2026-08-24")).toBeUndefined();
  });

  it("de una tarea en curso solo se reparte lo que queda: de HOY a la entrega", () => {
    // Empezó la semana pasada, vence el jueves 20. Días restantes: 18, 19, 20 → tercios.
    const r = repartirCarga([tarea(300, "2026-08-10", "2026-08-20")], semanasDesde(HOY, 4), SIN_FESTIVOS, HOY);
    expect(Math.round(r.get("u1")!.get("2026-08-17")!.totalMin)).toBe(300);
  });

  it("un plazo de puro fin de semana pesa en la semana de su entrega, no desaparece", () => {
    const r = repartirCarga([tarea(240, "2026-08-22", "2026-08-23")], semanasDesde(HOY, 4), SIN_FESTIVOS, HOY);
    // El domingo 23 pertenece a la semana del lunes 17.
    expect(r.get("u1")!.get("2026-08-17")!.totalMin).toBe(240);
  });

  it("el desglose por proyecto suma lo mismo que el total", () => {
    const r = repartirCarga(
      [tarea(300, "2026-08-18", "2026-08-20", "u1", "pA"), tarea(120, "2026-08-18", "2026-08-20", "u1", "pB")],
      semanasDesde(HOY, 4),
      SIN_FESTIVOS,
      HOY,
    );
    const s = r.get("u1")!.get("2026-08-17")!;
    const porProyecto = [...s.porProyecto.values()].reduce((a, b) => a + b, 0);
    expect(Math.round(porProyecto)).toBe(Math.round(s.totalMin));
    expect(Math.round(s.porProyecto.get("pA")!)).toBe(300);
  });

  it("un festivo en mitad del plazo redistribuye a los días que sí se trabaja", () => {
    // Mié 19 festivo: 10 h entre mar, jue, vie → ~3,33 h/día y nada el miércoles.
    const r = repartirCarga([tarea(600, "2026-08-18", "2026-08-21")], semanasDesde(HOY, 4), new Set(["2026-08-19"]), HOY);
    expect(Math.round(r.get("u1")!.get("2026-08-17")!.totalMin)).toBe(600);
  });

  it("sin estimación o sin responsable no pesa nada", () => {
    const r = repartirCarga(
      [tarea(0, "2026-08-18", "2026-08-20"), { ...tarea(300, "2026-08-18", "2026-08-20"), assigneeId: "" }],
      semanasDesde(HOY, 4),
      SIN_FESTIVOS,
      HOY,
    );
    expect(r.size).toBe(0);
  });
});

describe("capacidadSemana — la regla 3", () => {
  it("una semana limpia es la nominal completa", () => {
    const c = capacidadSemana(40, "2026-08-17", SIN_FESTIVOS, [], "u1");
    expect(c.capacidadMin).toBe(2400);
    expect(c.festivos).toBe(0);
  });

  it("un lunes festivo convierte 40 h en 32", () => {
    const c = capacidadSemana(40, "2026-08-17", new Set(["2026-08-17"]), [], "u1");
    expect(c.capacidadMin).toBe(1920);
    expect(c.festivos).toBe(1);
  });

  it("un rodaje de día completo descuenta un día entero", () => {
    const c = capacidadSemana(40, "2026-08-17", SIN_FESTIVOS, [{ userId: "u1", start: new Date("2026-08-20T13:00:00.000Z"), end: null, allDay: true }], "u1");
    expect(c.capacidadMin).toBe(1920);
  });

  it("una cita con horas descuenta su duración, con techo de un día", () => {
    const dos = capacidadSemana(40, "2026-08-17", SIN_FESTIVOS, [{ userId: "u1", start: new Date("2026-08-20T14:00:00.000Z"), end: new Date("2026-08-20T16:00:00.000Z"), allDay: false }], "u1");
    expect(dos.capacidadMin).toBe(2280); // −2 h
    const larga = capacidadSemana(40, "2026-08-17", SIN_FESTIVOS, [{ userId: "u1", start: new Date("2026-08-20T00:00:00.000Z"), end: new Date("2026-08-22T00:00:00.000Z"), allDay: false }], "u1");
    expect(larga.capacidadMin).toBe(1920); // techo: un día, no 48 h
  });

  it("las citas de OTRA persona o en fin de semana no descuentan", () => {
    const c = capacidadSemana(40, "2026-08-17", SIN_FESTIVOS, [
      { userId: "u2", start: new Date("2026-08-20T14:00:00.000Z"), end: new Date("2026-08-20T18:00:00.000Z"), allDay: false },
      { userId: "u1", start: new Date("2026-08-22T14:00:00.000Z"), end: null, allDay: true }, // sábado
    ], "u1");
    expect(c.capacidadMin).toBe(2400);
  });

  it("media jornada: 20 h con festivo quedan en 16", () => {
    const c = capacidadSemana(20, "2026-08-17", new Set(["2026-08-17"]), [], "u1");
    expect(c.capacidadMin).toBe(1920 / 2 * 1); // 16 h = 960… calculado explícito abajo
    expect(c.capacidadMin).toBe(960);
  });

  it("nunca queda negativa por muchos descuentos que haya", () => {
    const eventos = Array.from({ length: 8 }, (_, i) => ({
      userId: "u1",
      start: new Date(`2026-08-${17 + (i % 5)}T13:00:00.000Z`),
      end: null,
      allDay: true,
    }));
    expect(capacidadSemana(20, "2026-08-17", new Set(["2026-08-18"]), eventos, "u1").capacidadMin).toBe(0);
  });
});

describe("festivosDeVentana", () => {
  it("trae el 7 de agosto (Batalla de Boyacá) para una ventana de agosto 2026", () => {
    const f = festivosDeVentana(["2026-08-03", "2026-08-10"]);
    expect(f.has("2026-08-07")).toBe(true);
  });
});
