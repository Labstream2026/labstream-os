import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { userCanAccessProject } from "@/lib/project-access";
import { cargarSheet, docDeSheet } from "@/lib/llamado/doc";
import { LlamadoDocument } from "@/components/llamado-document";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function ImprimirLlamadoPage({ params }: { params: Promise<{ id: string; sheetId: string }> }) {
  const { id, sheetId } = await params;
  const session = await getSession();
  if (!session || !(await userCanAccessProject(id, session))) redirect("/proyectos");

  const sheet = await cargarSheet(sheetId);
  if (!sheet || sheet.projectId !== id) notFound();
  const doc = await docDeSheet(sheet);

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-4 print:hidden">
        <Link href={`/proyectos/${id}/llamado/${sheetId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Volver a la hoja
        </Link>
        <PrintButton />
      </div>
      <LlamadoDocument doc={doc} />
    </div>
  );
}
