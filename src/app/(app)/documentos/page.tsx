import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, FileSpreadsheet, Presentation, File as FileIcon, MessageCircle, PenLine, Eye, ExternalLink, FilePlus2, Film, Target, ListChecks } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { officeType, onlyofficeReady } from "@/lib/onlyoffice";
import { docPresenceFor } from "@/lib/doc-collab";
import { photoThumbSrc, photoViewSrc } from "@/lib/deliverable-photo";
import { formatBogota } from "@/lib/bogota-time";
import { EntityEmoji } from "@/components/icons/marks";
import { ClientPortalNav } from "@/components/client-portal-nav";
import { MaterialUpload } from "./material-upload";

export const dynamic = "force-dynamic";

// ── MATERIALES del cliente ──
// El espacio de trabajo compartido de cada proyecto: el BRIEF (lo acordado + compromisos), el
// MATERIAL que el cliente aporta (sube desde aquí, cae en la carpeta del proyecto en el NAS) y los
// DOCUMENTOS de Office que se editan en vivo con el equipo (OnlyOffice, el cliente sugiere/edita).

const ICONO = { word: FileText, cell: FileSpreadsheet, slide: Presentation, pdf: FileIcon } as const;
const MEDIA_RE = /\.(jpe?g|png|webp|gif|heic|heif|mp4|m4v|mov|webm|mkv|ogv)$/i;
const IMG_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const MATERIAL_FOLDER = "Material del cliente";

