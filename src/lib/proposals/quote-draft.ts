import { clientTotals } from "./budget";

// ── Traducción propuesta → líneas de cotización (lógica PURA) ──
//
// Vive aparte de `lib/quote-from-proposal.ts` (que toca la base de datos) por dos razones: es
// la parte que maneja DINERO y merece pruebas propias, y las pruebas no resuelven el alias `@/`
// — aquí solo hay imports relativos, así que corren sin montar medio Next.
//
// Regla de oro: lo que viaja es SIEMPRE el precio que el cliente aceptó (con su descuento),
// nunca el costo interno. El desglose interno solo decide en qué PROPORCIÓN se reparte ese
// precio entre los conceptos, para que la cotización conserve la estructura del trabajo y su
// total coincida, al peso, con lo que el cliente vio.

// Tipo estructural (no se importa `Block` para no arrastrar `@/lib/branding` a las pruebas).
type AnyBlock = { type?: unknown; [key: string]: unknown };

export type QuoteLineDraft = { section: string | null; description: string; unitPrice: number };

export type QuoteDraft = {
  currency: string;
  taxRate: number;
  /** Suma de las líneas = lo que el cliente aceptó ANTES de IVA (descuento ya aplicado). */
  subtotal: number;
  lines: QuoteLineDraft[];
};

const str = (v: unknown, fb = "") => (typeof v === "string" ? v : fb);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

// "$5.950.000" → 5950000 · "A convenir" → 0. Solo dígitos: en el formato colombiano el punto
// es separador de miles, así que quitar todo lo que no sea número es exactamente lo correcto.
export function moneyFromText(v: unknown): number {
  const digits = str(v).replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

// Reparte `total` entre `weights` conservando la proporción y SIN perder pesos por redondeo:
// la diferencia acumulada cae en la última línea con peso.
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || weights.length === 0) return weights.map(() => 0);
  const out = weights.map((w) => Math.round((total * w) / sum));
  const drift = total - out.reduce((a, b) => a + b, 0);
  if (drift !== 0) {
    for (let i = out.length - 1; i >= 0; i--) {
      if (weights[i] > 0) { out[i] += drift; break; }
    }
  }
  return out;
}

// Traduce los bloques de la propuesta a las líneas de la cotización.
// null = la propuesta no tiene ningún bloque de dinero con valores (no hay nada que cotizar).
export function quoteDraftFromBlocks(blocks: unknown): QuoteDraft | null {
  const list = (Array.isArray(blocks) ? blocks : []) as AnyBlock[];

  // 1) Bloque «Desglose» (budget): el bueno — tiene números de verdad.
  //    Se recorre al revés: si hay dos, manda el último (el que quedó vigente).
  const budget = [...list].reverse().find((b) => b?.type === "budget");
  if (budget) {
    const currency = str(budget.cur, "COP");
    const taxRate = Math.round(num(budget.iva));
    const t = clientTotals({ price: num(budget.price), discountPct: num(budget.discountPct), iva: taxRate });
    if (t.subtotal > 0) {
      // Conceptos con su costo interno como PESO del reparto (el costo NO sale de aquí: solo
      // define qué proporción del precio acordado corresponde a cada línea).
      const concepts: { section: string | null; description: string; weight: number }[] = [];
      for (const sec of arr(budget.sections)) {
        const sectionName = str(sec.s) || null;
        for (const it of arr(sec.items)) {
          if (it.on === false) continue; // concepto desactivado en el constructor
          const desc = str(it.t).trim();
          if (!desc) continue;
          const qty = num(it.q) || 1;
          concepts.push({ section: sectionName, description: desc, weight: Math.max(0, qty * num(it.v)) });
        }
      }
      if (concepts.length > 0 && concepts.some((c) => c.weight > 0)) {
        const values = distribute(t.subtotal, concepts.map((c) => c.weight));
        return {
          currency,
          taxRate,
          subtotal: t.subtotal,
          lines: concepts.map((c, i) => ({ section: c.section, description: c.description, unitPrice: values[i] })),
        };
      }
      // Sin desglose utilizable: una sola línea por el precio acordado.
      return {
        currency,
        taxRate,
        subtotal: t.subtotal,
        lines: [{ section: null, description: str(budget.title, "Servicio según propuesta"), unitPrice: t.subtotal }],
      };
    }
  }

  // 2) Bloque «Inversión» (pricing): sus filas ya son de cara al cliente, con el precio escrito.
  const pricing = [...list].reverse().find((b) => b?.type === "pricing");
  if (pricing) {
    const lines: QuoteLineDraft[] = [];
    for (const r of arr(pricing.rows)) {
      const description = str(r.c).trim();
      const unitPrice = moneyFromText(r.p);
      if (description && unitPrice > 0) lines.push({ section: null, description, unitPrice });
    }
    if (lines.length > 0) {
      const subtotal = lines.reduce((a, l) => a + l.unitPrice, 0);
      // Este bloque no guarda IVA: los valores escritos se toman tal cual y el equipo ajusta
      // el impuesto en la cotización si hace falta.
      return { currency: "COP", taxRate: 0, subtotal, lines };
    }
  }

  return null;
}
