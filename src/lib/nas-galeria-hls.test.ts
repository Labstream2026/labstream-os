import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// La escalera adaptativa se sirve por una ruta que recibe el nombre del trozo DESDE LA URL
// (`?hls=v0/seg003.ts`). Eso la convierte en la única parte de la galería donde el cliente
// elige un nombre de archivo, así que aquí se prueban las dos mitades: que los trozos buenos
// se encuentran, y que ninguna forma de pedir «hacia arriba» saca nada de fuera de la carpeta.
//
// Se monta una escalera DE VERDAD en un directorio temporal en vez de simular el disco: lo que
// hay que comprobar es cómo se resuelven rutas reales, y un doble de `fs` probaría el doble.

let raiz = "";
let galeria: typeof import("./nas-galeria");

beforeAll(async () => {
  raiz = await fs.mkdtemp(path.join(os.tmpdir(), "galeria-hls-"));
  const escalera = path.join(raiz, "Cliente", ".proxy", "toma.mp4.hls");
  await fs.mkdir(path.join(escalera, "v0"), { recursive: true });
  await fs.writeFile(path.join(raiz, "Cliente", "toma.mp4"), "master de mentira");
  await fs.writeFile(path.join(raiz, "Cliente", "sin-escalera.mp4"), "master de mentira");
  await fs.writeFile(path.join(raiz, "Cliente", "foto.dng"), "foto de mentira");
  await fs.writeFile(path.join(escalera, "master.m3u8"), "#EXTM3U\nv0/index.m3u8\n");
  await fs.writeFile(path.join(escalera, "v0", "index.m3u8"), "#EXTM3U\nseg000.ts\n");
  await fs.writeFile(path.join(escalera, "v0", "seg000.ts"), "fragmento");
  // Vecinos que NO son trozos de escalera: si alguno se pudiera pedir con `?hls=`, el token de
  // una pieza serviría para sacar otra.
  await fs.writeFile(path.join(raiz, "Cliente", ".proxy", "toma.mp4.mp4"), "la copia entera");
  await fs.writeFile(path.join(raiz, "secreto.txt"), "esto no puede salir nunca");

  process.env.NAS_GALERIA_DIR = raiz;
  galeria = await import("./nas-galeria");
});

afterAll(async () => {
  if (raiz) await fs.rm(raiz, { recursive: true, force: true });
});

describe("dónde vive la escalera", () => {
  it("la pone al lado de la pieza, dentro de .proxy", () => {
    expect(galeria.hlsRelFor("Cliente/Entrega/toma.mxf")).toBe("Cliente/Entrega/.proxy/toma.mxf.hls");
  });

  it("también funciona para una pieza suelta en la raíz", () => {
    expect(galeria.hlsRelFor("toma.mp4")).toBe(".proxy/toma.mp4.hls");
  });

  it("conserva el nombre completo, extensión incluida", () => {
    // El nombre lo calcula igual el script de LabTem; si aquí se quitara la extensión, la app
    // buscaría `toma.hls` y la fábrica seguiría escribiendo `toma.mp4.hls`. Nadie se enteraría
    // hasta que un cliente abriera la sala.
    expect(galeria.hlsRelFor("a/b/clip final.mov")).toBe("a/b/.proxy/clip final.mov.hls");
  });
});

describe("¿tiene escalera esta pieza?", () => {
  it("sí cuando existe su maestro", async () => {
    await expect(galeria.galeriaHasHls("Cliente/toma.mp4")).resolves.toBe(true);
  });

  it("no cuando la fábrica todavía no ha llegado a ella", async () => {
    await expect(galeria.galeriaHasHls("Cliente/sin-escalera.mp4")).resolves.toBe(false);
  });

  it("no para una foto: la escalera es cosa de video", async () => {
    await expect(galeria.galeriaHasHls("Cliente/foto.dng")).resolves.toBe(false);
  });
});

describe("servir un trozo", () => {
  it("encuentra el maestro", async () => {
    const p = await galeria.resolveGaleriaHls("Cliente/toma.mp4", "master.m3u8");
    expect(p?.name).toBe("master.m3u8");
    expect(p?.size).toBeGreaterThan(0);
  });

  it("encuentra la lista de una calidad y un fragmento", async () => {
    await expect(galeria.resolveGaleriaHls("Cliente/toma.mp4", "v0/index.m3u8")).resolves.not.toBeNull();
    await expect(galeria.resolveGaleriaHls("Cliente/toma.mp4", "v0/seg000.ts")).resolves.not.toBeNull();
  });

  it("devuelve nada si el trozo no existe", async () => {
    await expect(galeria.resolveGaleriaHls("Cliente/toma.mp4", "v9/seg000.ts")).resolves.toBeNull();
  });
});

