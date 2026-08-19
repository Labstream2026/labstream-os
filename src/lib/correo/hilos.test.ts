import { describe, expect, it } from "vitest";
import { agruparHilos, asuntoLimpio, claveHilo, clienteDeRemitente } from "./hilos";

// Agrupar mal es MEZCLAR conversaciones de clientes distintos en una tarjeta — el error que
// hace desconfiar de toda la bandeja. Estos bordes quedan clavados.

describe("claveHilo", () => {
  it("la raíz sale del PRIMER id de References (el más viejo de la cadena)", () => {
    expect(claveHilo({ messageId: "<c@x>", inReplyTo: "<b@x>", references: "<a@x> <b@x>" })).toBe("<a@x>");
  });

  it("sin References cae a In-Reply-To, y sin nada abre hilo con su propio id", () => {
    expect(claveHilo({ messageId: "<c@x>", inReplyTo: "<b@x>", references: null })).toBe("<b@x>");
    expect(claveHilo({ messageId: "<c@x>" })).toBe("<c@x>");
    expect(claveHilo({})).toBeNull();
  });

  it("un References con basura no rompe: se toma el primer id bien formado", () => {
    expect(claveHilo({ references: "basura <a@x> <b@x>" })).toBe("<a@x>");
  });
});

describe("asuntoLimpio", () => {
  it("pela Re:, RV:, Fwd: encadenados, con y sin contador", () => {
    expect(asuntoLimpio("Re: RV: Fwd: Reel Verano")).toBe("Reel Verano");
    expect(asuntoLimpio("RE[2]: Cotización")).toBe("Cotización");
  });

  it("no toca un asunto que empieza parecido pero no es prefijo", () => {
    expect(asuntoLimpio("Revisión del corte")).toBe("Revisión del corte");
    expect(asuntoLimpio("Reforma del contrato")).toBe("Reforma del contrato");
  });

  it("vacío queda como (sin asunto)", () => {
    expect(asuntoLimpio("  ")).toBe("(sin asunto)");
  });
});

const msg = (o: Partial<Parameters<typeof agruparHilos>[0][number]>) => ({
  id: Math.random().toString(36).slice(2),
  threadKey: null as string | null,
  subject: "x",
  fromEmail: "a@b.c",
  date: new Date("2026-08-18T12:00:00Z"),
  seen: true,
  flagged: false,
  folder: "INBOX",
  ...o,
});

describe("agruparHilos", () => {
  it("misma raíz = mismo hilo, ordenado del más viejo al más nuevo, y el hilo más activo primero", () => {
    const hilos = agruparHilos([
      msg({ threadKey: "<a>", date: new Date("2026-08-15T10:00:00Z"), subject: "Reel" }),
      msg({ threadKey: "<b>", date: new Date("2026-08-16T10:00:00Z"), subject: "Otro" }),
      msg({ threadKey: "<a>", date: new Date("2026-08-18T10:00:00Z"), subject: "Re: Reel" }),
    ]);
    expect(hilos).toHaveLength(2);
    expect(hilos[0].mensajes).toHaveLength(2); // el de <a> es el más activo
    expect(hilos[0].mensajes[0].date < hilos[0].mensajes[1].date).toBe(true);
    expect(hilos[0].ultimo.subject).toBe("Re: Reel");
  });

  it("cuenta no leídos SOLO de la bandeja de entrada (un enviado no es «por leer»)", () => {
    const hilos = agruparHilos([
      msg({ threadKey: "<a>", seen: false, folder: "INBOX" }),
      msg({ threadKey: "<a>", seen: true, folder: "ENVIADOS", date: new Date("2026-08-18T13:00:00Z") }),
    ]);
    expect(hilos[0].noLeidos).toBe(1);
  });

  it("una estrella en CUALQUIER mensaje destaca el hilo entero", () => {
    const hilos = agruparHilos([msg({ threadKey: "<a>" }), msg({ threadKey: "<a>", flagged: true, date: new Date("2026-08-18T13:00:00Z") })]);
    expect(hilos[0].destacado).toBe(true);
  });

  it("sin threadKey agrupa por asunto limpio: las cadenas Re: viejas quedan juntas", () => {
    const hilos = agruparHilos([
      msg({ subject: "Cotización evento" }),
      msg({ subject: "Re: Cotización evento", date: new Date("2026-08-18T13:00:00Z") }),
      msg({ subject: "Otra cosa" }),
    ]);
    expect(hilos).toHaveLength(2);
    expect(hilos[0].mensajes).toHaveLength(2);
  });
});

describe("clienteDeRemitente", () => {
  const catalogo = [
    { email: "camila.restrepo@postobon.com", clientId: "c1" },
    { email: "drdanney@gmail.com", clientId: "c2" },
  ];

  it("coincidencia EXACTA de correo, sin importar mayúsculas", () => {
    expect(clienteDeRemitente("Camila.Restrepo@Postobon.com", catalogo)).toBe("c1");
  });

  it("NUNCA adivina por dominio: otro gmail no es la doctora", () => {
    expect(clienteDeRemitente("otra.persona@gmail.com", catalogo)).toBeNull();
  });

  it("nulos y vacíos, sin drama", () => {
    expect(clienteDeRemitente(null, catalogo)).toBeNull();
    expect(clienteDeRemitente("  ", catalogo)).toBeNull();
  });
});
