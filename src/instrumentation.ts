// Next.js ejecuta register() una vez al arrancar el servidor. Lo usamos para encender el
// planificador en-proceso del sondeo de calendarios Synology (solo en el runtime Node;
// nunca en Edge ni durante el build). Va en src/ porque el proyecto usa carpeta src.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    registerProcessDiagnostics();
    const { startCalendarScheduler } = await import("@/lib/calendar-scheduler");
    startCalendarScheduler();
  }
}

// Diagnóstico de caídas del proceso. Sin esto, una promesa rechazada sin capturar mata el
// proceso Node (Node 22 sale por defecto) → el contenedor «se detiene inesperadamente» y solo
// queda un exit code sin pista de la causa. Registramos, UNA vez por proceso:
//  • unhandledRejection: se LOGUEA con detalle y NO se sale — una promesa suelta no debería
//    tumbar toda la app (mejor disponibilidad); queda en `docker logs` para arreglar la raíz.
//  • uncaughtException: el estado del proceso ya es indeterminado, así que se LOGUEA y se sale
//    con código 1 para que `restart: unless-stopped` levante un proceso limpio — pero ahora el
//    log dice EXACTAMENTE qué lo tumbó (antes era una caída muda).
function registerProcessDiagnostics(): void {
  const g = globalThis as unknown as { __labstreamProcDiag?: boolean };
  if (g.__labstreamProcDiag) return; // idempotente (sobrevive al HMR en dev)
  g.__labstreamProcDiag = true;
  process.on("unhandledRejection", (reason) => {
    console.error(`[${new Date().toISOString()}] unhandledRejection:`, reason);
  });
  process.on("uncaughtException", (err) => {
    console.error(`[${new Date().toISOString()}] uncaughtException:`, err);
    process.exit(1);
  });
}