describe("no se puede salir de la escalera", () => {
  // Cada uno de estos, si colara, convertiría el token de UNA pieza en permiso para leer otra
  // cosa del disco. Da igual que `galeriaAbs` vuelva a validar por su cuenta: la comprobación
  // de aquí es la que impide que se intente siquiera.
  const intentos = [
    "../toma.mp4.mp4",              // la copia entera, hermana de la escalera
    "../../toma.mp4",               // el master original
    "../../../secreto.txt",         // fuera de la carpeta de la entrega
    "v0/../../../secreto.txt",      // igual, pero disimulado tras un nivel válido
    "/etc/passwd",                  // absoluto
    "..",
    ".",
    "",
    "v0/",                          // sin nombre de archivo
    "v0/sub/seg000.ts",             // más hondo de lo que la escalera tiene
    "\\..\\secreto.txt",            // separadores de Windows
    ".oculto",                      // no empieza por carácter normal
  ];

  for (const sub of intentos) {
    it(`rechaza «${sub || "(vacío)"}»`, async () => {
      await expect(galeria.resolveGaleriaHls("Cliente/toma.mp4", sub)).resolves.toBeNull();
    });
  }

  it("tampoco sirve pedir la escalera de una foto", async () => {
    await expect(galeria.resolveGaleriaHls("Cliente/foto.dng", "master.m3u8")).resolves.toBeNull();
  });
});

describe("reescribir las listas", () => {
  const RUTA = "/api/files-asset/abc123";

  it("convierte las rutas relativas del maestro en peticiones nuestras, con el token", () => {
    const maestro = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=5640800,RESOLUTION=1920x1080",
      "v0/index.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=1240800,RESOLUTION=852x480",
      "v2/index.m3u8",
      "",
    ].join("\n");
    const salida = galeria.reescribirListaHls(maestro, { ruta: RUTA, parametros: { t: "tok" } });
    expect(salida.split("\n")).toEqual([
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=5640800,RESOLUTION=1920x1080",
      `${RUTA}?t=tok&hls=v0%2Findex.m3u8`,
      "#EXT-X-STREAM-INF:BANDWIDTH=1240800,RESOLUTION=852x480",
      `${RUTA}?t=tok&hls=v2%2Findex.m3u8`,
      "",
    ]);
  });

  it("resuelve los fragmentos contra la carpeta de su propia lista", () => {
    // Dentro de `v0/index.m3u8`, `seg000.ts` significa `v0/seg000.ts`. Sin esto se pediría el
    // fragmento en la raíz de la escalera, donde no está, y no se reproduciría nada.
    const lista = "#EXTINF:6.000,\nseg000.ts\n#EXTINF:6.000,\nseg001.ts\n#EXT-X-ENDLIST\n";
    const salida = galeria.reescribirListaHls(lista, {
      ruta: RUTA,
      parametros: { t: "tok" },
      carpeta: galeria.carpetaDeTrozoHls("v0/index.m3u8"),
    });
    expect(salida).toContain(`${RUTA}?t=tok&hls=v0%2Fseg000.ts`);
    expect(salida).toContain(`${RUTA}?t=tok&hls=v0%2Fseg001.ts`);
    expect(salida).toContain("#EXT-X-ENDLIST");
  });

  it("no toca ni una etiqueta del formato", () => {
    // Si se colara una reescritura en `#EXT-X-STREAM-INF` se perderían el ancho de banda y la
    // resolución, que es exactamente lo que el reproductor mira para elegir calidad: seguiría
    // reproduciendo, pero habría dejado de adaptarse. Un fallo mudo.
    const etiquetas = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n";
    expect(galeria.reescribirListaHls(etiquetas, { ruta: RUTA, parametros: { t: "tok" } })).toBe(etiquetas);
  });

  it("funciona sin token (sesión del equipo, sin enlace firmado)", () => {
    const salida = galeria.reescribirListaHls("v1/index.m3u8\n", { ruta: RUTA, parametros: { t: null } });
    expect(salida).toBe(`${RUTA}?hls=v1%2Findex.m3u8\n`);
  });

  it("sabe de qué carpeta cuelga cada trozo", () => {
    expect(galeria.carpetaDeTrozoHls("master.m3u8")).toBe("");
    expect(galeria.carpetaDeTrozoHls("v0/index.m3u8")).toBe("v0/");
  });

  it("arrastra también QUÉ pieza es, para la sala de entrega del cliente", () => {
    // Ahí el token abre una entrega ENTERA, no un archivo suelto, así que cada petición tiene
    // que decir además de qué pieza es el trozo. Si `rel` se perdiera al reescribir, el
    // servidor no sabría qué escalera abrir y la sala se quedaría en negro.
    const salida = galeria.reescribirListaHls("v0/index.m3u8\n", {
      ruta: "/api/galeria-publica/media",
      parametros: { t: "tokEntrega", rel: "Cliente/Entrega/toma.mp4" },
    });
    expect(salida.trim()).toBe(
      "/api/galeria-publica/media?t=tokEntrega&rel=Cliente%2FEntrega%2Ftoma.mp4&hls=v0%2Findex.m3u8",
    );
  });
});
