// ── Documento formal de la propuesta (versión de solo TEXTO) ──
// Muchas empresas piden «solo el texto» para adjuntar por correo o pasar a su área jurídica.
// Este generador arma, a partir de los MISMOS bloques de la propuesta, un documento sobrio
// (objeto, alcance, entregables, cronograma, inversión, condiciones y firma). Es la ÚNICA
// fuente de verdad: la ruta de Word (.doc) y la página de PDF renderizan lo que sale de aquí.
//
// Todo va con estilos EN LÍNEA a propósito: así se ve igual en el navegador (para imprimir a
// PDF) y dentro de Word/Google Docs (que ignora hojas de estilo externas pero respeta lo inline).

import type { Block, Brand } from "./types";
import { clientTotals } from "./budget";
import { formatMoney } from "@/lib/ui";

export type DatosDocumento = {
  brand: Brand;
  blocks: Block[];
  code: string;
  title: string;
  clientName?: string | null;
  fecha: string; // ya formateada (hora de Bogotá) — no se lee el reloj aquí
  validez: string; // «15 días», «hasta el 5 de septiembre»…
};

const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// Texto plano desde un cuerpo con HTML simple (los bloques «texto» guardan HTML).
const plano = (html: unknown): string =>
  String(html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : v == null ? d : String(v));
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const firstOf = (blocks: Block[], type: string): Block | undefined => blocks.find((b) => b.type === type);

// ── Secciones ───────────────────────────────────────────────────────────────
function seccionObjeto(blocks: Block[], title: string): string {
  const hero = firstOf(blocks, "hero");
  const texto = firstOf(blocks, "text");
  const base = str(hero?.subtitle) || str(hero?.intro) || plano(texto?.body) || `Propuesta ${title}.`;
  return `<p style="margin:.4rem 0">La presente propuesta detalla el alcance, los entregables y la inversión del servicio <b>${esc(title)}</b>. ${esc(base)}</p>`;
}

function seccionAlcance(blocks: Block[]): string | null {
  const puntos: string[] = [];
  // Tarjetas «qué incluye / cómo lo hacemos»: «Título: descripción».
  for (const b of blocks.filter((x) => x.type === "cards")) {
    for (const it of arr<{ t?: string; d?: string }>(b.items)) {
      const t = str(it.t).trim();
      const d = str(it.d).trim();
      if (t || d) puntos.push(t && d ? `<b>${esc(t)}:</b> ${esc(d)}` : esc(t || d));
    }
  }
  // Listas de ✓ (alcance del servicio).
  for (const b of blocks.filter((x) => x.type === "checks")) {
    for (const it of arr<string>(b.items)) if (str(it).trim()) puntos.push(esc(str(it)));
  }
  if (!puntos.length) return null;
  return `<ul style="margin:.4rem 0;padding-left:1.1rem">${puntos.map((p) => `<li style="margin:.2rem 0">${p}</li>`).join("")}</ul>`;
}

