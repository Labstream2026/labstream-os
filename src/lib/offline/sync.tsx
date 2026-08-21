"use client";

import * as React from "react";
import { alCambiarCola, contarPendientes, pendientes, quitar } from "./cola";

// ── Motor de sincronización de la cola offline ──
// Vacía la cola EN ORDEN cuando el servidor responde. Comparte la señal de vida con SinConexion
// (ping a /api/health): no se fía de `navigator.onLine` porque el caso típico aquí es «internet
// bien, NAS caído». Expone el número de pendientes y el estado a la UI por contexto.
//
// Reglas de reintento por respuesta:
//   · 2xx           → hecho, se saca de la cola.
//   · 4xx (no 408/429) → rechazo PERMANENTE (sesión, permiso, conflicto): reintentar no ayuda;
//                     se saca para no atascar la cola y se marca «error» para avisar.
//   · 5xx / timeout / red → el servidor está mal; se PARA y se reintenta luego (nada se pierde).

type Estado = "idle" | "sincronizando" | "error";
type Fallo = { etiqueta?: string; motivo?: string };
type Ctx = { pendientes: number; estado: Estado; fallo: Fallo | null; sincronizarAhora: () => void };

const OfflineCtx = React.createContext<Ctx>({ pendientes: 0, estado: "idle", fallo: null, sincronizarAhora: () => {} });
export function useOffline(): Ctx {
  return React.useContext(OfflineCtx);
}

async function servidorVivo(): Promise<boolean> {
  try {
    const r = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(6000) });
    return r.ok;
  } catch {
    return false;
  }
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [num, setNum] = React.useState(0);
  const [estado, setEstado] = React.useState<Estado>("idle");
  const [fallo, setFallo] = React.useState<Fallo | null>(null);
  const corriendo = React.useRef(false);

  const flush = React.useCallback(async () => {
    if (corriendo.current) return;
    const cola = await pendientes();
    if (!cola.length) {
      setNum(0);
      return; // cola vacía: ni se pregunta al servidor (no gastar el ping que tratamos de ahorrar)
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return; // sin tarjeta de red, ni se intenta
    if (!(await servidorVivo())) return; // NAS caído: se espera al próximo latido

    corriendo.current = true;
    setEstado("sincronizando");
    let ultimoFallo: Fallo | null = null;
    try {
      for (const op of cola) {
        let r: Response;
        try {
          r = await fetch(op.endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(op.body),
            cache: "no-store",
          });
        } catch {
          break; // se cortó a mitad del vaciado: el resto espera al próximo intento
        }
        if (r.ok) {
          await quitar(op.opId);
          continue;
        }
        if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) {
          // Rechazo permanente (sesión, permiso, conflicto, token caducado): reintentar no lo
          // arregla. Se saca para no atascar la cola y se GUARDA el motivo (con la etiqueta de la
          // op) para poder decir QUÉ no se pudo sincronizar, en vez de un error genérico.
          let motivo: string | undefined;
          try {
            const j = (await r.json()) as { error?: string };
            motivo = j?.error;
          } catch {
            /* sin cuerpo legible */
          }
          ultimoFallo = { etiqueta: op.etiqueta, motivo };
          await quitar(op.opId);
          continue;
        }
        break; // 5xx / 408 / 429: el servidor está mal; se reintenta luego sin perder nada
      }
    } finally {
      corriendo.current = false;
      const quedan = await contarPendientes();
      setNum(quedan);
      setFallo(ultimoFallo);
      setEstado(ultimoFallo ? "error" : "idle");
    }
  }, []);

  React.useEffect(() => {
    void contarPendientes().then(setNum);
    const alVolver = () => void flush();
    // Un cambio en la cola (algo se encoló o se sincronizó) refresca el contador e intenta vaciar.
    const desItr = alCambiarCola(() => {
      void contarPendientes().then(setNum);
      void flush();
    });
    window.addEventListener("online", alVolver);
    // El primer intento se difiere un tic para no llamar a setState de forma síncrona dentro del
    // efecto (regla del repo). Vacía la cola que quedó de una sesión anterior en cuanto monta.
    const inicial = setTimeout(() => void flush(), 0);
    // Reintento periódico MIENTRAS haya cola: cubre el caso del servidor que vuelve sin evento
    // «online» (el NAS que resucita con la misma red). Si la cola está vacía, flush() sale sin
    // pinguear, así que esto no gasta datos en reposo.
    const t = setInterval(() => void flush(), 15000);
    return () => {
      window.removeEventListener("online", alVolver);
      desItr();
      clearTimeout(inicial);
      clearInterval(t);
    };
  }, [flush]);

  const ctx = React.useMemo<Ctx>(
    () => ({ pendientes: num, estado, fallo, sincronizarAhora: () => void flush() }),
    [num, estado, fallo, flush],
  );
  return <OfflineCtx.Provider value={ctx}>{children}</OfflineCtx.Provider>;
}
