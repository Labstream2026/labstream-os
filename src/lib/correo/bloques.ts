// ── BLOQUES y PLANTILLAS del redactor de correo ─────────────────────────────
// HTML a prueba de clientes de correo: estilos EN LÍNEA, tablas para lo estructural, cero
// clases. Es lo que el menú «Bloques» inserta al caret y la base de las plantillas de
// fábrica. Vive aparte (puro) para poder probarse y para que el compositor lo importe sin
// arrastrar nada de servidor.

const INK = "#18181b";
const MUTED = "#71717a";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Botón CTA: el «Ver video», «Aprobar aquí», «Agendar llamada» de todo correo que convierte. */
export function bloqueBoton(texto: string, url: string): string {
  return `<p style="margin:14px 0"><a href="${esc(url)}" style="display:inline-block;background:${INK};color:#ffffff;padding:11px 26px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">${esc(texto)}</a></p>`;
}

/** Separador suave entre secciones del correo. */
export function bloqueSeparador(): string {
  return `<hr style="border:0 solid #e4e4e7;border-top:1px solid #e4e4e7;margin:18px 0">`;
}

/** Caja destacada: «lo importante» (fechas, condiciones, el punto que no se puede perder). */
export function bloqueCaja(texto = "Lo importante va aquí."): string {
  return `<div style="background:#f4f4f5;border-left:3px solid ${INK};border-radius:8px;padding:12px 16px;margin:14px 0">${esc(texto)}</div>`;
}

/** Tarjeta de enlace: título + descripción + botón — para compartir una pieza, carpeta o página. */
export function bloqueTarjeta(titulo: string, url: string, nota?: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:12px;border-collapse:separate;margin:14px 0"><tbody><tr><td style="padding:16px 18px"><p style="margin:0;font-size:15px;font-weight:bold;color:${INK}">${esc(titulo)}</p>${nota ? `<p style="margin:4px 0 0;color:${MUTED};font-size:13px">${esc(nota)}</p>` : ""}<p style="margin:12px 0 0"><a href="${esc(url)}" style="display:inline-block;background:${INK};color:#ffffff;padding:9px 22px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px">Abrir&nbsp;→</a></p></td></tr></tbody></table>`;
}

// ── Plantillas de FÁBRICA ───────────────────────────────────────────────────
// Los tres correos que un estudio manda todas las semanas, ya bien armados: se aplican y se
// EDITA el texto (nada de motores de variables — lo simple se usa; lo complejo se abandona).
export type PlantillaBase = { key: string; nombre: string; html: string };

export const PLANTILLAS_BASE: PlantillaBase[] = [
  {
    key: "entrega",
    nombre: "🎬 Entrega de pieza",
    html:
      `<h2 style="margin:0 0 10px;font-size:18px">¡Tu video está listo! 🎉</h2>` +
      `<p>Hola,</p><p>Terminamos <b>«Nombre de la pieza»</b> y quedó como lo hablamos. Puedes verlo y dejarnos tus comentarios directamente en el enlace:</p>` +
      bloqueTarjeta("Nombre de la pieza — v1", "https://", "Puedes aprobar o pedir cambios desde el mismo enlace, sin crear cuenta.") +
      bloqueCaja("Esta versión incluye 2 rondas de ajustes. La primera corre desde hoy.") +
      `<p>Cualquier cosa nos escribes por aquí mismo. 🙌</p>`,
  },
  {
    key: "seguimiento",
    nombre: "👋 Seguimiento amable",
    html:
      `<p>Hola,</p><p>Pasamos a saludarte 👋 — hace unos días te compartimos <b>«Nombre de la pieza»</b> y queremos saber qué te pareció.</p>` +
      `<p>Si ya la viste, con un clic nos dices si va o si le ajustamos algo:</p>` +
      bloqueBoton("Ver y comentar", "https://") +
      `<p style="color:${MUTED};font-size:13px">Si necesitas más tiempo, todo bien — solo cuéntanos para reorganizar el calendario.</p>`,
  },
  {
    key: "gracias",
    nombre: "💚 Cierre y gracias",
    html:
      `<h2 style="margin:0 0 10px;font-size:18px">¡Gracias por trabajar con nosotros!</h2>` +
      `<p>Hola,</p><p>Con la entrega de <b>«Nombre del proyecto»</b> cerramos este ciclo. Fue un gusto — el resultado quedó para mostrar. 🙌</p>` +
      bloqueSeparador() +
      `<p>Te dejamos la carpeta final con todo el material en calidad de entrega:</p>` +
      bloqueTarjeta("Material final del proyecto", "https://", "Descárgalo y guárdalo donde prefieras: el enlace estará activo 30 días.") +
      `<p>Cuando venga el próximo proyecto, ya sabes dónde encontrarnos. 💚</p>`,
  },
];
