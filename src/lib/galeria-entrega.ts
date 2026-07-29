import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { verifyGaleriaToken } from "@/lib/galeria-token";
import { galeriaAbs, normalizeGaleriaRel } from "@/lib/nas-galeria";

// ── El guardián de la sala del cliente ─────────────────────────────────────────
// Un único sitio decide si un enlace abre o no. Lo usan la página /galeria/[token] y todas las
// rutas que sirven material de esa sala; si la respuesta no es `ok`, no se toca el disco.
//
// Sin modelo de Prisma a propósito: la revocación vive en AppConfig (la tabla clave/valor que ya
// existe, la misma del modo demo) y el rastro de quién retiró qué lo deja logActivity() desde las
// acciones del equipo. Así esta pieza no añade ni una migración.
//
// Regla que no se negocia: al cliente NUNCA se le enseña la estructura de carpetas del NAS. Los
// mensajes de error hablan de «este enlace», jamás de rutas, discos ni montajes.

const CLAVE_REVOCADAS = "galeria:entregasRevocadas";

export type EntregaEstado =
  | { ok: true; folderRel: string; titulo: string }
  | { ok: false; motivo: "invalido" | "caducado" | "revocado" | "sin_carpeta"; mensaje: string };

const MENSAJES: Record<"invalido" | "caducado" | "revocado" | "sin_carpeta", string> = {
  invalido: "Este enlace no es válido. Puede que se haya copiado a medias: pide el enlace completo a tu productor.",
  caducado: "Este enlace ya venció. Pide uno nuevo a tu productor y lo tendrás en un momento.",
  revocado: "Este enlace ya no está disponible. Pide uno nuevo a tu productor.",
  sin_carpeta: "No encontramos el material de esta entrega. Escríbele a tu productor y lo revisamos.",
};

function fallo(motivo: "invalido" | "caducado" | "revocado" | "sin_carpeta"): EntregaEstado {
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
function tituloDe(folderRel: string): string {
  const ultimo = folderRel.split("/").pop() || "";
  return ultimo.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || "Entrega";
}

// ── Resolver el enlace ─────────────────────────────────────────────────────────

export async function resolverEntrega(token: string): Promise<EntregaEstado> {
  const crudo = verifyGaleriaToken(token);
  if (!crudo) return fallo(pareceCaducado(token) ? "caducado" : "invalido");

  // La ruta viene de fuera aunque venga firmada: si alguna vez se firmó algo raro (o se cambia
  // el secreto y colisiona), normalizeGaleriaRel LANZA y aquí se muere el intento. Nunca se
  // construye una ruta absoluta con texto sin normalizar.
  let folderRel: string;
  try {
    folderRel = normalizeGaleriaRel(crudo);
  } catch {
    return fallo("invalido");
  }
  // La raíz no es una entrega: abrirla enseñaría el material de TODOS los clientes.
  if (!folderRel) return fallo("invalido");

  if (await entregaRevocada(folderRel)) return fallo("revocado");

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

// ── Revocación (AppConfig) ─────────────────────────────────────────────────────
// Una sola clave con la lista de rutas retiradas. La clave puede no existir todavía (nadie ha
// revocado nunca) y ese es el caso normal: se trata como lista vacía, no como error.

async function leerRevocadas(): Promise<Set<string>> {
  const row = await db.appConfig.findUnique({ where: { key: CLAVE_REVOCADAS } });
  const v = row?.value as { rutas?: unknown } | null;
  const rutas = v && typeof v === "object" && Array.isArray(v.rutas) ? v.rutas : [];
  return new Set(rutas.filter((r): r is string => typeof r === "string"));
}

async function guardarRevocadas(rutas: Set<string>): Promise<void> {
  const value = { rutas: [...rutas].sort() };
  await db.appConfig.upsert({
    where: { key: CLAVE_REVOCADAS },
    create: { key: CLAVE_REVOCADAS, value },
    update: { value },
  });
}

// Retira el acceso YA, sin esperar a que caduque el token: es el botón de pánico cuando un
// enlace acabó donde no debía.
//
// La lista se lee y se reescribe entera, así que dos retiradas simultáneas podrían pisarse. Se
// asume: esto lo pulsa una persona desde el panel, y el peor caso es repetir el clic.
export async function revocarEntrega(folderRel: string): Promise<void> {
  const norm = normalizeGaleriaRel(folderRel);
  if (!norm) throw new Error("Hay que decir qué entrega se retira");
  const rutas = await leerRevocadas();
  if (rutas.has(norm)) return; // ya estaba retirada: no se escribe por escribir
  rutas.add(norm);
  await guardarRevocadas(rutas);
}

// Vuelve a poner la entrega en pie. Los tokens que aún no hayan caducado sirven otra vez: la
// revocación es una llave general, no una lista negra de enlaces concretos.
export async function reactivarEntrega(folderRel: string): Promise<void> {
  const norm = normalizeGaleriaRel(folderRel);
  if (!norm) return;
  const rutas = await leerRevocadas();
  if (!rutas.delete(norm)) return;
  await guardarRevocadas(rutas);
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
    return (await leerRevocadas()).has(norm);
  } catch {
    // Si no se puede consultar la lista, se cierra. Un enlace retirado que sigue abriendo es
    // mucho peor que una sala que no abre durante un rato.
    return true;
  }
}
