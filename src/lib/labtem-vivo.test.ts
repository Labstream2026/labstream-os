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

describe("labtem-vivo · calidades", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("solo pasan las calidades de la lista cerrada", async () => {
    const { esCalidadViva } = await import("@/lib/labtem-vivo");
    for (const buena of [2160, 1440, 1080, 720, 480, 360]) expect(esCalidadViva(buena)).toBe(true);
    // Lo que importa de verdad: el valor llega por la URL y termina en la orden de ffmpeg. Un
    // número raro no se «sanea», se rechaza.
    for (const mala of [0, -1, 721, 1081, 99999, 1.5, NaN, Infinity]) expect(esCalidadViva(mala)).toBe(false);
    for (const mala of ["720", "720; rm -rf /", null, undefined, {}, []]) expect(esCalidadViva(mala)).toBe(false);
  });

  it("una calidad fuera de lista no llega a pedir nada por la red", async () => {
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
    calidades: [
      { calidad: 1080, w: 1920, h: 1080, kbps: 5000, codecs: "avc1.640029,mp4a.40.2" },
      { calidad: 720, w: 1280, h: 720, kbps: 2500, codecs: "avc1.640029,mp4a.40.2" },
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
    const { calidadesUtiles } = await conMediaSource(() => true);
    expect(calidadesUtiles({ ...base, gpu: false })).toEqual([]);
  });

  it("sin duración tampoco, porque la barra de tiempo sería mentira", async () => {
    const { calidadesUtiles } = await conMediaSource(() => true);
    // Un chorro que se genera sobre la marcha no sabe dónde termina: la duración sale del
    // original. Sin ella el reproductor tendría barra pero no significaría nada, y eso es peor
    // que no tener modo al vuelo.
    expect(calidadesUtiles({ ...base, duracion: null })).toEqual([]);
    expect(calidadesUtiles({ ...base, duracion: 0 })).toEqual([]);
  });

  it("se descartan las calidades que este navegador no sabe reproducir", async () => {
    // El caso real: un 4K ofrecería avc1.640033 (nivel 5.1) y hay equipos que no lo admiten.
    // Enseñarlo igualmente daría un botón que al pulsarlo deja el vídeo negro.
    const { calidadesUtiles } = await conMediaSource((t) => !t.includes("640033"));
    const con4k = {
      ...base,
      calidades: [{ calidad: 2160, w: 3840, h: 2160, kbps: 16000, codecs: "avc1.640033,mp4a.40.2" }, ...base.calidades],
    };
    expect(calidadesUtiles(con4k).map((c) => c.calidad)).toEqual([1080, 720]);
  });

  it("en un vertical la calidad se mide por el lado corto", async () => {
    // La trampa que esto vigila: en un 1080×1920, medir la calidad por la ALTURA ofrecía un
    // «1440p» que no significa nada —la pieza es la que todo el mundo llama 1080p— y hacía que
    // «1080p» diera 607 px de ancho. Lo calcula LabTem, pero el contrato se comprueba aquí
    // porque es lo que acaba escrito en el menú que alguien pulsa.
    const { calidadesUtiles } = await conMediaSource(() => true);
    const vertical = {
      ...base,
      calidades: [
        { calidad: 1080, w: 1080, h: 1920, kbps: 5000, codecs: "avc1.640029,mp4a.40.2" },
        { calidad: 720, w: 720, h: 1280, kbps: 2500, codecs: "avc1.640029,mp4a.40.2" },
      ],
    };
    const salida = calidadesUtiles(vertical);
    expect(salida.map((c) => c.calidad)).toEqual([1080, 720]);
    // «720p» en vertical son 720 de ANCHO, no de alto: lo mismo que significa tumbado.
    expect(salida[1]).toMatchObject({ calidad: 720, w: 720, h: 1280 });
  });

  it("sin MediaSource no hay modo al vuelo (es iOS)", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {});
    const { calidadesUtiles, vivoSoportado } = await import("@/lib/vivo-cliente");
    expect(vivoSoportado("avc1.640029")).toBe(false);
    expect(calidadesUtiles(base)).toEqual([]);
  });

  it("nada que ofrecer si no hay datos", async () => {
    const { calidadesUtiles } = await conMediaSource(() => true);
    expect(calidadesUtiles(null)).toEqual([]);
  });
});

// Desde que no hay copias pregeneradas, estas dos reglas deciden QUÉ se reproduce por defecto.
// Un error aquí no da error: da un 4K entero bajando por la red del cliente, o una GPU
// trabajando en una pieza que el navegador abría gratis.

describe("labtem-vivo · el original ya sirve tal cual (directo)", () => {
  const info = {
    codec: "h264",
    w: 1920,
    h: 1080,
    duracion: 60,
    audio: true,
    tasa: 5_000_000,
    acodec: "aac",
    gpu: true,
    calidades: [],
    libres: 6,
  };

  it("un H.264 1080p razonable en mp4/mov va directo", async () => {
    const { originalApto } = await import("@/lib/labtem-vivo");
    expect(originalApto("Cliente/toma.mp4", info)).toBe(true);
    expect(originalApto("Cliente/toma.mov", info)).toBe(true);
    // El vertical 1080×1920 es 1080p por PÍXELES: medir por altura lo mandaría a convertir.
    expect(originalApto("Cliente/reel.mp4", { ...info, w: 1080, h: 1920 })).toBe(true);
    // Mudo también sirve (el criterio del audio es «AAC/MP3 o nada»).
    expect(originalApto("Cliente/toma.mp4", { ...info, acodec: "" })).toBe(true);
  });

  it("todo lo que la fábrica mandaba a copia, aquí manda a convertir", async () => {
    const { originalApto } = await import("@/lib/labtem-vivo");
    expect(originalApto("Cliente/toma.mkv", info)).toBe(false); // contenedor que el navegador no abre
    expect(originalApto("Cliente/toma.mp4", { ...info, codec: "hevc" })).toBe(false);
    expect(originalApto("Cliente/toma.mp4", { ...info, w: 3840, h: 2160 })).toBe(false); // 4K
    expect(originalApto("Cliente/toma.mp4", { ...info, tasa: 80_000_000 })).toBe(false); // tasa de máster
    expect(originalApto("Cliente/toma.mp4", { ...info, tasa: null })).toBe(false); // tasa desconocida = no
    expect(originalApto("Cliente/toma.mp4", { ...info, acodec: "pcm_s16le" })).toBe(false);
    expect(originalApto("Cliente/toma.mp4", null)).toBe(false);
  });
});

describe("vivo-cliente · la calidad con la que se arranca", () => {
  it("1080 por defecto aunque el original sea 4K; nunca por encima", async () => {
    const { calidadInicial } = await import("@/lib/vivo-cliente");
    const c = (calidad: number) => ({ calidad, w: 0, h: 0, kbps: 0, codecs: "avc1.640029" });
    // La lista llega de mayor a menor, como la publica LabTem.
    expect(calidadInicial([2160, 1440, 1080, 720, 480, 360].map(c))).toBe(1080);
    expect(calidadInicial([720, 480, 360].map(c))).toBe(720);
    // Una pieza chiquita solo trae su peldaño y es el que toca.
    expect(calidadInicial([360].map(c))).toBe(360);
    expect(calidadInicial([])).toBeNull();
  });
});
