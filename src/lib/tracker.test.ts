import { describe, expect, it } from "vitest";
import { atribuir, limpiarBloques, normalizarTitulo, type EntradaCatalogo } from "./tracker";

// Lo delicado del rastreador: (1) que la ATRIBUCIÓN por título no invente —un rato mal
// asignado ensucia las horas de un cliente y es peor que no asignarlo— y (2) que la
// validación del lote aguante basura sin tumbar el resto.

const CAT: EntradaCatalogo[] = [
  { projectId: "p1", nombre: "Dermakind agosto", clientId: "c1", cliente: "Dermakind" },
  { projectId: "p2", nombre: "Reel", clientId: "c1", cliente: "Dermakind" },
  { projectId: "p3", nombre: "Lanzamiento Skala", clientId: "c2", cliente: "Skala Fitness" },
  { projectId: "p4", nombre: "GRI", clientId: "c3", cliente: "GRI" }, // 3 letras: nunca casa
];

describe("normalizarTitulo", () => {
  it("baja a minúsculas, quita acentos y deja las palabras separadas por espacio", () => {
    expect(normalizarTitulo("Producción_Café-Roble.mp4")).toBe(" produccion cafe roble mp4 ");
  });
  it("la ñ se descompone a n (deliberado: «diseño» y «diseno» casan igual)", () => {
    expect(normalizarTitulo("Diseño v2")).toBe(" diseno v2 ");
  });
});

describe("atribuir", () => {
  it("reconoce el proyecto en un título de DaVinci Resolve", () => {
    expect(atribuir("Dermakind agosto - DaVinci Resolve 19", CAT)).toEqual({ projectId: "p1", clientId: "c1" });
  });

  it("gana el nombre MÁS LARGO cuando dos proyectos aparecen", () => {
    // «Reel» también está en el título, pero «Dermakind agosto» es más específico.
    expect(atribuir("Reel — Dermakind agosto.prproj", CAT)).toEqual({ projectId: "p1", clientId: "c1" });
  });

  it("sin proyecto pero con cliente, atribuye solo la cuenta", () => {
    expect(atribuir("Correo de Dermakind — Bandeja", CAT)).toEqual({ projectId: null, clientId: "c1" });
  });

  it("no casa dentro de otra palabra", () => {
    // «Skala» vive dentro de «Skalable»: sin la regla de palabra completa, esto mentiría.
    expect(atribuir("Skalable Systems — inicio", CAT)).toEqual({ projectId: null, clientId: null });
  });

  it("los nombres de menos de 4 letras no se buscan (demasiado ruido)", () => {
    expect(atribuir("agridulce GRI cosas", CAT)).toEqual({ projectId: null, clientId: null });
  });

  it("ignora acentos y separadores del título", () => {
    expect(atribuir("lanzamiento_skala_v3.prproj", CAT)).toEqual({ projectId: "p3", clientId: "c2" });
  });

  it("casa aunque el título venga sin tildes ni eñes", () => {
    const cat: EntradaCatalogo[] = [{ projectId: "px", nombre: "Diseño Campaña", clientId: "cx", cliente: "Acme" }];
    expect(atribuir("diseno campana - Illustrator", cat)).toEqual({ projectId: "px", clientId: "cx" });
  });

  it("un título cualquiera no se atribuye a nadie", () => {
    expect(atribuir("YouTube — Chrome", CAT)).toEqual({ projectId: null, clientId: null });
    expect(atribuir("", CAT)).toEqual({ projectId: null, clientId: null });
  });
});

describe("limpiarBloques", () => {
  const AHORA = 1_760_000_000_000;
  const ok = { s: AHORA - 60_000, d: 60, a: 45, app: "Resolve", t: "Dermakind" };

  it("deja pasar un bloque válido y recorta lo largo", () => {
    const [b] = limpiarBloques([{ ...ok, app: "x".repeat(200), t: "y".repeat(300) }], AHORA);
    expect(b.seconds).toBe(60);
    expect(b.activeSecs).toBe(45);
    expect(b.app.length).toBe(80);
    expect(b.title.length).toBe(140);
  });

  it("descarta basura sin tirar el resto del lote", () => {
    const sucio = [ok, null, 7, { d: 60, app: "x" }, { s: AHORA, d: 0, app: "x" }, { s: AHORA, d: 60, app: "  " }];
    expect(limpiarBloques(sucio, AHORA)).toHaveLength(1);
  });

  it("rechaza el futuro y lo más viejo que 30 días (reloj loco o cola eterna)", () => {
    expect(limpiarBloques([{ ...ok, s: AHORA + 3_600_000 }], AHORA)).toHaveLength(0);
    expect(limpiarBloques([{ ...ok, s: AHORA - 40 * 86_400_000 }], AHORA)).toHaveLength(0);
  });

  it("los segundos activos nunca superan la duración", () => {
    expect(limpiarBloques([{ ...ok, a: 5000 }], AHORA)[0].activeSecs).toBe(60);
  });

  it("un payload que no es lista da lista vacía", () => {
    expect(limpiarBloques("no", AHORA)).toEqual([]);
    expect(limpiarBloques(undefined, AHORA)).toEqual([]);
  });
});
