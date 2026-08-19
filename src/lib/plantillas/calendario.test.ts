import { describe, expect, it } from "vitest";
import { programarPlantilla, sumarHabiles } from "./calendario";

// Lo que se protege: que ninguna tarea de plantilla vuelva a nacer vencida, y que el plan
// hacia atrás respete días hábiles y festivos colombianos. hoy = martes 18 ago 2026.

const HOY = "2026-08-18";
const SIN = new Set<string>();

describe("sumarHabiles", () => {
  it("hacia atrás salta el fin de semana", () => {
    // Lunes 24 − 1 hábil = viernes 21.
    expect(sumarHabiles("2026-08-24", -1, SIN)).toBe("2026-08-21");
  });

  it("hacia atrás salta también el festivo", () => {
    // Con el viernes 21 festivo: lunes 24 − 1 hábil = jueves 20.
    expect(sumarHabiles("2026-08-24", -1, new Set(["2026-08-21"]))).toBe("2026-08-20");
  });

  it("offset 0 sobre un sábado se acomoda al viernes anterior", () => {
    expect(sumarHabiles("2026-08-22", 0, SIN)).toBe("2026-08-21");
  });
});

describe("programarPlantilla — el plan hacia atrás", () => {
  const plantilla = [
    { title: "Guion", ancla: "rodaje" as const, offsetDias: -3, duracionDias: 2, role: "guionista", estimatedMinutes: 480 },
    { title: "Grabación", ancla: "rodaje" as const, offsetDias: 0, duracionDias: 1, role: "camarografo" },
    { title: "Edición V1", ancla: "entrega" as const, offsetDias: -2, duracionDias: 3, role: "editor", estimatedMinutes: 960 },
    { title: "Envío a cliente", ancla: "entrega" as const, offsetDias: 0, duracionDias: 1 },
  ];

  it("todo sale de las dos fechas y en días hábiles", () => {
    // Rodaje mié 26 ago, entrega mié 2 sep.
    const p = programarPlantilla(plantilla, { entrega: "2026-09-02", rodaje: "2026-08-26", hoy: HOY });
    const por = new Map(p.tareas.map((t) => [t.title, t]));
    expect(por.get("Grabación")!.fin).toBe("2026-08-26");
    // Guion: 3 hábiles antes del rodaje = viernes 21; dura 2 → empieza jueves 20.
    expect(por.get("Guion")!.fin).toBe("2026-08-21");
    expect(por.get("Guion")!.inicio).toBe("2026-08-20");
    // Edición: 2 hábiles antes de la entrega = lunes 31; dura 3 → arranca el jueves 27.
    expect(por.get("Edición V1")!.fin).toBe("2026-08-31");
    expect(por.get("Edición V1")!.inicio).toBe("2026-08-27");
    expect(por.get("Envío a cliente")!.fin).toBe("2026-09-02");
    expect(p.avisos).toEqual([]);
  });

  it("NADA nace en el pasado: lo que no cabe se comprime a hoy y se avisa", () => {
    // Entrega pasado mañana: el guion pediría días que ya pasaron.
    const p = programarPlantilla(plantilla, { entrega: "2026-08-20", rodaje: "2026-08-19", hoy: HOY });
    for (const t of p.tareas) {
      if (t.fin) expect(t.fin >= HOY).toBe(true);
      if (t.inicio) expect(t.inicio >= HOY).toBe(true);
    }
    expect(p.avisos.some((a) => a.includes("comprimida"))).toBe(true);
  });

  it("el día del RODAJE es sagrado: cae ese día aunque sea sábado", () => {
    const p = programarPlantilla(plantilla, { entrega: "2026-09-02", rodaje: "2026-08-22", hoy: HOY });
    const g = p.tareas.find((t) => t.title === "Grabación")!;
    expect(g.fin).toBe("2026-08-22"); // sábado: se graba cuando el cliente puede
    expect(p.avisos.some((a) => a.includes("no laborable"))).toBe(true);
  });

  it("la ENTREGA en domingo se acomoda al viernes anterior, avisando", () => {
    const p = programarPlantilla(plantilla, { entrega: "2026-08-30", rodaje: "2026-08-24", hoy: HOY });
    expect(p.tareas.find((t) => t.title === "Envío a cliente")!.fin).toBe("2026-08-28");
    expect(p.avisos.some((a) => a.includes("fin de semana"))).toBe(true);
  });

  it("sin fecha de rodaje, lo anclado al rodaje cae sobre la entrega", () => {
    const p = programarPlantilla(plantilla, { entrega: "2026-09-02", rodaje: null, hoy: HOY });
    const g = p.tareas.find((t) => t.title === "Grabación")!;
    expect(g.fin).toBe("2026-09-02");
  });

  it("rodaje después de la entrega no cierra, y se dice", () => {
    const p = programarPlantilla(plantilla, { entrega: "2026-08-26", rodaje: "2026-09-02", hoy: HOY });
    expect(p.avisos.some((a) => a.includes("DESPUÉS de la entrega"))).toBe(true);
  });

  it("una tarea sin calendario declarado queda sin fechas (no se inventa nada)", () => {
    const p = programarPlantilla([{ title: "Brief con el cliente" }], { entrega: "2026-09-02", hoy: HOY });
    expect(p.tareas[0].inicio).toBeNull();
    expect(p.tareas[0].fin).toBeNull();
  });

  it("el 7 de agosto (festivo real) desvía un vencimiento anclado", () => {
    // Entrega lunes 10 ago 2026; tarea a −1 hábil: el viernes 7 es Batalla de Boyacá → jueves 6.
    const p = programarPlantilla(
      [{ title: "Cierre", ancla: "entrega" as const, offsetDias: -1, duracionDias: 1 }],
      { entrega: "2026-08-10", hoy: "2026-08-03" },
    );
    expect(p.tareas[0].fin).toBe("2026-08-06");
  });
});
