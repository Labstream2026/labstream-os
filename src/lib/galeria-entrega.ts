import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { verifyGaleriaToken } from "@/lib/galeria-token";
import { galeriaAbs, normalizeGaleriaRel } from "@/lib/nas-galeria";

// ── El guardián de la sala del cliente ─────────────────────────────────────────
// Un único sitio decide si un enlace abre o no. Lo usan la página /galeria/[token] y todas las
// rutas que sirven material de esa sala; si la respuesta no es `ok`, no se toca el disco.
//
// Cada entrega es una FILA (modelo GaleriaEntrega). Antes esto era una lista de rutas dentro de
// una clave de AppConfig, y esa forma tenía cuatro agujeros:
//   1. la visita del cliente no se registraba (solo la descarga) → `registrarVisita()`;
//   2. regenerar el enlace no mataba el anterior → la fila lleva `version` y el token la firma;
//   3. renombrar la carpeta por SMB dejaba la revocación huérfana y muda → la fila se conserva y
//      `listarEntregas()` la marca como «la carpeta ya no está» para que alguien decida;
//   4. dos clics a la vez reescribían la lista entera y se pisaban → ahora cada entrega se toca
//      con su propio upsert.
//
// Regla que no se negocia: al cliente NUNCA se le enseña la estructura de carpetas del NAS. Los
// mensajes de error hablan de «este enlace», jamás de rutas, discos ni montajes.

type Motivo = "invalido" | "caducado" | "revocado" | "reemplazado" | "sin_carpeta";

export type EntregaEstado =
  | { ok: true; folderRel: string; titulo: string }
  | { ok: false; motivo: Motivo; mensaje: string };

const MENSAJES: Record<Motivo, string> = {
  invalido: "Este enlace no es válido. Puede que se haya copiado a medias: pide el enlace completo a tu productor.",
  caducado: "Este enlace ya venció. Pide uno nuevo a tu productor y lo tendrás en un momento.",
  revocado: "Este enlace ya no está disponible. Pide uno nuevo a tu productor.",
  reemplazado: "Este enlace se reemplazó por uno más nuevo. Busca el último que te compartieron, o pídeselo a tu productor.",
  sin_carpeta: "No encontramos el material de esta entrega. Escríbele a tu productor y lo revisamos.",
};

function fallo(motivo: Motivo): EntregaEstado {
  return { ok: false, motivo, mensaje: MENSAJES[motivo] };
}

// ¿El token está bien firmado pero se le pasó la fecha? verifyScopedToken devuelve null tanto
// para «firma mala» como para «caducado», y son dos conversaciones distintas con el cliente
// (una es «te copiaste medio enlace», la otra «pídeme otro»). Se mira solo el `exp` del formato
// id.exp.firma: no revela nada —el acceso ya está denegado— y un token inventado con fecha vieja
// como mucho consigue leer «venció» en vez de «no es válido».
function pareceCaducado(token: string): boolean {
  const exp = Number((token || "").split(".")[1]);
  return Number.isFinite(exp) && exp * 1000 < Date.now();
}

// El nombre que ve el cliente: SOLO el último tramo de la ruta, nunca la ruta entera. En el NAS
// las carpetas se nombran con guiones bajos donde iría un espacio, así que se limpian.
export function tituloDe(folderRel: string): string {
  const ultimo = folderRel.split("/").pop() || "";
  return ultimo.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || "Entrega";
}

// ── Resolver el enlace ─────────────────────────────────────────────────────────

export async function resolverEntrega(token: string): Promise<EntregaEstado> {
  const datos = verifyGaleriaToken(token);
  if (!datos) return fallo(pareceCaducado(token) ? "caducado" : "invalido");

  // La ruta viene de fuera aunque venga firmada: si alguna vez se firmó algo raro (o se cambia
  // el secreto y colisiona), normalizeGaleriaRel LANZA y aquí se muere el intento. Nunca se
  // construye una ruta absoluta con texto sin normalizar.
  let folderRel: string;
  try {
    folderRel = normalizeGaleriaRel(datos.folderRel);
  } catch {
    return fallo("invalido");
  }
  // La raíz no es una entrega: abrirla enseñaría el material de TODOS los clientes.
  if (!folderRel) return fallo("invalido");

  // La fila manda sobre el token. Si no hay fila, la entrega nunca se tocó desde el panel: es un
  // enlace de los de antes y vale como versión 1 (no se deja tirado a un cliente que ya lo tiene).
  let fila: { revokedAt: Date | null; version: number } | null;
  try {
    fila = await db.galeriaEntrega.findUnique({ where: { folderRel }, select: { revokedAt: true, version: true } });
  } catch {
    // Sin poder consultar, se CIERRA. Un enlace retirado que sigue abriendo es mucho peor que
    // una sala que no abre durante un rato.
    return fallo("revocado");
  }
  if (fila?.revokedAt) return fallo("revocado");
  // Token de una generación anterior: el equipo compartió uno nuevo y este ya no vale.
  if (fila && datos.version < fila.version) return fallo("reemplazado");

  // Que la carpeta exista de verdad, ahora mismo. El material se lee en vivo del disco: pudo
  // moverse, renombrarse, o LabTem puede no estar montado. En los tres casos el cliente ve lo
  // mismo, porque para él la diferencia no significa nada.
  try {
    const abs = await galeriaAbs(folderRel);
    const st = await fs.stat(abs);
    if (!st.isDirectory()) return fallo("sin_carpeta");
  } catch {
    return fallo("sin_carpeta");
  }

  // `folderRel` es para el servidor (escanear, servir archivos). Lo que se pinta es `titulo`.
  return { ok: true, folderRel, titulo: tituloDe(folderRel) };
}

