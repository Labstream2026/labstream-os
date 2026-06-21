import { promises as fs } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { COMPANY } from "@/lib/branding";
import { formatMoney, formatLongDate } from "@/lib/ui";
import { composeQuoteTotals, clientLineValue } from "@/lib/quote-compose";

// Generación del PDF de cotización en el SERVIDOR con pdf-lib (pure-JS, fuentes embebidas →
// compatible con el output:"standalone" del NAS, sin Chromium ni fuentes en disco).
// Replica el contenido de la carta formal (src/components/quote-document.tsx): membrete de
// fondo, destinatario, tabla Servicio/Valor con totales, validez y firma. Para que Marcebot
// pueda adjuntar la cotización como archivo real.

export type PdfQuoteItem = { section: string | null; description: string; unit?: string | null; quantity: number; unitPrice: number };
export type PdfQuote = {
  code: string;
  title: string;
  currency: string;
  taxRate: number;
  contingencyPct?: number;
  notes: string | null;
  scope?: string | null;
  deliverables?: string | null;
  validUntil: Date | string | null;
  createdAt: Date | string;
  clientName: string;
  clientCompany?: string | null;
  recipientName?: string | null;
  recipientCity?: string | null;
  intro?: string | null;
  projectName?: string | null;
  items: PdfQuoteItem[];
};

const A4 = { w: 595.28, h: 841.89 };
const M = { left: 68, right: 68, top: 120, bottom: 96 }; // márgenes que dejan libres logo y gráfico del membrete
const CONTENT_W = A4.w - M.left - M.right;

function validityDays(createdAt: Date | string, validUntil: Date | string | null): number {
  if (!validUntil) return 30;
  const days = Math.round((new Date(validUntil).getTime() - new Date(createdAt).getTime()) / 86_400_000);
  return days > 0 ? days : 30;
}

// Parte un texto en líneas que caben en maxW (respeta saltos de línea explícitos).
function wrap(font: PDFFont, size: number, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(text ?? "").split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && cur) { out.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) out.push(cur);
  }
  return out;
}

async function loadBrandPng(pdf: PDFDocument, file: string): Promise<PDFImage | null> {
  try {
    const bytes = await fs.readFile(path.join(process.cwd(), "public", "brand", file));
    return await pdf.embedPng(bytes);
  } catch {
    return null; // best-effort: sin la imagen, el PDF se genera igual
  }
}

