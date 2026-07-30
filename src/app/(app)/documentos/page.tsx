import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, FileSpreadsheet, Presentation, File as FileIcon, MessageCircle, PenLine, Eye, ExternalLink, FilePlus2 } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { officeType, onlyofficeReady } from "@/lib/onlyoffice";
import { docPresenceFor } from "@/lib/doc-collab";
import { formatBogota } from "@/lib/bogota-time";
import { ClientPortalNav } from "@/components/client-portal-nav";

export const dynamic = "force-dynamic";

// ── DOCUMENTOS del cliente ──
// Los guiones, presupuestos y propuestas de sus proyectos, en un solo sitio y sin tener que
// entrar proyecto por proyecto. Se abren en el mismo editor que usa el equipo: el cliente
// SUGIERE (escribe con los cambios marcados) y comenta; nunca sobrescribe en silencio.

const ICONO = { word: FileText, cell: FileSpreadsheet, slide: Presentation, pdf: FileIcon } as const;

export default async function DocumentosClientePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "cliente") redirect("/");

  const [proyectos, editorListo] = await Promise.all([
    db.project.findMany({
      where: accessibleProjectWhere(session),
      orderBy: [{ finishedAt: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        emoji: true,
        finishedAt: true,
        folders: {
          orderBy: { position: "asc" },
          select: { name: true, files: { where: { deletedAt: null }, select: { id: true, name: true, kind: true, createdAt: true } } },
        },
        files: { where: { folderId: null, deletedAt: null }, select: { id: true, name: true, kind: true, createdAt: true } },
      },
    }),
    onlyofficeReady(),
  ]);

  // Solo documentos de Office guardados en el NAS de la app (los enlaces externos y las rutas
  // de red internas no son cosa del cliente).
  const grupos = proyectos
    .map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      finished: Boolean(p.finishedAt),
      docs: [...p.folders.flatMap((f) => f.files.map((x) => ({ ...x, carpeta: f.name }))), ...p.files.map((x) => ({ ...x, carpeta: null as string | null }))]
        .filter((f) => (f.kind === "LOCAL" || f.kind === "OPS") && officeType(f.name) !== null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    }))
    .filter((g) => g.docs.length > 0);

  const [presencia, comentarios] = await Promise.all([
    docPresenceFor(grupos.flatMap((g) => g.docs.map((d) => d.id))),
    db.docComment.groupBy({
      by: ["fileId"],
      where: { fileId: { in: grupos.flatMap((g) => g.docs.map((d) => d.id)) }, resolved: false },
      _count: { _all: true },
    }),
  ]);
  const sinResolver = new Map(comentarios.map((c) => [c.fileId, c._count._all]));
  // Quien puede subir archivos edita de verdad (y crea documentos nuevos); el resto sugiere,
  // o solo mira si el proyecto ya se entregó.
  const puedeEscribir = hasPermission(session, "subir_archivos");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documentos</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Los guiones, propuestas y planillas de tus proyectos. Puedes comentarlos y proponer cambios: lo que escribas
            queda marcado como sugerencia y el equipo lo revisa.
          </p>
        </div>
        {puedeEscribir ? (
          <Link
            href="/documentos/nuevo"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <FilePlus2 className="size-4" /> Nuevo documento
          </Link>
        ) : null}
      </header>

      <ClientPortalNav active="documentos" />

      {!editorListo ? (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          El editor de documentos todavía no está conectado. Escríbele al equipo y lo activan.
        </p>
      ) : grupos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Todavía no hay documentos compartidos contigo. Cuando el equipo suba un guion o una propuesta, aparecerá aquí.
        </p>
      ) : (
        <div className="space-y-5">
          {grupos.map((g) => (
            <section key={g.id} className="rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <span className="text-base">{g.emoji || "📁"}</span>
                <Link href={`/proyectos/${g.id}?tab=archivos`} className="text-sm font-semibold hover:underline">
                  {g.name}
                </Link>
                {g.finished ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">entregado</span>
                ) : null}
                <span className="ml-auto text-xs text-muted-foreground">{g.docs.length}</span>
              </div>

              <ul className="divide-y divide-border">
                {g.docs.map((d) => {
                  const Icono = ICONO[officeType(d.name) ?? "word"];
                  const dentro = (presencia.get(d.id) ?? []).filter((p) => p.id !== session.id);
                  const pend = sinResolver.get(d.id) ?? 0;
                  // El proyecto entregado se abre en solo lectura (igual que para el equipo).
                  const modo = g.finished ? "ver" : puedeEscribir ? "editar" : "sugerir";
                  return (
                    <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                      <Icono className="size-5 shrink-0 text-sky-600 dark:text-sky-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" title={d.name}>{d.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {d.carpeta ? `${d.carpeta} · ` : ""}
                          {formatBogota(d.createdAt, { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>

                      {dentro.length ? (
                        <span
                          title={`${dentro.map((p) => p.name).join(", ")} ${dentro.length === 1 ? "lo tiene" : "lo tienen"} abierto ahora`}
                          className="hidden shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 sm:inline-flex dark:text-emerald-400"
                        >
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          {dentro.length === 1 ? dentro[0].name.split(" ")[0] : `${dentro.length} dentro`}
                        </span>
                      ) : null}
                      {pend ? (
                        <span
                          title={`${pend} comentario${pend === 1 ? "" : "s"} sin resolver`}
                          className="hidden shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 sm:inline-flex dark:text-amber-400"
                        >
                          <MessageCircle className="size-3" /> {pend}
                        </span>
                      ) : null}

                      <Link
                        href={`/docs/file/${d.id}`}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                      >
                        {modo === "ver" ? <Eye className="size-3.5" /> : modo === "editar" ? <ExternalLink className="size-3.5" /> : <PenLine className="size-3.5" />}
                        {modo === "ver" ? "Ver" : modo === "editar" ? "Abrir" : "Comentar"}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