// ── Estado de la entrega (panel del equipo) ────────────────────────────────────

// Crea o actualiza la entrega y SUBE la versión: los enlaces anteriores dejan de abrir. Devuelve
// la versión nueva, que es la que hay que firmar en el token.
export async function nuevaVersionEntrega(folderRel: string): Promise<number> {
  const norm = normalizeGaleriaRel(folderRel);
  if (!norm) throw new Error("Hay que decir de qué entrega es el enlace");
  const titulo = tituloDe(norm);
  // Upsert: sin lectura previa, así dos clics simultáneos no se pisan. Al crear arranca en 1
  // (es el primer enlace, no hay ninguno anterior que matar); al actualizar sube de uno en uno
  // y de paso vuelve a poner en pie una entrega que estaba retirada.
  const fila = await db.galeriaEntrega.upsert({
    where: { folderRel: norm },
    create: { folderRel: norm, titulo, version: 1 },
    update: { titulo, version: { increment: 1 }, revokedAt: null },
    select: { version: true },
  });
  return fila.version;
}

// Retira el acceso YA, sin esperar a que caduque el token: es el botón de pánico cuando un
// enlace acabó donde no debía.
export async function revocarEntrega(folderRel: string): Promise<void> {
  const norm = normalizeGaleriaRel(folderRel);
  if (!norm) throw new Error("Hay que decir qué entrega se retira");
  await db.galeriaEntrega.upsert({
    where: { folderRel: norm },
    create: { folderRel: norm, titulo: tituloDe(norm), revokedAt: new Date() },
    update: { revokedAt: new Date() },
  });
}

// Vuelve a poner la entrega en pie SIN generar enlace nuevo: los tokens de la versión actual que
// aún no hayan caducado sirven otra vez.
export async function reactivarEntrega(folderRel: string): Promise<void> {
  const norm = normalizeGaleriaRel(folderRel);
  if (!norm) return;
  await db.galeriaEntrega.updateMany({ where: { folderRel: norm }, data: { revokedAt: null } });
}

export async function entregaRevocada(folderRel: string): Promise<boolean> {
  let norm: string;
  try {
    norm = normalizeGaleriaRel(folderRel);
  } catch {
    return true; // ruta que ni siquiera es válida: no se abre nada
  }
  if (!norm) return true;
  try {
    const fila = await db.galeriaEntrega.findUnique({ where: { folderRel: norm }, select: { revokedAt: true } });
    return !!fila?.revokedAt;
  } catch {
    return true; // ver arriba: ante la duda, se cierra
  }
}

// ── Visitas ────────────────────────────────────────────────────────────────────

// Registra que el cliente ABRIÓ la sala. Se llama SOLO desde la página, nunca desde las rutas de
// material: si se llamara desde ellas, una galería de 200 fotos contaría 200 visitas.
// No revienta nunca: que falle el contador no puede tumbar la sala del cliente.
export async function registrarVisita(folderRel: string): Promise<void> {
  try {
    const norm = normalizeGaleriaRel(folderRel);
    if (!norm) return;
    await db.galeriaEntrega.upsert({
      where: { folderRel: norm },
      create: { folderRel: norm, titulo: tituloDe(norm), visitas: 1, ultimaVisitaAt: new Date() },
      update: { visitas: { increment: 1 }, ultimaVisitaAt: new Date() },
    });
  } catch {
    /* el contador no manda sobre la sala */
  }
}

// ── Listado para el panel del equipo ───────────────────────────────────────────

export type EntregaFila = {
  folderRel: string;
  titulo: string;
  version: number;
  revocada: boolean;
  visitas: number;
  ultimaVisitaAt: Date | null;
  // La carpeta ya no está en el disco: la movieron o la renombraron por SMB. La fila se queda
  // (si estaba retirada, sigue retirada) pero el equipo tiene que verlo — antes esto se quedaba
  // mudo y la revocación huérfana no se lo decía a nadie.
  huerfana: boolean;
};

export async function listarEntregas(): Promise<EntregaFila[]> {
  const filas = await db.galeriaEntrega.findMany({ orderBy: [{ ultimaVisitaAt: "desc" }, { updatedAt: "desc" }] });
  return Promise.all(
    filas.map(async (f) => {
      let huerfana = false;
      try {
        const st = await fs.stat(await galeriaAbs(f.folderRel));
        huerfana = !st.isDirectory();
      } catch {
        huerfana = true;
      }
      return {
        folderRel: f.folderRel,
        titulo: f.titulo || tituloDe(f.folderRel),
        version: f.version,
        revocada: !!f.revokedAt,
        visitas: f.visitas,
        ultimaVisitaAt: f.ultimaVisitaAt,
        huerfana,
      };
    }),
  );
}

// Borra la fila de una entrega cuya carpeta ya no existe. Solo para huérfanas: mientras la
// carpeta esté, la fila es lo que sostiene la revocación y la versión.
export async function olvidarEntrega(folderRel: string): Promise<void> {
  const norm = normalizeGaleriaRel(folderRel);
  if (!norm) return;
  await db.galeriaEntrega.deleteMany({ where: { folderRel: norm } });
}
