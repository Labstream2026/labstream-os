import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";
import { accessibleProjectWhere } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";
import { deliverableStatusMeta, DELIVERABLE_TYPE, formatTimecode } from "@/lib/ui";
import { formatBogota } from "@/lib/bogota-time";
import { EntityEmoji } from "@/components/icons/marks";
import { JumpButton, MarkersBar, ResolveToggle, RefreshButton, ZoomImage, type MarkerItem } from "./panel-client";

// Panel compacto de correcciones para DaVinci Resolve: clientes → proyectos → videos →
// correcciones de UN video (vista de foco). Solo enseña revisión de entregables — nada de
// tareas, chat ni finanzas. El alcance de proyectos es el MISMO de la app
// (accessibleProjectWhere): privados solo para su equipo.
export const dynamic = "force-dynamic";

// Filtro de comentarios ACCIONABLES para el EQUIPO: fuera SOLO los borradores internos de
// pre-aprobación sin sellar Y de primer nivel (parentId null) — esos aún se editan/borran.
// Las RESPUESTAS internas de hilo (visibleToClient=false, lockedAt null) SÍ se muestran: el
// equipo las ve en /revisiones y solo se sellarían en el próximo «solicitar cambios». Este
// panel exige sesión de equipo (abajo), así que no se filtra nada de cara al cliente aquí.
const ACCIONABLE = { NOT: { fromClient: false as const, visibleToClient: false as const, lockedAt: null, parentId: null } };
// Punto del checklist de verdad: ni nota suelta ni respuesta de hilo.
const CHECKLIST_PENDIENTE = { ...ACCIONABLE, isNote: false as const, parentId: null, resolved: false as const };

type Search = { p?: string; d?: string; v?: string; oc?: string };

// Un parámetro repetido llega como string[]: nos quedamos con el primero (evita pasarle un
// array a Prisma, que revienta la query con un 500 en vez del «no disponible» amable).
function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ResolvePanelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const sp: Search = { p: one(raw.p), d: one(raw.d), v: one(raw.v), oc: one(raw.oc) };
  // El guard se repite AQUÍ (no solo en el layout) a propósito: los layouts no se re-ejecutan
  // en navegaciones suaves (p. ej. ?p= → ?d=), así que un usuario desactivado a mitad de
  // sesión —o el rol cliente pidiendo el segmento suelto— debe cortarse cerca de los datos.
  const session = await getSession();
  if (!session) redirect("/login?next=/resolve");
  if (session.role === "cliente") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center text-sm text-zinc-300">
        <p>
          Este panel es para el equipo de edición.
          <br />
          Tu espacio de revisión es el enlace que te compartió el equipo.
        </p>
      </div>
    );
  }
  if (sp.d) return <DeliverableView id={sp.d} vParam={sp.v} hideDone={sp.oc === "1"} session={session} />;
  if (sp.p) return <ProjectView id={sp.p} session={session} />;
  return <HomeView session={session} />;
}

function Chrome({ session, back, title, subtitle, children }: {
  session: SessionUser;
  back?: { href: string; label: string };
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {back ? (
              <Link href={back.href} className="text-[11px] text-zinc-400 hover:text-zinc-200">← {back.label}</Link>
            ) : (
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Labstream · Correcciones</p>
            )}
            <h1 className="truncate text-sm font-semibold text-zinc-100">{title}</h1>
            {subtitle ? <p className="truncate text-[11px] text-zinc-400">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] text-zinc-400">
            <span className="max-w-24 truncate" title={session.name}>{session.name}</span>
            <RefreshButton />
          </div>
        </div>
      </header>
      <main className="flex-1 px-3 py-3">{children}</main>
    </div>
  );
}

function PendingBadge({ n }: { n: number }) {
  if (!n) return <span className="text-[11px] text-zinc-500">al día</span>;
  return (
    <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-300">
      {n} {n === 1 ? "pendiente" : "pendientes"}
    </span>
  );
}

