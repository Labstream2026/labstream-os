// Next.js ejecuta register() una vez al arrancar el servidor. Lo usamos para encender el
// planificador en-proceso del sondeo de calendarios Synology (solo en el runtime Node;
// nunca en Edge ni durante el build). Va en src/ porque el proyecto usa carpeta src.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCalendarScheduler } = await import("@/lib/calendar-scheduler");
    startCalendarScheduler();
  }
}