export default async function MaterialesClientePage() {
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
        briefScope: true,
        briefDeliverables: true,
        folders: {
          orderBy: { position: "asc" },
          select: { name: true, files: { where: { deletedAt: null }, select: { id: true, name: true, kind: true, createdAt: true } } },
        },
        files: { where: { folderId: null, deletedAt: null }, select: { id: true, name: true, kind: true, createdAt: true } },
      },
    }),
    onlyofficeReady(),
  ]);

  const grupos = proyectos.map((p) => {
    const allFiles = [...p.folders.flatMap((f) => f.files.map((x) => ({ ...x, carpeta: f.name }))), ...p.files.map((x) => ({ ...x, carpeta: null as string | null }))];
    // Documentos de Office editables (guion, propuesta, planilla) del NAS de la app.
    const docs = allFiles
      .filter((f) => (f.kind === "LOCAL" || f.kind === "OPS") && officeType(f.name) !== null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    // Material que aportó el cliente: lo de la carpeta «Material del cliente» que sea imagen/video.
    const materiales = p.folders
      .filter((f) => f.name === MATERIAL_FOLDER)
      .flatMap((f) => f.files)
      .filter((f) => MEDIA_RE.test(f.name))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return {
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      finished: Boolean(p.finishedAt),
      briefScope: p.briefScope?.trim() || null,
      briefDeliverables: p.briefDeliverables?.trim() || null,
      docs,
      materiales,
    };
  });

  const [presencia, comentarios] = await Promise.all([
    docPresenceFor(grupos.flatMap((g) => g.docs.map((d) => d.id))),
    db.docComment.groupBy({
      by: ["fileId"],
      where: { fileId: { in: grupos.flatMap((g) => g.docs.map((d) => d.id)) }, resolved: false },
      _count: { _all: true },
    }),
  ]);
  const sinResolver = new Map(comentarios.map((c) => [c.fileId, c._count._all]));
  const puedeEscribir = hasPermission(session, "subir_archivos");

  const vacio = grupos.every((g) => !g.briefScope && !g.briefDeliverables && g.docs.length === 0 && g.materiales.length === 0 && g.finished);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Materiales</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
          El espacio de trabajo de cada proyecto: lo que acordamos, el material que nos compartes y los
          documentos que editamos juntos en vivo.
        </p>
      </header>

      <ClientPortalNav active="documentos" />

      {grupos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Cuando el equipo te agregue a un proyecto, aquí verás su brief y podrás compartir material.
        </p>
      ) : vacio ? (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Todavía no hay materiales ni documentos. Cuando el equipo comparta el brief o un documento, aparecerá aquí.
        </p>
      ) : (
        <div className="space-y-5">
          {grupos.map((g) => {
            const tieneBrief = g.briefScope || g.briefDeliverables;
            return (
              <section key={g.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                {/* Cabecera del proyecto */}
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-lg">
                    <EntityEmoji value={g.emoji} fallback="📁" />
                  </span>
                  <Link href={`/proyectos/${g.id}?tab=archivos`} className="text-sm font-semibold hover:underline">
                    {g.name}
                  </Link>
                  {g.finished ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">entregado</span>
                  ) : null}
                </div>

                <div className="space-y-5 p-4">
                  {/* ── BRIEF: lo acordado + compromisos ── */}
                  {tieneBrief ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {g.briefScope ? (
                        <div className="rounded-xl border border-border bg-background/40 p-3.5">
                          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                            <Target className="size-3.5" /> Lo que haremos
                          </p>
                          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{g.briefScope}</p>
                        </div>
                      ) : null}
                      {g.briefDeliverables ? (
                        <div className="rounded-xl border border-border bg-background/40 p-3.5">
                          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                            <ListChecks className="size-3.5" /> Entregables y compromisos
                          </p>
                          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{g.briefDeliverables}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* ── MATERIAL que aporta el cliente ── */}
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Material que compartes {g.materiales.length ? `· ${g.materiales.length}` : ""}
                    </p>
                    {g.materiales.length ? (
                      <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                        {g.materiales.map((m) => {
                          const isImg = IMG_RE.test(m.name);
                          const href = photoViewSrc({ fileAssetId: m.id, url: null });
                          return (
                            <a
                              key={m.id}
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              title={m.name}
                              className="group relative block aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                            >
                              {isImg ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={photoThumbSrc({ fileAssetId: m.id, url: null })} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                              ) : (
                                <span className="grid size-full place-items-center text-muted-foreground"><Film className="size-6" /></span>
                              )}
                              <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 text-[10px] text-white">{m.name}</span>
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                    {g.finished ? (
                      g.materiales.length ? null : (
                        <p className="text-xs text-muted-foreground">Este proyecto ya se entregó.</p>
                      )
                    ) : (
                      <MaterialUpload projectId={g.id} />
                    )}
                  </div>

                  {/* ── DOCUMENTOS de Office (OnlyOffice) ── */}
                  {g.docs.length || puedeEscribir ? (
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          Documentos {g.docs.length ? `· ${g.docs.length}` : ""}
                        </p>
                        {puedeEscribir && !g.finished ? (
                          <Link href="/documentos/nuevo" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-accent">
                            <FilePlus2 className="size-3.5" /> Nuevo
                          </Link>
                        ) : null}
                      </div>
                      {!editorListo ? (
                        <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                          El editor de documentos todavía no está conectado.
                        </p>
                      ) : g.docs.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                          Aún no hay documentos. Cuando el equipo comparta un guion o una propuesta, lo editarás aquí.
                        </p>
                      ) : (
                        <ul className="divide-y divide-border rounded-lg border border-border">
                          {g.docs.map((d) => {
                            const Icono = ICONO[officeType(d.name) ?? "word"];
                            const dentro = (presencia.get(d.id) ?? []).filter((pp) => pp.id !== session.id);
                            const pend = sinResolver.get(d.id) ?? 0;
                            const modo = g.finished ? "ver" : puedeEscribir ? "editar" : "sugerir";
                            return (
                              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
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
                                    title={`${dentro.map((pp) => pp.name).join(", ")} ${dentro.length === 1 ? "lo tiene" : "lo tienen"} abierto ahora`}
                                    className="hidden shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 sm:inline-flex dark:text-emerald-400"
                                  >
                                    <span className="size-1.5 rounded-full bg-emerald-500" />
                                    {dentro.length === 1 ? dentro[0].name.split(" ")[0] : `${dentro.length} dentro`}
                                  </span>
                                ) : null}
                                {pend ? (
                                  <span title={`${pend} comentario${pend === 1 ? "" : "s"} sin resolver`} className="hidden shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 sm:inline-flex dark:text-amber-400">
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
                      )}
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
