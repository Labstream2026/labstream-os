import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";
import { accessibleProjectWhere } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";
import { deliverableStatusMeta, DELIVERABLE_TYPE, formatTimecode } from "@/lib/ui";
import { formatBogota, bogotaDayKey } from "@/lib/bogota-time";
import { ahoraMs, VIDEO_ARCHIVO_EXT } from "@/lib/archivos/tipos";
import { EntityEmoji } from "@/components/icons/marks";
import { Logo } from "@/components/brand/logo";
import { AutoBanner, AutoDetect, CorrectionsList, MarkersBar, RefreshButton, Thumb, UpdateBanner, type FilaCorreccion, type MarkerItem } from "./panel-client";
import { TONE_MAP } from "@/lib/colors";

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

type Search = { p?: string; d?: string; v?: string; oc?: string; auto?: string; ord?: string; todo?: string; vista?: string };

// Un parámetro repetido llega como string[]: nos quedamos con el primero (evita pasarle un
// array a Prisma, que revienta la query con un 500 en vez del «no disponible» amable).
function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ResolvePanelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const sp: Search = { p: one(raw.p), d: one(raw.d), v: one(raw.v), oc: one(raw.oc), auto: one(raw.auto), ord: one(raw.ord), todo: one(raw.todo), vista: one(raw.vista) };
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
  if (sp.d) return <DeliverableView id={sp.d} vParam={sp.v} hideDone={sp.oc === "1"} porPrioridad={sp.ord === "prio"} auto={sp.auto === "1"} session={session} />;
  if (sp.p) return <ProjectView id={sp.p} session={session} />;
  // La portada por defecto es lo pendiente PROPIO; lo del equipo y la navegación completa
  // quedan a un toque.
  if (sp.todo === "1") return <HomeView session={session} />;
  return <PendientesView session={session} vista={sp.vista === "equipo" ? "equipo" : "mios"} />;
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
              // El logotipo REAL en vez del nombre escrito. Sale en su versión blanca porque el
              // panel es oscuro (el Logo cambia solo con el tema, y el layout lo envuelve en .dark);
              // el logotipo NEGRO es el que va en el icono de la ventana, sobre fondo claro.
              <div className="flex items-center gap-1.5">
                <Logo className="h-4" />
                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Correcciones</span>
              </div>
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

// Días de CALENDARIO en Bogotá que faltan para una fecha. No sirve dividir la diferencia entre
// 86.400.000: eso mide bloques de 24 h desde este instante, y como fixDueAt lleva hora del día,
// un plazo que vence hoy a las 20:00 salía como «vence mañana» a las 9 de la mañana, y uno
// vencido hace tres horas salía como «vence hoy». Comparando las fechas del calendario de
// Bogotá —que es el huso en el que trabaja el equipo— cada etiqueta dice lo que parece decir.
function diasHasta(fecha: Date, ahoraMsVal: number): number {
  const dia = (d: Date) => {
    const [a, m, x] = bogotaDayKey(d).split("-").map((n) => parseInt(n, 10));
    return Date.UTC(a, m - 1, x);
  };
  return Math.round((dia(fecha) - dia(new Date(ahoraMsVal))) / 86400000);
}

function PendingBadge({ n }: { n: number }) {
  if (!n) return <span className="text-[11px] text-zinc-500">al día</span>;
  return (
    <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-300">
      {n} {n === 1 ? "pendiente" : "pendientes"}
    </span>
  );
}

// Pestañas de la portada.
//   Míos       lo que el editor tiene bajo su lupa (es responsable o miembro del proyecto)
//   Del equipo lo pendiente de proyectos donde NO está, para que un ajuste sencillo lo pueda
//              hacer cualquiera sin esperar al dueño del proyecto
//   Todos      la navegación por cliente y proyecto, para abrir un video que no tiene nada
//              pendiente (revisar algo entregado, buscar una versión vieja)
function Tabs({ activa, nMios, nEquipo }: { activa: "mios" | "equipo" | "todo"; nMios: number; nEquipo: number }) {
  const base = "flex-1 rounded-md px-2 py-1.5 text-center text-[12px] font-medium transition-colors";
  const on = "bg-zinc-800 text-zinc-100";
  const off = "text-zinc-400 hover:text-zinc-200";
  const cuenta = (n: number, fuerte: boolean) =>
    n ? (
      <span className={`ml-1 rounded-full px-1.5 text-[11px] ${fuerte ? "bg-orange-500/20 text-orange-300" : "bg-zinc-700/60 text-zinc-300"}`}>
        {n}
      </span>
    ) : null;
  return (
    <div className="mb-3 flex gap-1 rounded-lg bg-zinc-900 p-1">
      <Link href="/resolve" className={`${base} ${activa === "mios" ? on : off}`}>
        Míos{cuenta(nMios, true)}
      </Link>
      <Link href="/resolve?vista=equipo" className={`${base} ${activa === "equipo" ? on : off}`}>
        Del equipo{cuenta(nEquipo, false)}
      </Link>
      <Link href="/resolve?todo=1" className={`${base} ${activa === "todo" ? on : off}`}>
        Todos
      </Link>
    </div>
  );
}

