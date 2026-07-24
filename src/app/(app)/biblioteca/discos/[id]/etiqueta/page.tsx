import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { DISK_KIND_LABEL } from "@/lib/material-health";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

// ETIQUETA IMPRIMIBLE del disco: se pega al disco físico; el QR abre la Biblioteca
// con este disco resaltado, así el teléfono responde «¿qué hay aquí adentro?» sin
// buscar. Tamaño tarjeta (90×54 mm) para imprimir en papel adhesivo.
export default async function EtiquetaDiscoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!hasPermission(session, "ver_biblioteca")) redirect("/");
  const { id } = await params;

  const disk = await db.storageDisk.findUnique({
    where: { id },
    include: { locations: { select: { projectId: true } } },
  });
  if (!disk) notFound();

  const base = (process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "");
  const target = `${base}/biblioteca?tab=discos&disco=${disk.id}`;
  // QR como data-URL (SVG nítido a cualquier tamaño de impresión).
  const qr = await QRCode.toString(target, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const qrSrc = `data:image/svg+xml;base64,${Buffer.from(qr).toString("base64")}`;

  const nProjects = new Set(disk.locations.map((l) => l.projectId)).size;
  const capacity = disk.capacityGB ? `${(disk.capacityGB / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} TB` : null;

  return (
    <div className="mx-auto max-w-xl px-4 py-10 print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold">Etiqueta de «{disk.name}»</h1>
          <p className="text-sm text-muted-foreground">Imprímela en papel adhesivo y pégala al disco. El QR abre su ficha en la Biblioteca.</p>
        </div>
        <PrintButton />
      </div>

      {/* La etiqueta: 90×54 mm reales al imprimir. */}
      <div
        className="print-label mx-auto flex items-stretch gap-4 rounded-xl border-2 bg-white p-4 text-neutral-900 shadow-sm print:mx-0 print:rounded-lg print:shadow-none"
        style={{ width: "90mm", height: "54mm", borderColor: disk.color ?? "#94a3b8" }}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: disk.color ?? "#94a3b8" }} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Labstream · Biblioteca</span>
          </div>
          <p className="mt-1.5 break-words text-[15px] font-extrabold leading-tight">{disk.name}</p>
          <p className="mt-0.5 text-[11px] font-medium text-neutral-600">
            {DISK_KIND_LABEL[disk.kind] ?? disk.kind}
            {capacity ? ` · ${capacity}` : ""}
          </p>
          <div className="mt-auto space-y-0.5 text-[10px] leading-snug text-neutral-600">
            {disk.location ? <p>📍 {disk.location}</p> : null}
            <p>{nProjects} {nProjects === 1 ? "proyecto" : "proyectos"} registrados</p>
            <p className="text-neutral-400">Escanea para ver qué contiene</p>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- data-URL local, next/image no aplica */}
        <img src={qrSrc} alt={`QR del disco ${disk.name}`} className="h-full w-auto shrink-0" />
      </div>

      <style>{`@media print { body * { visibility: hidden; } .print-label, .print-label * { visibility: visible; } }`}</style>
    </div>
  );
}
