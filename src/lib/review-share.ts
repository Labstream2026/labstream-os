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

// ── La versión BONITA del correo de revisión ────────────────────────────────
// Tarjeta por pieza con su botón «Ver y comentar»: estilos EN LÍNEA y tablas, porque los
// clientes de correo no cargan CSS externo ni respetan flexbox. Dice lo MISMO que la versión
// de texto (textoCorreo) — la previa no miente.
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function htmlCorreoRevision(piezas: PiezaCompartida[], deQuien: string, nota?: string): string {
  const unProyecto = proyectoComun(piezas);
  const limpia = (nota ?? "").trim();
  const tarjetas = piezas
    .map(
      (p) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:12px;border-collapse:separate;margin:0 0 10px">
    <tr><td style="padding:16px 18px">
      <p style="margin:0;font-size:15px;font-weight:bold;color:#18181b">🎬 ${escHtml(p.titulo)}</p>
      <p style="margin:4px 0 14px;color:#71717a;font-size:12.5px">${escHtml(p.proyecto)}</p>
      <a href="${p.url}" style="display:inline-block;background:#18181b;color:#ffffff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13.5px">▶&nbsp; Ver y comentar</a>
    </td></tr>
  </table>`,
    )
    .join("");
  return `
<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;color:#18181b;font-size:14px;line-height:1.55">
  <p style="margin:0 0 10px">Hola,</p>
  <p style="margin:0 0 14px"><b>${escHtml(deQuien)}</b> te comparte ${piezas.length === 1 ? "esta pieza" : `estas ${piezas.length} piezas`}${unProyecto ? ` de <b>${escHtml(unProyecto)}</b>` : ""} para tu revisión.</p>
  ${limpia ? `<p style="margin:0 0 14px;padding:10px 14px;background:#f4f4f5;border-radius:8px;color:#3f3f46">${escHtml(limpia)}</p>` : ""}
  ${tarjetas}
  <p style="margin:10px 0 0;color:#71717a;font-size:12px">Puedes aprobar o pedir cambios directo desde el enlace — sin crear cuenta.</p>
</div>`;
}