// El ALCANCE de lo pendiente, en un solo sitio. Lo comparten la vista de pendientes y las
// cuentas de las pestañas de «Todos»: cuando cada una lo escribía a su manera, HomeView contaba
// con alcance de CLIENTE y PendientesView con alcance de PROYECTO, así que el mismo badge decía
// «Del equipo 5» en una pestaña y «Del equipo 0» en la otra.
function pendientesWhere(session: SessionUser) {
  return {
    archivedAt: null,
    project: { AND: [accessibleProjectWhere(session), { client: { isActive: true, archivedAt: null } }] },
    reviewComments: { some: CHECKLIST_PENDIENTE },
  };
}

// Cuántos videos esperan cambios, repartidos entre los del propio editor y los del resto.
async function contarPendientes(session: SessionUser) {
  const filas = await db.deliverable.findMany({
    where: pendientesWhere(session),
    select: { project: { select: { leadId: true, members: { where: { userId: session.id }, select: { userId: true } } } } },
  });
  let mios = 0;
  for (const f of filas) if (f.project.leadId === session.id || f.project.members.length > 0) mios++;
  return { mios, equipo: filas.length - mios };
}

// ── Vista 1a (la de entrada): los VIDEOS que tienen correcciones sin resolver ──
// Antes había que bajar por una lista de clientes y proyectos donde casi todo decía «al día»
// para encontrar los pocos con trabajo. Aquí se salta ese paso: se listan los videos, no los
// proyectos, y solo los que tienen algo que corregir. De tres toques a uno.
async function PendientesView({ session, vista }: { session: SessionUser; vista: "mios" | "equipo" }) {
  const todos = await db.deliverable.findMany({
    where: pendientesWhere(session),
    select: {
      id: true,
      name: true,
      number: true,
      type: true,
      status: true,
      fixDueAt: true,
      updatedAt: true,
      coverFileAssetId: true,
      project: {
        select: {
          id: true,
          name: true,
          emoji: true,
          leadId: true,
          // Filtrado al usuario de la sesión: solo hace falta saber SI está, no quiénes son
          // todos los miembros.
          members: { where: { userId: session.id }, select: { userId: true } },
          client: { select: { id: true, name: true, emoji: true, logoUrl: true, accentColor: true } },
        },
      },
      versions: { orderBy: { number: "desc" }, take: 1, select: { number: true, fileAsset: { select: { id: true, name: true } } } },
      reviewComments: { where: CHECKLIST_PENDIENTE, select: { priority: true } },
    },
  });

  // «Mío» = soy el responsable del proyecto o estoy en su equipo. Lo demás es del equipo: sigue
  // siendo visible y editable —la idea es justo esa, que un ajuste sencillo lo pueda hacer
  // cualquiera sin esperar al dueño— pero vive en su propia pestaña para no mezclarse con la
  // carga de trabajo propia.
  const esMio = (v: (typeof todos)[number]) => v.project.leadId === session.id || v.project.members.length > 0;
  const mios = todos.filter(esMio);
  const equipo = todos.filter((v) => !esMio(v));
  const videos = vista === "mios" ? mios : equipo;

  // Orden: primero lo que tiene fecha de entrega (y de esas, la más próxima), luego lo más
  // reciente. Lo que vence manda sobre lo que se tocó hace poco.
  const ordenados = [...videos].sort((a, b) => {
    if (a.fixDueAt && b.fixDueAt) return a.fixDueAt.getTime() - b.fixDueAt.getTime();
    if (a.fixDueAt) return -1;
    if (b.fixDueAt) return 1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  // Se agrupa por cliente conservando el orden de urgencia: el cliente cuyo video es más
  // urgente sale arriba.
  const grupos: {
    id: string;
    name: string;
    emoji: string | null;
    logoUrl: string | null;
    hex: string | null;
    videos: typeof ordenados;
  }[] = [];
  for (const v of ordenados) {
    const c = v.project.client;
    let g = grupos.find((x) => x.id === c.id);
    if (!g) {
      // accentColor guarda una CLAVE de paleta ("naranja", "verde"…), no un hex: interpolarla
      // en un color CSS producía basura como "naranja22" y el recuadro salía siempre gris.
      // TONE_MAP la traduce, igual que hace la barra lateral.
      const hex = (c.accentColor && TONE_MAP[c.accentColor]?.hex) || null;
      g = { id: c.id, name: c.name, emoji: c.emoji, logoUrl: c.logoUrl, hex, videos: [] };
      grupos.push(g);
    }
    g.videos.push(v);
  }

  // `ahoraMs()` y no `Date.now()`: el lint de pureza prohíbe llamar impuras en el cuerpo del
  // componente; el helper de lib es la vía aceptada en esta base.
  const hoy = ahoraMs();

  return (
    <Chrome
      session={session}
      title={vista === "mios" ? "Lo tuyo por corregir" : "Pendientes del equipo"}
      subtitle={
        videos.length
          ? `${videos.length} ${videos.length === 1 ? "video espera" : "videos esperan"} cambios`
          : undefined
      }
    >
      <AutoDetect />
      <UpdateBanner />
      <Tabs activa={vista} nMios={mios.length} nEquipo={equipo.length} />
      {vista === "equipo" && videos.length > 0 ? (
        <p className="mb-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] text-zinc-400">
          Proyectos donde no estás asignado. Si el ajuste es sencillo, hazlo — el responsable lo verá marcado con tu nombre.
        </p>
      ) : null}
      {videos.length === 0 ? (
        <div className="pt-10 text-center">
          <p className="text-2xl">✓</p>
          <p className="mt-2 text-sm text-zinc-300">
            {vista === "mios" ? "No tienes correcciones pendientes." : "El equipo no tiene nada pendiente."}
          </p>
          <p className="mt-1 text-[12px] text-zinc-500">
            {vista === "mios" && equipo.length > 0 ? (
              <>
                Quedan {equipo.length} en <Link href="/resolve?vista=equipo" className="text-indigo-300 hover:underline">Del equipo</Link>.
              </>
            ) : (
              "Todo lo que compartieron los clientes está resuelto."
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <section key={g.id}>
              <h2 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <EntityEmoji value={g.emoji} fallback="🤝" /> {g.name}
              </h2>
              <div className="overflow-hidden rounded-lg border border-zinc-800">
                {g.videos.map((v, i) => {
                  const suger = v.reviewComments.filter((c) => c.priority === "SUGERENCIA").length;
                  const oblig = v.reviewComments.length - suger;
                  const vence = v.fixDueAt ? diasHasta(v.fixDueAt, hoy) : null;
                  const ver = v.versions[0];
                  const arch = ver?.fileAsset ?? null;
                  // La PORTADA se pide con ?thumb=1. Sin ese parámetro, /api/files-asset trata
                  // la petición como una apertura del archivo y escribe un registro de actividad
                  // «abrió/descargó …» por cada video con portada Y en cada recarga del panel —
                  // que aquí es la pantalla de entrada y se refresca toda la jornada. Además
                  // sirve la miniatura cacheable un día en vez de la vista grande sin caché.
                  const thumb = v.coverFileAssetId
                    ? `/api/files-asset/${v.coverFileAssetId}?thumb=1`
                    : arch && VIDEO_ARCHIVO_EXT.test(arch.name)
                      ? `/api/files-asset/${arch.id}?poster=1`
                      : g.logoUrl
                        ? `/api/client-asset/logo/${g.id}`
                        : null;
                  return (
                    <Link
                      key={v.id}
                      href={`/resolve?d=${v.id}`}
                      className={`flex items-center gap-2.5 px-2.5 py-2 hover:bg-zinc-900 ${i > 0 ? "border-t border-zinc-800/70" : ""}`}
                    >
                      <Thumb
                        src={thumb}
                        color={g.hex}
                        fallback={<EntityEmoji value={v.project.emoji ?? g.emoji} fallback="🎬" />}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-100">
                          {v.number ? <span className="font-normal text-zinc-500">#{v.number} </span> : null}
                          {v.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                          {v.project.name}
                          {ver ? ` · v${ver.number}` : ""}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {oblig > 0 ? (
                            <span className="rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-300">
                              {oblig} por corregir
                            </span>
                          ) : null}
                          {suger > 0 ? (
                            <span className="rounded-full bg-zinc-700/50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                              {suger} sug.
                            </span>
                          ) : null}
                          {vence !== null ? (
                            <span
                              className={`text-[10px] ${vence < 0 ? "text-red-400" : vence <= 2 ? "text-amber-400" : "text-zinc-500"}`}
                            >
                              {vence < 0 ? "vencida" : vence === 0 ? "vence hoy" : vence === 1 ? "vence mañana" : `vence en ${vence} d`}
                            </span>
                          ) : null}
                        </span>
                      </span>
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

// ── Vista 1b: clientes con sus proyectos (navegación completa) ──
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
  // Las cuentas de las pestañas salen del MISMO alcance que usa la vista de pendientes, no de
  // esta consulta: la de aquí está acotada por acceso a CLIENTE y daría cifras distintas.
  const { mios: nMios, equipo: nEquipo } = await contarPendientes(session);

  return (
    <Chrome session={session} title="Todos los proyectos" subtitle="Solo revisión de entregables — sin tareas ni nada más.">
      {/* Si el panel corre dentro de Resolve, intenta abrir DIRECTO el video del timeline. */}
      <AutoDetect />
      <UpdateBanner />
      <Tabs activa="todo" nMios={nMios} nEquipo={nEquipo} />
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
async function DeliverableView({ id, vParam, hideDone, porPrioridad, auto, session }: { id: string; vParam?: string; hideDone: boolean; porPrioridad: boolean; auto: boolean; session: SessionUser }) {
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

  // Dos órdenes, porque son dos formas de trabajar: por TIMECODE se recorre el video de
  // principio a fin (lo normal al corregir); por PRIORIDAD se atacan primero las obligatorias
  // (lo normal cuando el tiempo aprieta y hay que entregar).
  const porTiempo = (a: (typeof roots)[number], b: (typeof roots)[number]) => {
    const ta = a.timecode ?? Number.POSITIVE_INFINITY;
    const tb = b.timecode ?? Number.POSITIVE_INFINITY;
    return ta - tb || a.createdAt.getTime() - b.createdAt.getTime();
  };
  const peso = (c: (typeof roots)[number]) => (c.resolved ? 2 : c.priority === "SUGERENCIA" ? 1 : 0);
  const visibles = roots
    .filter(inVersion)
    .filter((c) => !hideDone || !c.resolved)
    .sort((a, b) => (porPrioridad ? peso(a) - peso(b) || porTiempo(a, b) : porTiempo(a, b)));
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

  // Filas para la lista con teclado: se arma AQUÍ (servidor) y el componente cliente solo
  // pinta y navega — así el panel no vuelve a pedir nada para moverse por la lista.
  const filas: FilaCorreccion[] = visibles.map((c) => ({
    id: c.id,
    seconds: c.timecode,
    tcLabel: c.timecode != null ? formatTimecode(c.timecode) : null,
    body: c.body,
    author: c.authorName,
    fromClient: c.fromClient,
    priority: c.priority,
    resolved: c.resolved,
    version: selectedV === "all" ? c.versionNumber : null,
    editedAt: !!c.editedAt,
    drawing: c.drawing,
    resolvedInfo: c.resolved
      ? `✓ Hecho${c.resolvedBy?.name ? ` · ${c.resolvedBy.name}` : ""}${c.resolvedAt ? ` · ${formatBogota(c.resolvedAt)}` : ""}`
      : null,
    replies: repliesOf(c.id).map((r) => ({ id: r.id, author: r.authorName, body: r.body })),
  }));

  const meta = deliverableStatusMeta(d.status);
  const qs = (v: number | "all", oc: boolean, ord = porPrioridad) =>
    `/resolve?d=${d.id}&v=${v}${oc ? "&oc=1" : ""}${ord ? "&ord=prio" : ""}`;

  return (
    <Chrome
      session={session}
      back={{ href: `/resolve?p=${d.projectId}`, label: project0(d.project.name) }}
      title={<>{d.number ? <span className="text-zinc-500">#{d.number} </span> : null}{d.name}</>}
      subtitle={<><EntityEmoji value={d.project.emoji} fallback="🎬" /> {d.project.name} · {d.project.client.name}</>}
    >
      {auto ? <AutoBanner /> : null}
      <UpdateBanner />
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
        <Link
          href={qs(selectedV, hideDone, !porPrioridad)}
          title={porPrioridad ? "Ahora: obligatorias primero" : "Ahora: en orden del video"}
          className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          {porPrioridad ? "↕ por prioridad" : "↕ por tiempo"}
        </Link>
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
        <CorrectionsList items={filas} projectId={d.projectId} />
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
