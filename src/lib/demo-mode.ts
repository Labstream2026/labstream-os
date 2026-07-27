import { db } from "@/lib/db";

// ── MODO DEMO ──
// Siembra un cliente y un proyecto de ejemplo con TODO lo que la app sabe hacer (tareas,
// entregable, calendario, chat, notas, recordatorios, wiki, biblioteca…) para poder enseñar
// o probar la herramienta sin tocar el trabajo real. Se enciende y se apaga; al apagarlo se
// borra EXACTAMENTE lo que se creó.
//
// No hace falta migración: el estado vive en `AppConfig` (tabla clave/valor que ya existía).
// Ahí se guarda además la lista de artefactos creados —{tipo, id}— para que el apagado no
// tenga que adivinar por nombre ni arrastre nada del equipo.
//
// OJO: el modo demo NO toca facturación ni propuestas (decisión del usuario), así que esas
// secciones se quedan como están y la guía tampoco las explica.

export const DEMO_CONFIG_KEY = "demo:modo";

// Tipos de artefacto en el orden en que se CREAN; el borrado va en orden inverso para no
// chocar con las relaciones (los onDelete en cascada cubren casi todo, pero así es explícito).
export const DEMO_ORDEN: DemoTipo[] = [
  "client",
  "project",
  "task",
  "deliverable",
  "calendarEvent",
  "note",
  "reminder",
  "chatChannel",
  "wikiPage",
  "libraryAsset",
];

export type DemoTipo =
  | "client"
  | "project"
  | "task"
  | "deliverable"
  | "calendarEvent"
  | "note"
  | "reminder"
  | "chatChannel"
  | "wikiPage"
  | "libraryAsset";

export type DemoArtefacto = { t: DemoTipo; id: string };

export type DemoEstado = {
  activo: boolean;
  activadoEn: string | null;
  activadoPor: string | null;
  artefactos: DemoArtefacto[];
  // Atajos para que el panel enlace directo al material de muestra.
  clienteId: string | null;
  proyectoId: string | null;
};

export const DEMO_VACIO: DemoEstado = {
  activo: false,
  activadoEn: null,
  activadoPor: null,
  artefactos: [],
  clienteId: null,
  proyectoId: null,
};

// Lee el estado. Tolerante: si el JSON está corrupto o no existe, devuelve "apagado" en vez
// de reventar la página de Ajustes.
export async function leerEstadoDemo(): Promise<DemoEstado> {
  try {
    const row = await db.appConfig.findUnique({ where: { key: DEMO_CONFIG_KEY } });
    if (!row) return DEMO_VACIO;
    const v = row.value as Partial<DemoEstado> | null;
    if (!v || typeof v !== "object") return DEMO_VACIO;
    return {
      activo: Boolean(v.activo),
      activadoEn: typeof v.activadoEn === "string" ? v.activadoEn : null,
      activadoPor: typeof v.activadoPor === "string" ? v.activadoPor : null,
      artefactos: Array.isArray(v.artefactos) ? (v.artefactos as DemoArtefacto[]) : [],
      clienteId: typeof v.clienteId === "string" ? v.clienteId : null,
      proyectoId: typeof v.proyectoId === "string" ? v.proyectoId : null,
    };
  } catch {
    return DEMO_VACIO;
  }
}

export async function guardarEstadoDemo(estado: DemoEstado): Promise<void> {
  await db.appConfig.upsert({
    where: { key: DEMO_CONFIG_KEY },
    create: { key: DEMO_CONFIG_KEY, value: estado as unknown as object },
    update: { value: estado as unknown as object },
  });
}
