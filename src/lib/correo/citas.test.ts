import { describe, expect, it } from "vitest";
import { detectarCita, horaMas } from "./citas";
import { utcFromBogota } from "../reminder-schedule";

// El detector propone, la persona confirma: aquí se clava QUÉ dispara el banner y qué no.
// Un miércoles a las 10:00 de Bogotá como «ahora» fijo (2026-08-19).
const AHORA = utcFromBogota("2026-08-19", "10:00").getTime();

describe("detectarCita", () => {
  it("hora explícita con fecha: la cita completa", () => {
    const c = detectarCita("Reunión de kickoff", "Hola, ¿nos vemos el viernes a las 3 pm para revisar el guion?", AHORA);
    expect(c).not.toBeNull();
    expect(c!.fecha).toBe("2026-08-21"); // el viernes siguiente
    expect(c!.hora).toBe("15:00");
    expect(c!.tituloSugerido).toBe("Reunión de kickoff");
  });

  it("«mañana a las 10» también", () => {
    const c = detectarCita("Llamada", "Te marco mañana a las 10", AHORA);
    expect(c?.fecha).toBe("2026-08-20");
    expect(c?.hora).toBe("10:00");
  });

  it("fecha SIN hora solo pasa si el texto suena a reunión", () => {
    expect(detectarCita("Factura agosto", "El pago queda programado para el 30", AHORA)).toBeNull();
    const c = detectarCita("Visita locación", "Agendemos la visita el 30", AHORA);
    expect(c).not.toBeNull();
    expect(c!.fecha).toBe("2026-08-30");
  });

  it("un correo sin fechas no propone nada", () => {
    expect(detectarCita("Re: corte final", "Quedó espectacular, gracias por el detalle del color.", AHORA)).toBeNull();
  });

  it("saca el enlace de Meet/Zoom para pre-llenar el lugar", () => {
    const c = detectarCita("Sync", "Reunión mañana a las 9. Enlace: https://meet.google.com/abc-defg-hij ¡nos vemos!", AHORA);
    expect(c?.enlaceVideo).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("el asunto se limpia de Re:/Fwd: para el título sugerido", () => {
    const c = detectarCita("RE: RV: Rodaje dron", "Confirmado el jueves a las 6 am en la finca", AHORA);
    expect(c?.tituloSugerido).toBe("Rodaje dron");
  });

  it("recurrencias no son citas (eso es un recordatorio, no un evento)", () => {
    expect(detectarCita("Informe", "Recuerda enviarlo cada lunes a las 8", AHORA)).toBeNull();
  });
});

describe("horaMas", () => {
  it("suma minutos y acota a 23:59", () => {
    expect(horaMas("15:00", 60)).toBe("16:00");
    expect(horaMas("15:30", 45)).toBe("16:15");
    expect(horaMas("23:30", 90)).toBe("23:59");
  });
});
