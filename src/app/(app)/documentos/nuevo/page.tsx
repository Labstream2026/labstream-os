import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleProjectWhere, canWriteProject } from "@/lib/project-access";
import { onlyofficeReady } from "@/lib/onlyoffice";
import { activeDocTemplates } from "@/lib/doc-create";
import { NuevoDocForm } from "./form";

export const dynamic = "force-dynamic";

// ── Nuevo documento, desde cualquier parte ──
// La misma pantalla que abre ⌘K, el chat de un proyecto y el portal del cliente: se elige el
// proyecto, el tipo y (el equipo) la plantilla de la empresa. Al crear se abre el editor.
export default async function NuevoDocumentoPage({
  searchParams,
}: {
  searchParams: Promise<{ proyecto?: string; nombre?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "demo") redirect("/");
  const { proyecto, nombre } = await searchParams;

  const [proyectos, plantillas, ooReady] = await Promise.all([
    db.project.findMany({
      where: accessibleProjectWhere(session),
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, name: true, emoji: true, isPrivate: true, leadId: true, archivedAt: true, finishedAt: true,
        members: { select: { userId: true, role: true } },
        client: { select: { name: true } },
      },
    }),
    // Las plantillas son de la empresa: el cliente crea en blanco.
    session.role === "cliente" ? Promise.resolve([]) : activeDocTemplates(),
    onlyofficeReady(),
  ]);

  // Donde se puede escribir de verdad: el equipo por permisos, y el cliente en sus proyectos si
  // puede subir archivos (crear es lo mismo que subir, sin salir de la app).
  const puedeCliente = session.role === "cliente" && hasPermission(session, "subir_archivos");
  const opciones = proyectos
    .filter((p) => !p.finishedAt && !p.archivedAt)
    .filter((p) => canWriteProject(p, session) || (puedeCliente && p.members.some((m) => m.userId === session.id)))
    .map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, client: p.client?.name ?? null }));

  const volver = session.role === "cliente" ? "/documentos" : "/proyectos";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <Link href={volver} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Volver
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Nuevo documento</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Word, Excel o Power Point, dentro del proyecto y listo para escribir. Queda en Archivos, con su historial de
        versiones y sus comentarios.
      </p>

      {opciones.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No hay ningún proyecto abierto donde puedas crear documentos.
        </p>
      ) : (
        <NuevoDocForm
          projects={opciones}
          templates={plantillas}
          onlyoffice={ooReady}
          defaultProjectId={opciones.some((p) => p.id === proyecto) ? proyecto! : opciones[0].id}
          defaultName={nombre ?? ""}
        />
      )}
    </div>
  );
}