function seccionEntregables(blocks: Block[], accent: string): string | null {
  const b = firstOf(blocks, "entregables");
  const items = arr<{ q?: string; t?: string; d?: string }>(b?.items).filter((it) => str(it.t).trim() || str(it.q).trim());
  if (!items.length) return null;
  const filas = items
    .map(
      (it) =>
        `<tr>
          <td style="padding:.35rem .4rem;border-bottom:1px solid #eee;vertical-align:top;width:52px;font-weight:700;color:${esc(accent)};font-variant-numeric:tabular-nums">${esc(it.q)}</td>
          <td style="padding:.35rem .4rem;border-bottom:1px solid #eee;vertical-align:top"><b>${esc(it.t)}</b>${str(it.d).trim() ? `<br><span style="color:#555">${esc(it.d)}</span>` : ""}</td>
        </tr>`,
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin:.4rem 0;font-size:.92em">${filas}</table>`;
}

function seccionCronograma(blocks: Block[]): string | null {
  const b = firstOf(blocks, "timeline");
  const steps = arr<{ phase?: string; dur?: string; desc?: string }>(b?.steps).filter((s) => str(s.phase).trim() || str(s.desc).trim());
  if (!steps.length) return null;
  return `<p style="margin:.4rem 0">${steps
    .map((s) => `<b>${esc(s.phase)}</b>${str(s.dur).trim() ? ` (${esc(s.dur)})` : ""}${str(s.desc).trim() ? `: ${esc(s.desc)}` : ""}`)
    .join("<br>")}</p>`;
}

function seccionInversion(blocks: Block[], accent: string): string | null {
  // Preferencia: Planes (3 columnas) → Desglose (budget, precio al cliente) → Inversión (pricing).
  const planes = firstOf(blocks, "planes");
  if (planes) {
    const items = arr<{ nombre?: string; precio?: string; unidad?: string; incluye?: unknown }>(planes.items);
    if (items.length) {
      const filas = items
        .map(
          (p) =>
            `<tr>
              <td style="padding:.4rem;border-bottom:1px solid #eee;vertical-align:top"><b>Plan ${esc(p.nombre)}</b> — ${esc(p.precio)} <span style="color:#555">${esc(p.unidad)}</span><br><span style="color:#555;font-size:.92em">${arr<string>(p.incluye).map(esc).join(" · ")}</span></td>
            </tr>`,
        )
        .join("");
      const nota = str(planes.nota).trim();
      return `<table style="width:100%;border-collapse:collapse;margin:.4rem 0">${filas}</table>${nota ? `<p style="color:#555;font-size:.86em;margin-top:.3rem">${esc(nota)}</p>` : ""}`;
    }
  }
  const budget = firstOf(blocks, "budget");
  if (budget) {
    const cur = str(budget.cur, "COP");
    const iva = Number(budget.iva) || 0;
    const discountPct = Number(budget.discountPct) || 0;
    const price = Number(budget.price) || 0;
    const hasPrice = price > 0;
    const { discount, subtotal, tax, total } = clientTotals({ price, discountPct, iva });
    // Servicios incluidos (solo nombres, nunca el costo interno).
    const incluidos = arr<{ items?: unknown }>(budget.sections)
      .flatMap((s) => arr<{ t?: string }>(s?.items).map((it) => str(it?.t)))
      .filter((t) => t.trim());
    const showIncluded = budget.showIncluded !== false && incluidos.length > 0;
    const filas: string[] = [`<tr><td style="padding:.3rem .4rem">Precio</td><td style="padding:.3rem .4rem;text-align:right;font-variant-numeric:tabular-nums">${hasPrice ? esc(formatMoney(price, cur)) : "Por definir"}</td></tr>`];
    if (hasPrice && discountPct > 0) {
      filas.push(`<tr><td style="padding:.3rem .4rem">Descuento (${discountPct}%)</td><td style="padding:.3rem .4rem;text-align:right;font-variant-numeric:tabular-nums">− ${esc(formatMoney(discount, cur))}</td></tr>`);
      filas.push(`<tr><td style="padding:.3rem .4rem">Subtotal</td><td style="padding:.3rem .4rem;text-align:right;font-variant-numeric:tabular-nums">${esc(formatMoney(subtotal, cur))}</td></tr>`);
    }
    if (hasPrice) filas.push(`<tr><td style="padding:.3rem .4rem">IVA (${iva}%)</td><td style="padding:.3rem .4rem;text-align:right;font-variant-numeric:tabular-nums">${esc(formatMoney(tax, cur))}</td></tr>`);
    filas.push(`<tr><td style="padding:.4rem;border-top:2px solid #111;font-weight:700">Total</td><td style="padding:.4rem;border-top:2px solid #111;text-align:right;font-weight:700;color:${esc(accent)};font-variant-numeric:tabular-nums">${hasPrice ? esc(formatMoney(total, cur)) : "Por definir"}</td></tr>`);
    const inc = showIncluded ? `<p style="margin:.2rem 0 .4rem"><b style="font-size:.86em;text-transform:uppercase;letter-spacing:.04em;color:#555">Incluye</b><br>${incluidos.map((t) => `✓ ${esc(t)}`).join("<br>")}</p>` : "";
    const nota = str(budget.note).trim();
    return `${inc}<table style="width:100%;border-collapse:collapse;margin:.3rem 0">${filas.join("")}</table>${nota ? `<p style="color:#555;font-size:.86em;margin-top:.3rem">${esc(nota)}</p>` : ""}`;
  }
  const pricing = firstOf(blocks, "pricing");
  if (pricing) {
    const rows = arr<{ c?: string; d?: string; p?: string }>(pricing.rows);
    const filas = rows
      .map((r) => `<tr><td style="padding:.3rem .4rem">${esc(r.c)}${str(r.d).trim() ? ` <span style="color:#555">— ${esc(r.d)}</span>` : ""}</td><td style="padding:.3rem .4rem;text-align:right;font-variant-numeric:tabular-nums">${esc(r.p)}</td></tr>`)
      .join("");
    const nota = str(pricing.note).trim();
    return `<table style="width:100%;border-collapse:collapse;margin:.3rem 0">${filas}<tr><td style="padding:.4rem;border-top:2px solid #111;font-weight:700">Total</td><td style="padding:.4rem;border-top:2px solid #111;text-align:right;font-weight:700;color:${esc(accent)}">${esc(str(pricing.total, "A convenir"))}</td></tr></table>${nota ? `<p style="color:#555;font-size:.86em;margin-top:.3rem">${esc(nota)}</p>` : ""}`;
  }
  return null;
}

// Título de sección numerado, con una regla fina en el color de acento.
function h2(n: number, txt: string, accent: string): string {
  return `<h2 style="font-size:.78em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${esc(accent)};margin:1.3rem 0 .35rem;padding-bottom:.2rem;border-bottom:1px solid #e6e6e6">${n}. ${esc(txt)}</h2>`;
}

// ── Documento completo (contenido interno del <body>) ──
export function documentoFormalHtml(d: DatosDocumento): string {
  const accent = d.brand.accent || "#2563eb";
  const secs: string[] = [];
  let n = 0;

  secs.push(h2(++n, "Objeto", accent) + seccionObjeto(d.blocks, d.title));

  const alcance = seccionAlcance(d.blocks);
  if (alcance) secs.push(h2(++n, "Alcance del servicio", accent) + alcance);

  const entregables = seccionEntregables(d.blocks, accent);
  if (entregables) secs.push(h2(++n, "Entregables", accent) + entregables);

  const cronograma = seccionCronograma(d.blocks);
  if (cronograma) secs.push(h2(++n, "Cronograma", accent) + cronograma);

  const inversion = seccionInversion(d.blocks, accent);
  if (inversion) secs.push(h2(++n, "Inversión", accent) + inversion);

  secs.push(
    h2(++n, "Condiciones", accent) +
      `<p style="margin:.4rem 0">Propuesta válida por <b>${esc(d.validez)}</b>. Los valores no incluyen IVA salvo que se indique lo contrario. El inicio se agenda una vez aceptada la propuesta. Forma de pago sugerida: 50% al inicio y 50% contra entrega. Cualquier alcance no descrito en este documento se cotiza por separado.</p>`,
  );

  const firma = `<table style="width:100%;margin-top:2.4rem;font-size:.86em;color:#555"><tr>
      <td style="width:50%;padding-top:.4rem;border-top:1px solid #999;vertical-align:top">${esc(d.brand.company)}<br>${esc(d.brand.email)}${d.brand.whatsapp ? `<br>${esc(d.brand.whatsapp)}` : ""}</td>
      <td style="width:2rem"></td>
      <td style="width:50%;padding-top:.4rem;border-top:1px solid #999;vertical-align:top">${esc(d.clientName || "Aprobación del cliente")}<br>Firma y fecha</td>
    </tr></table>`;

  const para = d.clientName ? `<p style="margin:.2rem 0"><b>Para:</b> ${esc(d.clientName)}</p>` : "";

  return `<div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;line-height:1.55;font-size:14px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:.6rem;margin-bottom:1rem">
      <div style="font-weight:800;font-size:1.2em;letter-spacing:-.01em">${esc(d.brand.company)}</div>
      <div style="text-align:right;font-size:.78em;color:#555">Propuesta ${esc(d.code)}<br>${esc(d.fecha)}<br>Válida por ${esc(d.validez)}</div>
    </div>
    ${para}
    <p style="margin:.2rem 0"><b>Asunto:</b> ${esc(d.title)}</p>
    ${secs.join("\n")}
    ${firma}
  </div>`;
}

// Envuelve el contenido en un documento HTML COMPLETO (para servir como .doc de Word).
export function documentoFormalWord(d: DatosDocumento): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Propuesta ${esc(d.code)}</title>
<style>@page { margin: 2.2cm; } body { margin: 0; }</style>
</head><body>${documentoFormalHtml(d)}</body></html>`;
}
