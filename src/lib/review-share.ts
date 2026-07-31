// ── El texto con el que se le mandan los enlaces al cliente ────────────────────
// Vive aparte y SIN nada de servidor a propósito: lo usan las acciones que envían de verdad
// (revisiones/bulk-actions.ts) y también la ventana que enseña la vista previa antes de mandar.
// Si el texto viviera solo en la acción, la previa sería una copia a mano y con el primer
// retoque empezaría a mentir — que es justo lo que no puede pasar cuando enseñas al usuario
// «esto es lo que le va a llegar a tu cliente».

export type PiezaCompartida = { titulo: string; proyecto: string; url: string };

// Nombre del proyecto SOLO si todas las piezas son del mismo: con varios, cada línea lo dice.
export function proyectoComun(piezas: { proyecto: string }[]): string | null {
  const nombres = new Set(piezas.map((p) => p.proyecto));
  return nombres.size === 1 ? (piezas[0]?.proyecto ?? null) : null;
}

export function textoWhatsapp(piezas: PiezaCompartida[], nota?: string): string {
  const unProyecto = proyectoComun(piezas);
  const limpia = (nota ?? "").trim();
  const cabecera =
    piezas.length === 1
      ? `Hola 👋 Te comparto «${piezas[0].titulo}»${unProyecto ? ` de «${unProyecto}»` : ""} para tu revisión.`
      : `Hola 👋 Te comparto ${piezas.length} piezas${unProyecto ? ` de «${unProyecto}»` : ""} para tu revisión.`;
  const cuerpo = piezas
    .map((p) => `• ${p.titulo}${unProyecto ? "" : ` (${p.proyecto})`}\n${p.url}`)
    .join("\n\n");
  return `${cabecera}\n\n${cuerpo}${limpia ? `\n\n${limpia}` : ""}`;
}

// Versión en texto plano del correo (la que también se usa de vista previa: el HTML dice lo
// mismo con formato, y una previa con etiquetas no le sirve a nadie).
export function textoCorreo(piezas: PiezaCompartida[], deQuien: string, nota?: string): string {
  const limpia = (nota ?? "").trim();
  return `${deQuien} te comparte ${piezas.length === 1 ? "una pieza" : `${piezas.length} piezas`} para revisión:\n\n${piezas
    .map((p) => `${p.titulo}: ${p.url}`)
    .join("\n")}${limpia ? `\n\n${limpia}` : ""}`;
}

export function asuntoCorreo(piezas: PiezaCompartida[]): string {
  const unProyecto = proyectoComun(piezas);
  return piezas.length === 1
    ? `Revisión: ${piezas[0].titulo}`
    : `Revisión: ${piezas.length} piezas${unProyecto ? ` de ${unProyecto}` : ""}`;
}