// ── Vista 1: clientes con sus proyectos ──
async function HomeView({ session }: { session: SessionUser }) {
  const clients = await db.client.findMany({
    where: { AND: [accessibleClientWhere(session), { isActive: true, archivedAt: null }] },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      emoji: true,
      projects: {
        where: accessibleProjectWhere(session),
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          emoji: true,
          finishedAt: true, // se marca en la lista: entregado ≠ activo (las correcciones siguen abiertas)
          deliverables: {
            where: { archivedAt: null },
            select: { id: true, _count: { select: { reviewComments: { where: CHECKLIST_PENDIENTE } } } },
          },
        },
      },
    },
  });
  const withProjects = clients.filter((c) => c.projects.length > 0);

  return (
    <Chrome session={session} title="Elige el proyecto" subtitle="Solo revisión de entregables — sin tareas ni nada más.">
      {withProjects.length === 0 ? (
        <p className="pt-8 text-center text-sm text-zinc-400">No tienes proyectos visibles todavía.</p>
      ) : (
        <div className="space-y-4">
          {withProjects.map((c) => (
            <section key={c.id}>
              <h2 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <EntityEmoji value={c.emoji} fallback="🤝" /> {c.name}
              </h2>
              <div className="overflow-hidden rounded-lg border border-zinc-800">
                {c.projects.map((p, i) => {
                  const videosConPendientes = p.deliverables.filter((d) => d._count.reviewComments > 0).length;
                  return (
                    <Link
                      key={p.id}
                      href={`/resolve?p=${p.id}`}
                      className={`flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-zinc-900 ${i > 0 ? "border-t border-zinc-800/70" : ""}`}
                    >
                      <span className="min-w-0 truncate text-sm text-zinc-100">
                        <EntityEmoji value={p.emoji} fallback="🎬" /> {p.name}
                        {p.finishedAt ? (
                          <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 align-middle text-[10px] font-medium text-emerald-300">
                            entregado
                          </span>
                        ) : null}
                      </span>
                      {videosConPendientes ? (
                        <span className="shrink-0 rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-300">
                          {videosConPendientes} {videosConPendientes === 1 ? "video con pendientes" : "videos con pendientes"}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-zinc-500">al día</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </Chrome>
  );
}

// ── Vista 2: videos (entregables) de un proyecto ──
async function ProjectView({ id, session }: { id: string; session: SessionUser }) {
  const project = await db.project.findFirst({
    where: { AND: [{ id }, accessibleProjectWhere(session)] },
    select: {
      id: true,
      name: true,
      emoji: true,
      client: { select: { name: true } },
      deliverables: {
        where: { archivedAt: null },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          number: true,
          type: true,
          status: true,
          versions: { orderBy: { number: "desc" }, take: 1, select: { number: true, durationSec: true } },
          reviewComments: { where: { ...ACCIONABLE, isNote: false, parentId: null }, select: { resolved: true } },
        },
      },
    },
  });
  if (!project) {
    return (
      <Chrome session={session} back={{ href: "/resolve", label: "Proyectos" }} title="Proyecto no disponible">
        <p className="pt-8 text-center text-sm text-zinc-400">Este proyecto no existe o no tienes acceso.</p>
      </Chrome>
    );
  }
  const items = project.deliverables
    .map((d) => {
      const total = d.reviewComments.length;
      const pendientes = d.reviewComments.filter((c) => !c.resolved).length;
      return { ...d, total, pendientes };
    })
    .sort((a, b) => b.pendientes - a.pendientes);

  return (
    <Chrome
      session={session}
      back={{ href: "/resolve", label: "Proyectos" }}
      title={<><EntityEmoji value={project.emoji} fallback="🎬" /> {project.name}</>}
      subtitle={project.client.name}
    >
      {items.length === 0 ? (
        <p className="pt-8 text-center text-sm text-zinc-400">Este proyecto aún no tiene entregables.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          {items.map((d, i) => {
            const meta = deliverableStatusMeta(d.status);
            const v = d.versions[0];
            return (
              <Link
                key={d.id}
                href={`/resolve?d=${d.id}`}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-zinc-900 ${i > 0 ? "border-t border-zinc-800/70" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-zinc-100">
                    {d.number ? <span className="text-zinc-500">#{d.number} </span> : null}
                    {d.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.className}`}>{meta.label}</span>
                    <span>{DELIVERABLE_TYPE[d.type] ?? d.type}</span>
                    {v ? <span>· v{v.number}{v.durationSec ? ` · ${formatTimecode(v.durationSec)}` : ""}</span> : null}
                  </span>
                </span>
                <span className="shrink-0"><PendingBadge n={d.pendientes} /></span>
              </Link>
            );
          })}
        </div>
      )}
    </Chrome>
  );
}

// ── Vista 3: UN video en foco, con sus correcciones ──
async function DeliverableView({ id, vParam, hideDone, session }: { id: string; vParam?: string; hideDone: boolean; session: SessionUser }) {
  const d = await db.deliverable.findFirst({
    where: { id, project: accessibleProjectWhere(session) },
    select: {
      id: true,
      name: true,
      number: true,
      type: true,
      status: true,
      fixDueAt: true,
      projectId: true,
      project: { select: { name: true, emoji: true, finishedAt: true, client: { select: { name: true } } } },
      reviewComments: {
        where: ACCIONABLE,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          authorName: true,
          fromClient: true,
          body: true,
          timecode: true,
          versionNumber: true,
          priority: true,
          resolved: true,
          resolvedAt: true,
          resolvedBy: { select: { name: true } },
          isNote: true,
          parentId: true,
          drawingData: true,
          editedAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!d) {
    return (
      <Chrome session={session} back={{ href: "/resolve", label: "Proyectos" }} title="Video no disponible">
        <p className="pt-8 text-center text-sm text-zinc-400">Este entregable no existe o no tienes acceso.</p>
      </Chrome>
    );
  }

  const all = d.reviewComments.map((c) => ({
    ...c,
    drawing: (c.drawingData as { image?: string } | null)?.image ?? null,
  }));
  const roots = all.filter((c) => !c.isNote && !c.parentId);
  const notes = all.filter((c) => c.isNote && !c.parentId);
  const repliesOf = (pid: string) => all.filter((c) => c.parentId === pid);

  // Filtro de versión: por defecto la ÚLTIMA versión con correcciones (foco en lo vigente);
  // los comentarios sin versión se muestran siempre. «Todas» junta el histórico.
  const versionsWithComments = [...new Set(roots.map((c) => c.versionNumber).filter((n): n is number => n != null))].sort((a, b) => b - a);
  const defaultV = versionsWithComments[0] ?? null;
  // Una versión corrupta en la URL (?v=abc) daba NaN → el filtro no lo cumplía NADIE y el panel
  // decía «Nada pendiente 🎉» con correcciones sin hacer. Ahora un valor inválido cae al defecto.
  const vParsed = vParam ? Number(vParam) : NaN;
  const selectedV: number | "all" =
    vParam === "all" ? "all" : Number.isFinite(vParsed) ? vParsed : defaultV ?? "all";
  const inVersion = (c: { versionNumber: number | null }) =>
    selectedV === "all" || c.versionNumber == null || c.versionNumber === selectedV;

  const visibles = roots
    .filter(inVersion)
    .filter((c) => !hideDone || !c.resolved)
    .sort((a, b) => {
      const ta = a.timecode ?? Number.POSITIVE_INFINITY;
      const tb = b.timecode ?? Number.POSITIVE_INFINITY;
      return ta - tb || a.createdAt.getTime() - b.createdAt.getTime();
    });
  const filtradas = roots.filter(inVersion);
  const hechas = filtradas.filter((c) => c.resolved).length;

  const markerItems: MarkerItem[] = filtradas.map((c) => ({
    id: c.id,
    seconds: c.timecode,
    body: c.body,
    author: c.authorName,
    priority: c.priority,
    resolved: c.resolved,
    version: c.versionNumber,
    hasDrawing: !!c.drawing,
  }));

  const meta = deliverableStatusMeta(d.status);
  const qs = (v: number | "all", oc: boolean) => `/resolve?d=${d.id}&v=${v}${oc ? "&oc=1" : ""}`;

  return (
    <Chrome
      session={session}
      back={{ href: `/resolve?p=${d.projectId}`, label: project0(d.project.name) }}
      title={<>{d.number ? <span className="text-zinc-500">#{d.number} </span> : null}{d.name}</>}
      subtitle={<><EntityEmoji value={d.project.emoji} fallback="🎬" /> {d.project.name} · {d.project.client.name}</>}
    >
      {d.project.finishedAt ? (
        <p className="mb-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-emerald-200">
          🏁 Proyecto ya entregado — <b>puedes cerrar estas correcciones y subir la versión corregida</b> con normalidad.
        </p>
      ) : null}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.className}`}>{meta.label}</span>
        <span className="text-zinc-400">{hechas}/{filtradas.length} hechas</span>
        {d.status === "CORRECCIONES" && d.fixDueAt ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
            Entrega: {formatBogota(d.fixDueAt)}
          </span>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]">
        {versionsWithComments.map((n) => (
          <Link
            key={n}
            href={qs(n, hideDone)}
            className={`rounded px-2 py-0.5 font-medium ${selectedV === n ? "bg-indigo-500/25 text-indigo-200" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
          >
            v{n}
          </Link>
        ))}
        <Link
          href={qs("all", hideDone)}
          className={`rounded px-2 py-0.5 font-medium ${selectedV === "all" ? "bg-indigo-500/25 text-indigo-200" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
        >
          Todas
        </Link>
        <span className="grow" />
        <Link href={qs(selectedV, !hideDone)} className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline">
          {hideDone ? `Ver hechas (${hechas})` : "Ocultar hechas"}
        </Link>
      </div>

      <div className="pb-24">
      {visibles.length === 0 ? (
        <p className="pt-6 text-center text-sm text-zinc-400">
          {filtradas.length ? "Nada pendiente con este filtro. 🎉" : "Este video aún no tiene correcciones."}
        </p>
      ) : (
        <ol className="space-y-2">
          {visibles.map((c) => (
            <li
              key={c.id}
              className={`rounded-lg border p-2.5 ${c.resolved ? "border-emerald-500/25 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/60"}`}
            >
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {c.timecode != null ? <JumpButton seconds={c.timecode} label={formatTimecode(c.timecode)} /> : null}
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${c.priority === "SUGERENCIA" ? "bg-zinc-800 text-zinc-400" : "bg-orange-500/15 text-orange-300"}`}>
                  {c.priority === "SUGERENCIA" ? "Sugerencia" : "Obligatoria"}
                </span>
                <span className="text-zinc-500">{c.authorName}{c.fromClient ? " · cliente" : " · equipo"}</span>
                {c.versionNumber != null && selectedV === "all" ? <span className="text-zinc-600">v{c.versionNumber}</span> : null}
                {c.editedAt ? <span className="italic text-zinc-600">editado</span> : null}
                <span className="grow" />
                <ResolveToggle commentId={c.id} projectId={d.projectId} resolved={c.resolved} />
              </div>
              <p className={`mt-1 whitespace-pre-wrap text-sm ${c.resolved ? "text-zinc-400 line-through" : "text-zinc-100"}`}>{c.body}</p>
              {c.drawing ? <ZoomImage src={c.drawing} alt="Captura del cliente" /> : null}
              {c.resolved ? (
                <p className="mt-1 text-[10px] text-emerald-400/80">
                  ✓ Hecho{c.resolvedBy?.name ? ` · ${c.resolvedBy.name}` : ""}{c.resolvedAt ? ` · ${formatBogota(c.resolvedAt)}` : ""}
                </p>
              ) : null}
              {repliesOf(c.id).map((r) => (
                <div key={r.id} className="mt-1.5 border-l-2 border-zinc-700 pl-2 text-[13px]">
                  <span className="text-[11px] text-zinc-500">{r.authorName}:</span>{" "}
                  <span className="text-zinc-300">{r.body}</span>
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}

      {notes.length ? (
        <section className="mt-4">
          <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Notas generales</h2>
          <ul className="space-y-1.5">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 text-[13px] text-zinc-300">
                <span className="text-[11px] text-zinc-500">{n.authorName}:</span> {n.body}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      </div>

      <MarkersBar items={markerItems} deliverableId={d.id} />
    </Chrome>
  );
}

// El «volver» del video muestra el nombre del proyecto recortado para no desbordar la cabecera.
function project0(name: string): string {
  return name.length > 22 ? name.slice(0, 21) + "…" : name;
}