export async function renderQuotePdf(quote: PdfQuote): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const membrete = await loadBrandPng(pdf, "membrete.png");
  const firma = await loadBrandPng(pdf, "firma.png");

  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.42, 0.42, 0.42);
  const line = rgb(0.15, 0.15, 0.15);

  const newPage = (): PDFPage => {
    const p = pdf.addPage([A4.w, A4.h]);
    if (membrete) p.drawImage(membrete, { x: 0, y: 0, width: A4.w, height: A4.h });
    return p;
  };
  let page = newPage();
  let y = A4.h - M.top;

  // Asegura espacio vertical; si no cabe, salta de página.
  const ensure = (need: number) => { if (y - need < M.bottom) { page = newPage(); y = A4.h - M.top; } };

  const text = (s: string, x: number, size: number, f: PDFFont, color = ink) => {
    page.drawText(s, { x, y, size, font: f, color });
  };
  // Dibuja un párrafo (con wrap) y avanza el cursor.
  const para = (s: string, size: number, f: PDFFont, color = ink, gapAfter = 6) => {
    const lh = size * 1.35;
    for (const ln of wrap(f, size, s, CONTENT_W)) {
      ensure(lh);
      if (ln) text(ln, M.left, size, f, color);
      y -= lh;
    }
    y -= gapAfter;
  };

  const totals = composeQuoteTotals(quote.items, { taxRate: quote.taxRate, contingencyPct: quote.contingencyPct ?? 0 });
  const showIva = quote.taxRate > 0;
  const money = (n: number) => formatMoney(n, quote.currency);

  // Fecha
  para(`${COMPANY.city}, ${formatLongDate(quote.createdAt) ?? ""}.`, 11, font, ink, 10);

  // Destinatario
  const recipientCompany = quote.clientCompany?.trim() || quote.clientName;
  const recipientContact =
    quote.recipientName?.trim() ||
    (quote.clientCompany?.trim() && quote.clientName !== quote.clientCompany ? quote.clientName : null);
  para("Señor (es):", 11, font, ink, 1);
  para(recipientCompany, 11, bold, ink, 1);
  if (recipientContact) para(recipientContact, 11, font, ink, 1);
  para(quote.recipientCity?.trim() || "Ciudad", 11, font, ink, 10);

  // Referencia
  para(`Ref. Propuesta comercial ${quote.code}`, 11, bold, ink, 8);

  // Introducción
  if (quote.intro?.trim()) para(quote.intro, 11, font, ink, 6);
  else para(`A continuación relacionamos el desglose de «${quote.title}»${quote.projectName ? ` correspondiente al proyecto ${quote.projectName}` : ""}.`, 11, font, ink, 6);

  // Alcance
  if (quote.scope?.trim()) { para("El servicio incluye:", 11, bold, ink, 1); para(quote.scope, 11, font, ink, 6); }
  // Nota
  if (quote.notes?.trim()) para(`Nota: ${quote.notes}`, 11, font, ink, 6);

  // ── Tabla Servicio | Valor ──
  const valW = 150;
  const descW = CONTENT_W - valW;
  const size = 10.5;
  const pad = 6;
  const drawRow = (left: string[], right: string, opts: { bold?: boolean } = {}) => {
    const lh = size * 1.3;
    const rowH = Math.max(left.length, 1) * lh + pad * 2;
    ensure(rowH);
    const top = y;
    // bordes
    page.drawRectangle({ x: M.left, y: top - rowH, width: descW, height: rowH, borderColor: line, borderWidth: 0.7 });
    page.drawRectangle({ x: M.left + descW, y: top - rowH, width: valW, height: rowH, borderColor: line, borderWidth: 0.7 });
    // texto descripción
    let ty = top - pad - size;
    for (const ln of left) { page.drawText(ln, { x: M.left + pad, y: ty, size, font: opts.bold ? bold : font, color: ink }); ty -= lh; }
    // valor (derecha)
    const f = opts.bold ? bold : font;
    const w = f.widthOfTextAtSize(right, size);
    page.drawText(right, { x: M.left + descW + valW - pad - w, y: top - pad - size, size, font: f, color: ink });
    y = top - rowH;
  };

  // encabezado
  drawRow(["Servicio"], "Valor", { bold: true });
  // ítems
  const cPct = quote.contingencyPct ?? 0;
  for (const it of quote.items) {
    const lineValue = clientLineValue(it, cPct);
    const qtyNote = it.quantity > 1 ? ` (×${it.quantity}${it.unit ? ` ${it.unit}` : ""})` : "";
    const head = `${it.section ? `${it.section.toUpperCase()} · ` : ""}${(it.description || "—").split("\n")[0]}${qtyNote}`;
    const extra = (it.description || "").split("\n").slice(1).join(" ");
    const lines = wrap(font, size, head + (extra ? `\n${extra}` : ""), descW - pad * 2);
    drawRow(lines, money(lineValue));
  }
  // totales
  drawRow(["Subtotal"], money(totals.clientSubtotal), { bold: true });
  if (showIva) drawRow([`IVA (${quote.taxRate}%)`], money(totals.tax), { bold: true });
  drawRow([`Total${showIva ? " + IVA" : ""}`], money(totals.total), { bold: true });
  y -= 12;

  // Entregables
  if (quote.deliverables?.trim()) { para("Entregables:", 11, bold, ink, 1); para(quote.deliverables, 11, font, ink, 6); }

  // Pie legal
  const days = validityDays(quote.createdAt, quote.validUntil);
  if (showIva) para(`*El IVA corresponde al ${quote.taxRate}% del valor del servicio, conforme a la normatividad colombiana.`, 9.5, font, muted, 1);
  para(`${showIva ? "**" : "*"}Los valores de esta propuesta tienen validez de ${days} días calendario.`, 9.5, font, muted, 14);

  // Cierre + firma
  para("Cordialmente,", 11, font, ink, 6);
  ensure(80);
  if (firma) {
    const fw = 110, fh = (firma.height / firma.width) * fw;
    page.drawImage(firma, { x: M.left, y: y - fh, width: fw, height: fh });
  }
  const sx = M.left + 124;
  page.drawText(COMPANY.signer, { x: sx, y: y - 22, size: 10.5, font: bold, color: ink });
  page.drawText(`T: ${COMPANY.phone}    E: ${COMPANY.email}`, { x: sx, y: y - 36, size: 10, font, color: muted });
  page.drawText(`W: ${COMPANY.website}`, { x: sx, y: y - 49, size: 10, font, color: muted });

  return pdf.save();
}
