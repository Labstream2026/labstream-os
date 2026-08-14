"use client";

// ── Puente con el sensor de la app de escritorio ──
// El sensor vive en el proceso Rust de la app y solo se le habla por eventos Tauri. Aquí están
// las dos conversaciones, ambas con ESPERA ACOTADA y con respuesta obligatoria:
//
//   · entregarToken   → «toma este token»  ... el sensor responde `ls-tracker-listo`
//   · consultarSensor → «¿cómo estás?»     ... el sensor responde `ls-tracker-estado`
//
// Que la respuesta sea obligatoria es el punto. Antes se emitía el token a ciegas y se daba
// por bueno: en una app anterior a la 1.8.0 —que no trae sensor— nadie recogía nada y la
// pantalla igual cantaba «equipo vinculado», dejando un equipo registrado que jamás reporta.
// Si nadie contesta dentro del plazo, aquí se sabe, y quien llama puede deshacer y avisar.

type Evt = {
  emit: (name: string, payload?: unknown) => Promise<void>;
  listen?: (name: string, cb: (e: { payload: unknown }) => void) => Promise<() => void>;
};

export type EstadoSensor = { vinculado: boolean; pausado: boolean; version: string };

function evento(): Evt | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __TAURI__?: { event?: Evt } }).__TAURI__?.event ?? null;
}

/** ¿Esto corre dentro de la app de escritorio? (En el navegador no hay Tauri.) */
export function enAppEscritorio(): boolean {
  return !!evento();
}

/**
 * Emite `pedir` y espera `responder` hasta `ms`. null = nadie contestó, que es exactamente lo
 * que pasa con una app vieja. El listener se registra ANTES de emitir: al revés, una respuesta
 * rápida llegaría antes de que nadie la escuche y el plazo vencería sin motivo.
 */
async function conversar<T>(pedir: string, responder: string, ms: number, payload?: unknown): Promise<T | null> {
  const ev = evento();
  if (!ev?.listen) return null;
  // El apagador va dentro de un objeto: asignarlo desde un callback y leerlo en el `finally`
  // confunde al análisis de flujo de TypeScript si es una variable suelta.
  const ref: { apagar: (() => void) | null; cerrado: boolean } = { apagar: null, cerrado: false };
  try {
    return await new Promise<T | null>((resolve) => {
      const terminar = (v: T | null) => {
        ref.cerrado = true;
        resolve(v);
      };
      const plazo = setTimeout(() => terminar(null), ms);
      ev.listen!(responder, (e) => {
        clearTimeout(plazo);
        terminar((e?.payload ?? {}) as T);
      })
        .then((off) => {
          // Si el plazo ya venció (app vieja: nunca contesta), el listener se registró tarde
          // y hay que apagarlo aquí mismo — si no, cada carga de página deja uno colgado.
          if (ref.cerrado) { off(); return; }
          ref.apagar = off;
          return ev.emit(pedir, payload);
        })
        .catch(() => {
          clearTimeout(plazo);
          terminar(null);
        });
    });
  } finally {
    ref.apagar?.();
  }
}

/** Entrega el token al sensor. false = nadie lo recogió (app sin sensor). */
export async function entregarToken(token: string, ms = 5000): Promise<boolean> {
  const r = await conversar<{ ok?: boolean }>("ls-tracker-token", "ls-tracker-listo", ms, { token });
  return r !== null;
}

/** Cómo está ESTE equipo. null = la app no trae sensor, o no es la app de escritorio. */
export function consultarSensor(ms = 2500): Promise<EstadoSensor | null> {
  return conversar<EstadoSensor>("ls-tracker-consulta", "ls-tracker-estado", ms);
}
