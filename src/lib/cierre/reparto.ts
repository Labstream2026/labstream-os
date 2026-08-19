// ── El reparto sugerido del cierre del día (lógica PURA) ─────────────────────
//
// El problema: el sensor sabe CUÁNTO trabajaste (horas efectivas) pero el parte de horas
// exige saber EN QUÉ TAREA. Este módulo propone el puente: toma lo que falta por anotar y
// lo reparte entre las tareas del día usando las dos pistas que el sensor sí tiene —
// a qué CUENTA (cliente) se atribuyó cada bloque y qué PROYECTO estaba abierto en el
// programa de edición (título de la ventana de Resolve/Premiere/AE).
//
// Reglas, en orden de confianza:
//   1. Proyecto de edición ↔ nombre del proyecto de la tarea (la pista más fina).
//   2. Cuenta del bloque ↔ cliente del proyecto de la tarea.
//   3. Dentro de un mismo cliente, gana la tarea completada HOY; si no hay, la de
//      entrega más próxima. Trabajar el día de la entrega es la norma del estudio.
//
// Es una SUGERENCIA: la persona siempre puede corregir antes de anotar. Por eso cada
// propuesta lleva su `motivo` — una sugerencia sin explicación no se puede corregir
// con criterio, solo aceptar a ciegas.

export type TareaCierre = {
  id: string;
  /** Cliente del proyecto de la tarea (null = tarea personal o proyecto sin cliente). */
  clientId: string | null;
  /** Nombre del proyecto, para casarlo con el título del programa de edición. */
  proyectoNombre: string | null;
  completadaHoy: boolean;
  /** Fecha de entrega (ms) para desempatar; null = sin fecha (pierde el desempate). */
  venceMs: number | null;
};

export type PistaCuenta = { clientId: string | null; seg: number };
export type PistaEdicion = { proyecto: string; seg: number };

export type Sugerencia = { taskId: string; minutos: number; motivo: string };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// ¿El proyecto abierto en el editor "suena" al proyecto de la tarea? Contención en ambos
// sentidos tras normalizar: «Reel Agosto» casa con «Reel agosto — Bancolombia» y al revés.
export function casaProyecto(edicion: string, proyectoTarea: string | null): boolean {
  if (!proyectoTarea) return false;
  const a = norm(edicion);
  const b = norm(proyectoTarea);
  if (a.length < 4 || b.length < 4) return a === b; // nombres cortos: solo igualdad exacta
  return a.includes(b) || b.includes(a);
}

// La mejor tarea de un grupo: completada hoy > entrega más próxima > la primera.
function mejor(tareas: TareaCierre[]): TareaCierre | null {
  if (tareas.length === 0) return null;
  const hechas = tareas.filter((t) => t.completadaHoy);
  const pool = hechas.length > 0 ? hechas : tareas;
  return [...pool].sort((a, b) => (a.venceMs ?? Infinity) - (b.venceMs ?? Infinity))[0];
}

// Redondea a bloques de 5 min sin perder el total: la deriva cae en la sugerencia más grande.
function aBloques(sugeridos: Map<string, { seg: number; motivo: string }>, topeMin: number): Sugerencia[] {
  const totalSeg = [...sugeridos.values()].reduce((s, x) => s + x.seg, 0);
  if (totalSeg <= 0 || topeMin <= 0) return [];
  // Si lo atribuido supera lo que falta por anotar, se escala a proporción (el sensor pudo
  // medir más de lo que queda: parte del día ya se anotó con el cronómetro).
  const factor = Math.min(1, (topeMin * 60) / totalSeg);
  const filas = [...sugeridos.entries()]
    .map(([taskId, x]) => ({ taskId, minutos: Math.round((x.seg * factor) / 60 / 5) * 5, motivo: x.motivo }))
    .filter((f) => f.minutos >= 5)
    .sort((a, b) => b.minutos - a.minutos);
  // Tras el redondeo el total puede pasarse del tope: se recorta de la más grande.
  let suma = filas.reduce((s, f) => s + f.minutos, 0);
  const topeBloques = Math.floor(topeMin / 5) * 5;
  if (filas.length > 0 && suma > topeBloques) {
    filas[0].minutos -= suma - topeBloques;
    if (filas[0].minutos < 5) filas.shift();
  }
  return filas;
}

export function repartirCierre(opts: {
  /** Minutos que el sensor midió y AÚN no están anotados (ya restado lo del cronómetro). */
  restanteMin: number;
  cuentas: PistaCuenta[];
  edicion: PistaEdicion[];
  tareas: TareaCierre[];
  /** Nombre visible de cada cliente, para el motivo («trabajaste 3,1 h en Bancolombia»). */
  nombreCliente: Map<string, string>;
}): Sugerencia[] {
  const { restanteMin, cuentas, edicion, tareas, nombreCliente } = opts;
  if (restanteMin <= 0 || tareas.length === 0) return [];

  const horas = (seg: number) => `${(seg / 3600).toFixed(1).replace(".", ",")} h`;
  const sugeridos = new Map<string, { seg: number; motivo: string }>();
  const sumar = (t: TareaCierre, seg: number, motivo: string) => {
    const cur = sugeridos.get(t.id);
    // El primer motivo gana (la pista de edición llega antes y es la más fina).
    sugeridos.set(t.id, { seg: (cur?.seg ?? 0) + seg, motivo: cur?.motivo ?? motivo });
  };

  // 1) Pista fina: el proyecto abierto en el editor casa con el proyecto de una tarea.
  //    Ese tiempo queda RESERVADO: no se vuelve a repartir por cuenta.
  const segPorCliente = new Map<string | null, number>();
  for (const c of cuentas) segPorCliente.set(c.clientId, (segPorCliente.get(c.clientId) ?? 0) + c.seg);

  for (const e of edicion) {
    const candidatas = tareas.filter((t) => casaProyecto(e.proyecto, t.proyectoNombre));
    const t = mejor(candidatas);
    if (!t) continue;
    sumar(t, e.seg, `abriste «${e.proyecto}» en el editor (${horas(e.seg)})`);
    // La edición ya viene contada dentro de la cuenta del cliente: se descuenta para no
    // sugerir el mismo tiempo dos veces.
    if (t.clientId !== null && segPorCliente.has(t.clientId)) {
      segPorCliente.set(t.clientId, Math.max(0, (segPorCliente.get(t.clientId) ?? 0) - e.seg));
    }
  }

  // 2) Pista por cuenta: lo que quedó de cada cliente va a su mejor tarea.
  for (const [clientId, seg] of segPorCliente) {
    if (seg <= 0 || clientId === null) continue; // «Sin atribuir» no sugiere: lo decide la persona
    const t = mejor(tareas.filter((x) => x.clientId === clientId));
    if (!t) continue;
    sumar(t, seg, `trabajaste ${horas(seg)} en la cuenta ${nombreCliente.get(clientId) ?? "del cliente"}`);
  }

  return aBloques(sugeridos, restanteMin);
}
