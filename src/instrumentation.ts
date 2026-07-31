// Next.js ejecuta register() una vez al arrancar el servidor. Lo usamos para encender el
// planificador en-proceso del sondeo de calendarios Synology (solo en el runtime Node;
// nunca en Edge ni durante el build). Va en src/ porque el proyecto usa carpeta src.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    registerProcessDiagnostics();
    const { startCalendarScheduler } = await import("@/lib/calendar-scheduler");
    startCalendarScheduler();
    // Aviso diario de cartera (Siigo): facturas por vencer y recién vencidas.
    const { startCarteraScheduler } = await import("@/lib/cartera-scheduler");
    startCarteraScheduler();
  }
}

// Cuántas veces se ha sobrevivido a una desconexión de cliente que ANTES tumbaba el proceso.
// Lo publica /api/health para poder comprobarlo sin entrar al NAS.
export function clientAbortCount(): number {
  return (globalThis as unknown as { __labstreamAborts?: number }).__labstreamAborts ?? 0;
}

// ── El cliente se fue a mitad de una respuesta ──
// Un <video> que salta de segundo, una pestaña que se cierra con el chat en vivo abierto, una
// descarga cancelada: todos cortan la conexión mientras el servidor aún está escribiendo. El
// runtime de Next lanza entonces «Invalid state: Controller is already closed» DESDE DENTRO de
// su propio bombeo de streams — fuera del alcance de cualquier try/catch nuestro (los de las
// rutas SSE y de archivos están puestos y aun así no lo atrapan).
//
// Esa excepción NO deja el proceso en estado indeterminado: solo dice que ya no hay nadie
// al otro lado. Matar la app por eso convertía la desconexión de UNA persona en una caída para
// TODAS —y se llevaba por delante las conexiones de chat, la cola de copias de revisión y el
// token de Google—. En el NAS costó 108 reinicios.
function isClientGone(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? "";
  if (code === "ERR_INVALID_STATE" || code === "ERR_STREAM_PREMATURE_CLOSE" || code === "ERR_STREAM_DESTROYED" || code === "ECONNRESET" || code === "EPIPE") return true;
  return /Controller is already closed|ReadableStream is already closed|premature close/i.test(e?.message ?? "");
}

// Diagnóstico de caídas del proceso. Sin esto, una promesa rechazada sin capturar mata el
// proceso Node (Node 22 sale por defecto) → el contenedor «se detiene inesperadamente» y solo
// queda un exit code sin pista de la causa. Registramos, UNA vez por proceso:
//  • unhandledRejection: se LOGUEA con detalle y NO se sale — una promesa suelta no debería
//    tumbar toda la app (mejor disponibilidad); queda en `docker logs` para arreglar la raíz.
//  • uncaughtException por desconexión de cliente: se CUENTA y se sigue (ver arriba).
//  • cualquier otra uncaughtException: el estado del proceso sí es indeterminado, así que se
//    LOGUEA y se sale con 1 para que `restart: unless-stopped` levante un proceso limpio —
//    con el log diciendo EXACTAMENTE qué lo tumbó.
function registerProcessDiagnostics(): void {
  const g = globalThis as unknown as { __labstreamProcDiag?: boolean; __labstreamAborts?: number };
  if (g.__labstreamProcDiag) return; // idempotente (sobrevive al HMR en dev)
  g.__labstreamProcDiag = true;
  process.on("unhandledRejection", (reason) => {
    console.error(`[${new Date().toISOString()}] unhandledRejection:`, reason);
  });
  process.on("uncaughtException", (err) => {
    if (isClientGone(err)) {
      g.__labstreamAborts = (g.__labstreamAborts ?? 0) + 1;
      // Sin la traza entera: son ruidosas y se repiten. La cuenta va también en /api/health.
      console.warn(`[${new Date().toISOString()}] cliente desconectado a mitad de una respuesta (${g.__labstreamAborts}); el proceso sigue: ${(err as Error)?.message ?? err}`);
      return;
    }
    console.error(`[${new Date().toISOString()}] uncaughtException:`, err);
    process.exit(1);
  });
}
