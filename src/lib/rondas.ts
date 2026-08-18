// ── Rondas de cambios del cliente ───────────────────────────────────────────
// Una RONDA es un ciclo completo «te mandé una versión → me pediste cambios». Las propuestas
// venden «hasta 4 rondas de ajustes» y hasta ahora nadie llevaba la cuenta: cuando alguien se
// daba cuenta de que una pieza iba por la sexta, el proyecto ya estaba en pérdida y no quedaba
// con qué cobrar el exceso.
//
// No hay columna nueva que mantener: la ronda se DERIVA de lo que ya se guarda. Cada vez que
// el cliente pide cambios se escribe una DeliverableDecision (stage=CLIENTE, result=CAMBIOS),
// tanto desde la sala pública como desde el panel interno. Contar esas decisiones ES contar
// las rondas. Las decisiones INTERNAS no cuentan: revisar en casa cuantas veces haga falta no
// se le cobra a nadie.

/** Tope pactado con el cliente. Null = no se acordó ninguno. */
export type Tope = number | null;

export type EstadoRonda = {
  /** Cuántas rondas de cambios lleva la pieza. 0 = el cliente aún no ha pedido nada. */
  ronda: number;
  tope: Tope;
  /** Rondas por encima de lo pactado (0 si va dentro o si no hay tope). */
  extra: number;
  /** Cómo pintarlo: sin tope · dentro · última incluida · pasado. */
  tono: "neutro" | "ok" | "aviso" | "excedido";
  /** Texto ya armado para el chip. Null = no hay nada que enseñar todavía. */
  texto: string | null;
};

/**
 * El estado de rondas de UNA pieza. Es una función pura a propósito: la decisión de qué
 * enseñar y de qué color no debería depender de a qué pantalla la llames.
 */
export function estadoRonda(rondas: number, tope: Tope): EstadoRonda {
  const ronda = Math.max(0, Math.trunc(rondas));
  const limpio: Tope = tope === null || !Number.isFinite(tope) || tope <= 0 ? null : Math.trunc(tope);

  // Sin cambios pedidos todavía no hay nada que contar: un chip «Ronda 0» solo sería ruido.
  if (ronda === 0) return { ronda: 0, tope: limpio, extra: 0, tono: "neutro", texto: null };

  if (limpio === null) {
    return { ronda, tope: null, extra: 0, tono: "neutro", texto: `Ronda ${ronda}` };
  }

  const extra = Math.max(0, ronda - limpio);
  if (extra > 0) {
    const cobrable = extra === 1 ? "1 por cobrar" : `${extra} por cobrar`;
    return { ronda, tope: limpio, extra, tono: "excedido", texto: `Ronda ${ronda} de ${limpio} · ${cobrable}` };
  }
  // En la última incluida conviene avisar ANTES de pasarse, que es cuando aún se puede hablar
  // con el cliente en vez de reclamarle después.
  const tono = ronda === limpio ? "aviso" : "ok";
  return { ronda, tope: limpio, extra: 0, tono, texto: `Ronda ${ronda} de ${limpio}` };
}

/** Suma de rondas por encima de lo pactado en un conjunto de piezas (para Reportes). */
export function extrasDe(piezas: { rondas: number; tope: Tope }[]): number {
  return piezas.reduce((s, p) => s + estadoRonda(p.rondas, p.tope).extra, 0);
}

/**
 * ¿Esta decisión que se acaba de guardar deja la pieza fuera de lo pactado? Se usa para avisar
 * UNA sola vez, justo al cruzar el tope, y no en cada ronda posterior.
 */
export function acabaDeExcederse(rondasDespues: number, tope: Tope): boolean {
  const a = estadoRonda(rondasDespues - 1, tope);
  const b = estadoRonda(rondasDespues, tope);
  return b.extra > 0 && a.extra === 0;
}
