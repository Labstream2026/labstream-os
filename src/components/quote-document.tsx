import { formatMoney, formatLongDate } from "@/lib/ui";
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
  clientCompany?: string | null;
  recipientName?: string | null;
  recipientCity?: string | null;
  intro?: string | null;
  projectName?: string | null;
  items: DocItem[];
};

// Días de validez: si hay fecha límite, los días entre creación y vencimiento; si no, 30.
function validityDays(createdAt: Date | string, validUntil: Date | string | null): number {
  if (!validUntil) return 30;
  const a = new Date(createdAt).getTime();
  const b = new Date(validUntil).getTime();
  const days = Math.round((b - a) / 86_400_000);
  return days > 0 ? days : 30;
}

// Documento de cotización con la imagen institucional de Labstream Studio: se renderiza
// como CARTA formal sobre el membrete oficial (public/brand/membrete.png — logo arriba a la
// izquierda y gráfico decorativo abajo), replicando el "Desglose" que se envía al cliente.
// Sirve igual para la vista de impresión (PDF) y la vista pública del cliente. Tamaño A4.
export function QuoteDocument({ quote }: { quote: QuoteDoc }) {
  const money = (n: number) => formatMoney(n, quote.currency);
  const showIva = quote.taxRate > 0;
  const days = validityDays(quote.createdAt, quote.validUntil);

  // Destinatario: empresa (o nombre) en primera línea; debajo, la persona de contacto
  // (campo editable; si está vacío, el nombre del cliente cuando hay empresa distinta).
  // La ciudad es editable y cae a "Ciudad" por defecto, como en la carta formal.
  const recipientCompany = quote.clientCompany?.trim() || quote.clientName;
  const recipientContact =
    quote.recipientName?.trim() ||
    (quote.clientCompany?.trim() && quote.clientName !== quote.clientCompany ? quote.clientName : null);
  const recipientCity = quote.recipientCity?.trim() || "Ciudad";

  return (
    <div
      className="quote-doc relative mx-auto bg-white text-neutral-900 shadow-sm print:shadow-none"
      style={{ width: "210mm", minHeight: "297mm" }}
    >
      {/* Membrete oficial de fondo (logo + gráfico decorativo) — A4 completo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/membrete.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
      />

      {/* Contenido de la carta sobre el membrete (deja libre el logo arriba y el gráfico abajo) */}
      <div className="relative flex min-h-[297mm] flex-col px-[24mm] pb-[34mm] pt-[40mm] text-[12.5px] leading-relaxed">
        {/* Fecha */}
        <p>{COMPANY.city}, {formatLongDate(quote.createdAt)}.</p>

        {/* Destinatario */}
        <div className="mt-6">
          <p>Señor (es):</p>
          <p className="font-semibold">{recipientCompany}</p>
          {recipientContact ? <p>{recipientContact}</p> : null}
          <p>{recipientCity}</p>
        </div>

        {/* Referencia */}
        <p className="mt-5 font-semibold">Ref. Propuesta comercial {quote.code}</p>

        {/* Introducción: texto editable; si está vacío, se genera uno por defecto */}
        {quote.intro?.trim() ? (
          <p className="mt-5 whitespace-pre-wrap">{quote.intro}</p>
        ) : (
          <p className="mt-5">
            A continuación relacionamos el desglose de{" "}
            <span className="font-medium">«{quote.title}»</span>
            {quote.projectName ? <> correspondiente al proyecto {quote.projectName}</> : null}.
          </p>
        )}

        {/* Nota opcional */}
        {quote.notes ? (
          <p className="mt-4 whitespace-pre-wrap">
            <span className="font-semibold">Nota: </span>
            {quote.notes}
          </p>
        ) : null}

        {/* Tabla Servicio | Valor */}
        <table className="mt-5 w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="border border-neutral-800 px-3 py-1.5 text-center font-bold">Servicio</th>
              <th className="w-[40%] border border-neutral-800 px-3 py-1.5 text-center font-bold">Valor</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((it, i) => {
              const lineTotal = it.quantity * it.unitPrice;
              const [first, ...rest] = (it.description || "—").split("\n");
              return (
                <tr key={i}>
                  <td className="border border-neutral-800 px-3 py-2 align-middle">
                    {it.section ? (
                      <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">{it.section} · </span>
                    ) : null}
                    <span>{first}{it.quantity > 1 ? ` (×${it.quantity})` : ""}</span>
                    {rest.length ? (
                      <span className="block text-[10.5px] text-neutral-500">{rest.join(" ")}</span>
                    ) : null}
                  </td>
                  <td className="border border-neutral-800 px-3 py-2 text-right align-middle tabular-nums whitespace-nowrap">
                    {money(lineTotal)}{showIva ? " + IVA" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pie de página legal */}
        <div className="mt-5 space-y-1 text-[11.5px] text-neutral-700">
          {showIva ? (
            <p>*El valor correspondiente al IVA es del {quote.taxRate}% del valor del servicio, de acuerdo con lo estipulado por la normatividad Colombiana.</p>
          ) : null}
          <p>{showIva ? "**" : "*"}Los valores registrados en esta propuesta comercial tienen validez durante {days} días calendario.</p>
        </div>

        {/* Cierre + firma */}
        <p className="mt-8">Cordialmente,</p>
        <div className="mt-2 flex items-end gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/firma.png" alt="Firma" className="h-16 w-auto object-contain" />
          <div className="pb-1 text-[11.5px] leading-snug">
            <p className="font-semibold">{COMPANY.signer}</p>
            <p className="text-neutral-700">
              <span className="font-semibold">T:</span> {COMPANY.phone}
              <span className="mx-3" />
              <span className="font-semibold">E:</span> {COMPANY.email}
            </p>
            <p className="text-neutral-700"><span className="font-semibold">W:</span> {COMPANY.website}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
