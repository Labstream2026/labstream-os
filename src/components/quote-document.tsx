import { formatMoney, quoteTotals, formatShortDate } from "@/lib/ui";
import { COMPANY } from "@/lib/branding";

export type DocItem = { section: string | null; description: string; quantity: number; unitPrice: number };
export type QuoteDoc = {
  code: string;
  title: string;
  status: string;
  currency: string;
  taxRate: number;
  notes: string | null;
  validUntil: Date | string | null;
  createdAt: Date | string;
  clientName: string;
  projectName?: string | null;
  items: DocItem[];
};

// Agrupa los ítems por sección preservando el orden de aparición.
function groupBySection(items: DocItem[]): { name: string | null; items: DocItem[] }[] {
  const groups: { name: string | null; items: DocItem[] }[] = [];
  for (const it of items) {
    const key = it.section?.trim() || null;
    let g = groups.find((x) => x.name === key);
    if (!g) { g = { name: key, items: [] }; groups.push(g); }
    g.items.push(it);
  }
  return groups;
}

// Documento de cotización con la marca de Labstream — usado tanto en la vista de
// impresión (PDF) como en la vista pública del cliente. Fondo blanco, imprimible.
export function QuoteDocument({ quote }: { quote: QuoteDoc }) {
  const groups = groupBySection(quote.items);
  const { subtotal, tax, total } = quoteTotals(quote.items, quote.taxRate);
  const money = (n: number) => formatMoney(n, quote.currency);

  return (
    <div className="quote-doc mx-auto max-w-3xl bg-white p-10 text-[13px] text-neutral-800 shadow-sm print:max-w-none print:p-0 print:shadow-none">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-6 border-b border-neutral-200 pb-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-dark.png" alt={COMPANY.name} className="h-12 w-auto object-contain" />
        <div className="text-right">
          <p className="text-lg font-bold tracking-tight text-neutral-900">COTIZACIÓN</p>
          <p className="font-mono text-xs text-neutral-500">{quote.code}</p>
          <p className="mt-1 text-xs text-neutral-500">Fecha: {formatShortDate(quote.createdAt)}</p>
          {quote.validUntil ? (
            <p className="text-xs text-neutral-500">Válida hasta: {formatShortDate(quote.validUntil)}</p>
          ) : null}
        </div>
      </div>

      {/* Cliente + título */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Cliente</p>
          <p className="font-semibold text-neutral-900">{quote.clientName}</p>
          {quote.projectName ? <p className="text-xs text-neutral-500">Proyecto: {quote.projectName}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Concepto</p>
          <p className="max-w-xs font-semibold text-neutral-900">{quote.title}</p>
        </div>
      </div>

      {/* Tabla por secciones */}
      <table className="mt-6 w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b-2 border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <th className="py-2 font-semibold">Descripción</th>
            <th className="w-16 py-2 text-right font-semibold">Cant.</th>
            <th className="w-32 py-2 text-right font-semibold">Precio</th>
            <th className="w-32 py-2 text-right font-semibold">Importe</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => {
            const groupTotal = g.items.reduce((n, i) => n + i.quantity * i.unitPrice, 0);
            return (
              <SectionBlock key={gi} name={g.name} items={g.items} groupTotal={groupTotal} money={money} showSubtotal={groups.length > 1} />
            );
          })}
        </tbody>
      </table>

      {/* Totales */}
      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-[13px]">
          <div className="flex justify-between text-neutral-500">
            <span>Subtotal</span><span className="tabular-nums">{money(subtotal)}</span>
          </div>
          <div className="flex justify-between text-neutral-500">
            <span>IVA ({quote.taxRate}%)</span><span className="tabular-nums">{money(tax)}</span>
          </div>
          <div className="flex justify-between border-t border-neutral-300 pt-1 text-base font-bold text-neutral-900">
            <span>Total</span><span className="tabular-nums">{money(total)}</span>
          </div>
        </div>
      </div>

      {/* Notas */}
      {quote.notes ? (
        <div className="mt-6 rounded-md bg-neutral-50 p-4 text-xs text-neutral-600">
          <p className="mb-1 font-semibold text-neutral-700">Notas y condiciones</p>
          <p className="whitespace-pre-wrap">{quote.notes}</p>
        </div>
      ) : null}

      {/* Firma */}
      <div className="mt-8 flex items-end justify-between gap-6">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/firma.png" alt="Firma" className="h-16 w-auto object-contain" />
          <p className="mt-1 border-t border-neutral-300 pt-1 text-xs font-medium text-neutral-700">{COMPANY.legalName}</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/membrete.png" alt="" className="h-14 w-auto object-contain opacity-80" />
      </div>
    </div>
  );
}

function SectionBlock({
  name,
  items,
  groupTotal,
  money,
  showSubtotal,
}: {
  name: string | null;
  items: DocItem[];
  groupTotal: number;
  money: (n: number) => string;
  showSubtotal: boolean;
}) {
  return (
    <>
      {name ? (
        <tr className="bg-neutral-100">
          <td colSpan={4} className="px-1 py-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-600">{name}</td>
        </tr>
      ) : null}
      {items.map((it, i) => (
        <tr key={i} className="border-b border-neutral-100">
          <td className="py-1.5 pr-2">{it.description || "—"}</td>
          <td className="py-1.5 text-right tabular-nums">{it.quantity}</td>
          <td className="py-1.5 text-right tabular-nums">{money(it.unitPrice)}</td>
          <td className="py-1.5 text-right font-medium tabular-nums">{money(it.quantity * it.unitPrice)}</td>
        </tr>
      ))}
      {showSubtotal && name ? (
        <tr>
          <td colSpan={3} className="py-1 pr-2 text-right text-[11px] text-neutral-400">Subtotal {name}</td>
          <td className="py-1 text-right text-xs font-medium tabular-nums text-neutral-500">{money(groupTotal)}</td>
        </tr>
      ) : null}
    </>
  );
}
