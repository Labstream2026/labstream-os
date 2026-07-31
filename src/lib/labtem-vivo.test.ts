import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Las pruebas del modo AL VUELO se centran en los dos sitios donde un descuido no daría error
// sino algo peor —silencio—: los valores que acaban en una línea de órdenes de ffmpeg al otro
// lado de la red, y la lista de calidades que se le enseña a alguien para que pulse.
//
// El módulo del servidor lee su configuración al cargarse, así que cada prueba que dependa de
// ella tiene que recargarlo (`resetModules`). Sin eso, la primera prueba fija el entorno de
// todas las demás y las siguientes pasan por casualidad.

describe("labtem-vivo · configuración", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sin variables, el modo simplemente no existe", async () => {
    vi.stubEnv("LABTEM_VIVO_URL", "");
    vi.stubEnv("LABTEM_VIVO_SECRETO", "");
    const m = await import("@/lib/labtem-vivo");
    expect(m.vivoConfigurado()).toBe(false);
    // Y no es que falle: es que contesta «no» sin tocar la red. Un portátil de desarrollo o un
    // despliegue sin LabTem tienen que comportarse igual que antes de que esto existiera.
    expect(await m.vivoSalud()).toBeNull();
    expect(await m.vivoInfo("algo.mp4")).toBeNull();
    expect(await m.vivoChorro("algo.mp4", 720, 0)).toBeNull();
  });

  it("con la URL pero sin secreto tampoco: media configuración es no estar configurado", async () => {
    vi.stubEnv("LABTEM_VIVO_URL", "http://192.168.0.40:8099");
    vi.stubEnv("LABTEM_VIVO_SECRETO", "");
    const m = await import("@/lib/labtem-vivo");
    expect(m.vivoConfigurado()).toBe(false);
  });
});

describe("labtem-vivo · alturas", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("solo pasan las alturas de la lista cerrada", async () => {
    const { esAlturaViva } = await import("@/lib/labtem-vivo");
    for (const buena of [2160, 1440, 1080, 720, 480, 360]) expect(esAlturaViva(buena)).toBe(true);
    // Lo que importa de verdad: el alto llega por la URL y termina en la orden de ffmpeg. Un
    // número raro no se «sanea», se rechaza.
    for (const mala of [0, -1, 721, 1081, 99999, 1.5, NaN, Infinity]) expect(esAlturaViva(mala)).toBe(false);
    for (const mala of ["720", "720; rm -rf /", null, undefined, {}, []]) expect(esAlturaViva(mala)).toBe(false);
  });

  it("una altura fuera de lista no llega a pedir nada por la red", async () => {
    vi.stubEnv("LABTEM_VIVO_URL", "http://labtem.invalido:8099");
    vi.stubEnv("LABTEM_VIVO_SECRETO", "secreto-de-prueba");
    const m = await import("@/lib/labtem-vivo");
    const espia = vi.spyOn(globalThis, "fetch");
    expect(await m.vivoChorro("pieza.mp4", 999, 0)).toBeNull();
    expect(espia).not.toHaveBeenCalled();
  });
});

describe("labtem-vivo · cabeceras de vuelta", () => {
  it("solo se copian las de la lista, no lo que venga", async () => {
    const { cabecerasVivo } = await import("@/lib/labtem-vivo");
    const origen = new Headers({
      "x-labtem-vivo": "404x720",
      "x-labtem-codecs": "avc1.640029,mp4a.40.2",
      "x-labtem-duracion": "82.261",
      "x-labtem-desde": "10",
      // Nada de esto debería cruzar: lo que llega de otro servicio no se reenvía a ciegas al
      // navegador. `set-cookie` es el ejemplo caro de por qué.
      "set-cookie": "sesion=robada",
      "x-powered-by": "algo",
      server: "otro",
    });
    const salida = cabecerasVivo(origen);
    expect(salida).toEqual({
      "x-labtem-vivo": "404x720",
      "x-labtem-codecs": "avc1.640029,mp4a.40.2",
      "x-labtem-duracion": "82.261",
      "x-labtem-desde": "10",
    });
  });

  it("una cabecera ausente no aparece vacía", async () => {
    const { cabecerasVivo } = await import("@/lib/labtem-vivo");
    expect(cabecerasVivo(new Headers({ "x-labtem-vivo": "640x360" }))).toEqual({ "x-labtem-vivo": "640x360" });
  });
});

describe("vivo-cliente · qué calidades se ofrecen", () => {
  const base = {
    duracion: 120,
    audio: true,
    gpu: true,
    alturas: [
      { alto: 1080, kbps: 5000, codecs: "avc1.640029,mp4a.40.2" },
      { alto: 720, kbps: 2500, codecs: "avc1.640029,mp4a.40.2" },
    ],
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function conMediaSource(admite: (t: string) => boolean) {
    vi.resetModules();
    vi.stubGlobal("window", { MediaSource: true });
    vi.stubGlobal("MediaSource", { isTypeSupported: admite });
    return import("@/lib/vivo-cliente");
  }

  it("sin GPU que decodifique el original, no se ofrece nada", async () => {
    const { alturasUtiles } = await conMediaSource(() => true);
    expect(alturasUtiles({ ...base, gpu: false })).toEqual([]);
  });

  it("sin duración tampoco, porque la barra de tiempo sería mentira", async () => {
    const { alturasUtiles } = await conMediaSource(() => true);
    // Un chorro que se genera sobre la marcha no sabe dónde termina: la duración sale del
    // original. Sin ella el reproductor tendría barra pero no significaría nada, y eso es peor
    // que no tener modo al vuelo.
    expect(alturasUtiles({ ...base, duracion: null })).toEqual([]);
    expect(alturasUtiles({ ...base, duracion: 0 })).toEqual([]);
  });

  it("se descartan las calidades que este navegador no sabe reproducir", async () => {
    // El caso real: un 4K ofrecería avc1.640033 (nivel 5.1) y hay equipos que no lo admiten.
    // Enseñarlo igualmente daría un botón que al pulsarlo deja el vídeo negro.
    const { alturasUtiles } = await conMediaSource((t) => !t.includes("640033"));
    const con4k = {
      ...base,
      alturas: [{ alto: 2160, kbps: 16000, codecs: "avc1.640033,mp4a.40.2" }, ...base.alturas],
    };
    expect(alturasUtiles(con4k).map((a) => a.alto)).toEqual([1080, 720]);
  });

  it("sin MediaSource no hay modo al vuelo (es iOS)", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {});
    const { alturasUtiles, vivoSoportado } = await import("@/lib/vivo-cliente");
    expect(vivoSoportado("avc1.640029")).toBe(false);
    expect(alturasUtiles(base)).toEqual([]);
  });

  it("nada que ofrecer si no hay datos", async () => {
    const { alturasUtiles } = await conMediaSource(() => true);
    expect(alturasUtiles(null)).toEqual([]);
  });
});
