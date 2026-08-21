"use client";

// ── Cola de acciones OFFLINE (IndexedDB) ──
// Fase 1 del modo offline (Camino B). Guarda en el propio equipo las escrituras SEGURAS que se
// hacen sin servidor, para reenviarlas EN ORDEN cuando vuelva. Sin dependencias externas.
//
// Idempotencia: cada op lleva un `opId` que ES su clave de reintento. Reenviarla nunca duplica,
// porque el endpoint destino hace UPSERT por esa clave (una nota se upserta por su id → el opId
// es `note-save:<id>`). Además, guardar la MISMA op otra vez (mismo opId) SOBREESCRIBE la
// anterior: mientras se edita una nota sin conexión, la cola guarda una sola entrada con el
// último contenido, no una por tecla.
//
// Qué va aquí, a propósito: SOLO acciones que SUMAN y casi nunca chocan (crear/guardar nota,
// comentario, horas, nueva tarea, marcar hecho). Editar algo compartido o mover algo que otro
// movió NO se encola: eso necesita al servidor para no pisar trabajo ajeno. Ese límite es lo que
// evita el escenario que el diseño anterior temía —perder trabajo por un conflicto silencioso—.

export type OpOffline = {
  opId: string; // clave única e idempotente (p. ej. "note-save:<noteId>")
  kind: string; // "note-save" | … — para la UI y el enrutado de la Fase 2
  endpoint: string; // a dónde se reenvía (POST JSON, mismo origen)
  body: unknown; // el cuerpo tal cual
  createdAt: number; // orden FIFO de reenvío
  etiqueta?: string; // texto para la UI («Nota: Reunión con Diana»)
};

const DB = "labstream-offline";
const STORE = "ops";
let dbp: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "opId" });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbp;
}

function tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return abrir().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const t = d.transaction(STORE, modo);
        const r = fn(t.objectStore(STORE));
        r.onsuccess = () => res(r.result as T);
        r.onerror = () => rej(r.error);
      }),
  );
}

// Aviso de cambios de la cola: la UI (contador «pendientes») y el motor de sync se enteran sin
// sondear. Es en memoria, por pestaña; entre pestañas basta el reintento periódico del motor.
const oyentes = new Set<() => void>();
export function alCambiarCola(cb: () => void): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}
function avisar() {
  for (const cb of oyentes) cb();
}

export async function encolar(op: OpOffline): Promise<void> {
  await tx("readwrite", (s) => s.put(op));
  avisar();
}

export async function pendientes(): Promise<OpOffline[]> {
  const todas = await tx<OpOffline[]>("readonly", (s) => s.getAll());
  return (todas ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

export async function quitar(opId: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(opId));
  avisar();
}

export async function contarPendientes(): Promise<number> {
  return tx<number>("readonly", (s) => s.count());
}
