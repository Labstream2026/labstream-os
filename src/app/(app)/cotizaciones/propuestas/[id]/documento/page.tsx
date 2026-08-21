import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { BRAND_DEFAULT, type Block, type Brand } from "@/lib/proposals/types";
import { documentoFormalHtml } from "@/lib/proposals/documento-formal";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

// Documento formal (solo texto) para IMPRIMIR o guardar como PDF — la contraparte del .doc de
// Word (/api/proposal-doc). Ambos salen del mismo generador; aquí se pinta para el navegador y
// «Descargar PDF» abre el diálogo de impresión (Guardar como PDF).
export default async function DocumentoFormalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "ver_finanzas")) redirect("/");

  const p = await db.proposal.findUnique({ where: { id }, include: { client: { select: { name: true } } } });
  if (!p) notFound();

  const brand = { ...BRAND_DEFAULT, ...((p.brand as unknown as Brand) ?? {}) };
  const blocks = (Array.isArray(p.blocks) ? p.blocks : []) as unknown as Block[];
  const fmtFecha = (d: Date) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" }).format(d);

  const html = documentoFormalHtml({
    brand,
    blocks,
    code: p.code,
    title: p.title,
    clientName: p.client?.name ?? null,
    fecha: fmtFecha(new Date()),
    validez: p.expiresAt ? `hasta el ${fmtFecha(p.expiresAt)}` : "15 días",
  });

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between gap-3 px-4 print:hidden">
        <div>
          <p className="text-sm font-semibold text-neutral-800">{p.code} · Documento formal</p>
          <p className="text-xs text-neutral-500">Versión de solo texto — imprime o guarda como PDF. Para Word, usa «Descargar Word».</p>
        </div>
        <PrintButton label="Descargar PDF" />
      </div>
      {/* La hoja: el contenido viene del generador (estilos en línea), igual que el .doc. */}
      <div
        className="mx-auto max-w-[820px] bg-white px-10 py-12 shadow-sm print:max-w-none print:px-0 print:py-0 print:shadow-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
