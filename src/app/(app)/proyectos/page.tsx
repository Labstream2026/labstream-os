import Link from "next/link";
import { emojiToText } from "@/components/icons/marks";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accessibleProjectWhere, canWriteProject } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";
import { Plus, SearchX, SlidersHorizontal } from "lucide-react";
import { IconProyectos } from "@/components/icons";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { BuscadorUrl } from "@/components/ui/buscador-url";
import {
  AtajosBarra,
  BarraMandos,
  ChipFiltro,
  FranjaResumen,
  MenuBarra,
  MenuGrupo,
  MenuOpcion,
  MenuSeparador,
  type TramoResumen,
} from "@/components/ui/barra-menu";
import { statusMeta, formatShortDate } from "@/lib/ui";
import { PROJECT_STATUS_DEFAULTS } from "@/lib/project-status";
import { tone } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { CuerpoVista, SelectorVista } from "./vista-proyectos";
import { PipelineView, MasterTable, PortfolioView, type ViewProject, type StatusCol } from "./projects-views";

export const dynamic = "force-dynamic";

// Búsqueda sin acentos ni mayúsculas.
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Estados que ya no corren contra el reloj (el semáforo de entrega no aplica).
const DONE_STATUSES = new Set(["APROBADO", "ENTREGADO", "CERRADO", "CANCELADO"]);

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; cliente?: string; grupo?: string; vista?: string; vencidos?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  // «Terminados»: archivo de proyectos completados. La vista ACTIVA excluye los terminados
  // (finishedAt=null); la vista «Terminados» muestra solo esos (finishedAt≠null). Ninguna incluye
  // los de la papelera (accessibleProjectWhere ya filtra archivedAt).
  const terminados = sp.vista === "terminados";
  const projectWhere = { ...accessibleProjectWhere(session), finishedAt: terminados ? { not: null } : null };
  // Los dos contadores del conmutador, independientes de la vista que estés mirando: cada lado
  // enseña cuántos hay al otro lado sin tener que ir a verlo.
  const [activeCount, finishedCount] = await Promise.all([
    db.project.count({ where: { ...accessibleProjectWhere(session), finishedAt: null } }).catch(() => 0),
    db.project.count({ where: { ...accessibleProjectWhere(session), finishedAt: { not: null } } }).catch(() => 0),
  ]);
  // Solo traemos de la BD los proyectos que el usuario puede ver (no todos para
  // descartarlos en JS): el filtro de acceso va en la propia consulta.
  const allClients = await db.client.findMany({
    where: accessibleClientWhere(session),
    orderBy: { createdAt: "asc" },
    include: {
      projects: {
        where: projectWhere,
        orderBy: { createdAt: "asc" },
        include: {
          lead: { select: { initials: true, avatarColor: true } },
          members: { select: { userId: true, role: true, user: { select: { initials: true, avatarColor: true } } } },
          deliverables: { select: { dueDate: true } },
        },
      },
    },
  });

  const withProjects = allClients.filter((c) => c.projects.length > 0);
  const anyProjects = withProjects.length > 0;

  // ── Opciones de filtro (de TODO lo accesible, ANTES de filtrar) ──
  // emojiToText: el campo emoji puede ser un token "ls:<clave>" (ícono Labstream); en un label
  // de TEXTO plano se degrada a su emoji de respaldo — nunca mostrar el token crudo.
  const clientOptions = withProjects.map((c) => ({
    value: c.id,
    label: `${emojiToText(c.emoji) ? `${emojiToText(c.emoji)} ` : ""}${c.name}`,
  }));
  const statusRank = new Map(PROJECT_STATUS_DEFAULTS.map((s, i) => [s.key, i]));
  const statusesPresent = [...new Set(withProjects.flatMap((c) => c.projects.map((p) => p.status)))].sort(
    (a, b) => (statusRank.get(a) ?? 99) - (statusRank.get(b) ?? 99),
  );

  const now = Date.now();
  const isOverdue = (p: { dueDate: Date | null; status: string }) =>
    !!p.dueDate && p.dueDate.getTime() < now && !DONE_STATUSES.has(p.status);

  // ── Filtros activos (viven en la URL; el enlace es compartible) ──
  const qRaw = (sp.q ?? "").trim();
  const qn = norm(qRaw);
  const estadoSel = new Set((sp.estado ?? "").split(",").filter(Boolean));
  const clienteSel = new Set((sp.cliente ?? "").split(",").filter(Boolean));
  const grupo = sp.grupo === "estado" ? ("estado" as const) : ("cliente" as const);
  const soloVencidos = sp.vencidos === "1";
  // UN solo recuento de «cuántos filtros hay puestos», que usan el menú, las pastillas y los
  // estados vacíos. Antes había dos —el de la página contaba «vencidos» y el de la barra de
  // filtros no— y podían discrepar en la misma pantalla.
  const filtrosPuestos = estadoSel.size + clienteSel.size + (qRaw ? 1 : 0) + (soloVencidos ? 1 : 0);
  const hasFilters = filtrosPuestos > 0;

  // ── Los enlaces de la barra, construidos en UN solo sitio ──
  // Cada opción CONSERVA lo demás que tengas puesto. Antes los chips de estado enlazaban a
  // `/proyectos?estado=X` a secas y se llevaban por delante la búsqueda, el cliente y la
  // agrupación sin decir nada; y las URL se armaban pegando «?» y «&» a mano.
  const hrefCon = (over: {
    q?: string | null;
    estado?: string[] | null;
    cliente?: string[] | null;
    grupo?: "cliente" | "estado";
    vista?: "terminados" | null;
    vencidos?: boolean;
  } = {}) => {
    const v = over.vista === undefined ? (terminados ? "terminados" : null) : over.vista;
    const q = over.q === undefined ? qRaw : (over.q ?? "");
    const est = over.estado === undefined ? [...estadoSel] : (over.estado ?? []);
    const cli = over.cliente === undefined ? [...clienteSel] : (over.cliente ?? []);
    const gr = over.grupo ?? grupo;
    const ven = over.vencidos === undefined ? soloVencidos : over.vencidos;
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (est.length) p.set("estado", est.join(","));
    if (cli.length) p.set("cliente", cli.join(","));
    if (gr !== "cliente") p.set("grupo", gr); // «cliente» es el valor por defecto: no ensucia la URL
    if (v) p.set("vista", v);
    // «Vencidos» no aplica al archivo: un proyecto terminado ya no corre contra el reloj.
    if (ven && !v) p.set("vencidos", "1");
    const s = p.toString();
    return s ? `/proyectos?${s}` : "/proyectos";
  };

  // Cada estado y cada cliente son un interruptor: pulsar el que ya está puesto lo suelta. Antes
  // un chip encendido volvía a ponerse a sí mismo y no había forma de apagarlo desde ahí.
  const hrefEstado = (key: string) =>
    hrefCon({ estado: estadoSel.has(key) ? [...estadoSel].filter((k) => k !== key) : [...estadoSel, key] });
  const hrefCliente = (id: string) =>
    hrefCon({ cliente: clienteSel.has(id) ? [...clienteSel].filter((k) => k !== id) : [...clienteSel, id] });
  // Cruzar entre Activos y Terminados suelta el filtro de ESTADO a propósito: terminar un proyecto
  // lo deja siempre en Entregado, Cerrado o Cancelado (finishProject lo fuerza), así que arrastrar
  // «En curso» al archivo daría cero resultados el 100 % de las veces — y el estado culpable ni
  // siquiera aparecería en el menú para poder quitarlo. Lo demás (búsqueda, cliente) sí viaja.
  const hrefActivos = hrefCon({ vista: null, estado: null, vencidos: false });
  const hrefTerminados = hrefCon({ vista: "terminados", estado: null, vencidos: false });

  // ── Los cuatro filtros, cada uno por separado ──
  // Sueltos y no en un solo `if` porque los contadores de la franja y del menú necesitan aplicar
  // TODOS MENOS UNO (ver más abajo): así cada número dice lo que pasaría si pulsaras ahí.
  type Fila = { p: (typeof withProjects)[number]["projects"][number]; c: (typeof withProjects)[number] };
  const todos: Fila[] = withProjects.flatMap((c) => c.projects.map((p) => ({ p, c })));
  const pasaTexto = ({ p, c }: Fila) => !qn || norm(p.name).includes(qn) || norm(c.name).includes(qn);
  const pasaCliente = ({ c }: Fila) => clienteSel.size === 0 || clienteSel.has(c.id);
  const pasaEstado = ({ p }: Fila) => estadoSel.size === 0 || estadoSel.has(p.status);
  const pasaVencidos = ({ p }: Fila) => !soloVencidos || isOverdue(p);

  // Aplica los filtros en memoria (el acceso ya lo acotó la consulta).
  const clients = withProjects
    .filter((c) => clienteSel.size === 0 || clienteSel.has(c.id))
    .map((c) => ({
      ...c,
      projects: c.projects.filter((p) => [pasaEstado, pasaVencidos, pasaTexto].every((f) => f({ p, c }))),
    }))
    .filter((c) => c.projects.length > 0);

  const total = clients.reduce((n, c) => n + c.projects.length, 0);
  const grandTotal = withProjects.reduce((n, c) => n + c.projects.length, 0);

  // ── Payload de las vistas: fechas formateadas y semáforo calculados EN el servidor
  // (una sola verdad de "hoy"; el cliente solo pinta). ──
  const rows: ViewProject[] = clients.flatMap((c) =>
    c.projects.map((p) => {
      const teamMembers = p.members.filter((m) => m.userId !== p.leadId);
      const team = [
        ...(p.lead ? [{ initials: p.lead.initials, color: p.lead.avatarColor }] : []),
        ...teamMembers.map((m) => ({ initials: m.user.initials, color: m.user.avatarColor })),
      ];
      const dueMs = p.dueDate ? p.dueDate.getTime() : null;
      const days = dueMs != null ? Math.ceil((dueMs - now) / 86400000) : null;
      const dueTone: "bad" | "warn" | null =
        DONE_STATUSES.has(p.status) || days == null ? null : days < 0 ? "bad" : days <= 7 ? "warn" : null;
      const next = p.deliverables
        .filter((d) => d.dueDate && d.dueDate.getTime() >= now)
        .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())[0]?.dueDate ?? null;
      return {
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        color: p.color,
        // Franja/banda: color del proyecto → color del cliente → índigo por defecto.
        bandHex: p.color ? tone(p.color).hex : c.accentColor ? tone(c.accentColor).hex : "#6366f1",
        status: p.status,
        progress: p.progress,
        dueLabel: formatShortDate(p.dueDate),
        dueTone,
        dueMs,
        clientId: c.id,
        clientName: c.name,
        clientEmoji: c.emoji,
        team: team.slice(0, 4),
        teamCount: team.length,
        deliverables: p.deliverables.length,
        nextDueLabel: formatShortDate(next),
        canMove: canWriteProject(p, session),
      };
    }),
  );

  // Columnas del Pipeline = estados presentes; la lista COMPLETA (efectiva, con overrides)
  // alimenta los selectores de estado y el orden.
  const toCol = (key: string): StatusCol => { const m = statusMeta(key); return { key, label: m.label, className: m.className }; };
  const cols = statusesPresent.map(toCol);
  const allStatuses = PROJECT_STATUS_DEFAULTS.map((s) => toCol(s.key));

  // ── La franja: el pulso del estudio en una línea, y cada tramo filtra ──
  // Vive FUERA de todo menú porque en Portafolio —y en la Tabla agrupada por cliente, que es como
  // viene por defecto— estos números no aparecen en ningún otro sitio de la pantalla.
  //
  // Cada contador aplica todos los filtros MENOS el suyo. Es la regla que ya sigue Revisiones y
  // resuelve las dos formas de mentir: si contara lo ya visible, al poner un estado los demás
  // marcarían 0 y no habría cómo saltar de uno a otro; y si contara el total accesible, la franja
  // diría «2 en curso» justo encima de una columna «En curso 0» porque la búsqueda descartó las
  // dos. Contando todo menos lo propio, cada número es exactamente lo que verías al pulsarlo.
  const baseEstado = todos.filter((f) => pasaTexto(f) && pasaCliente(f) && pasaVencidos(f));
  const baseCliente = todos.filter((f) => pasaTexto(f) && pasaEstado(f) && pasaVencidos(f));
  const baseVencidos = todos.filter((f) => pasaTexto(f) && pasaCliente(f) && pasaEstado(f));
  const nPorEstado = (s: string) => baseEstado.filter((f) => f.p.status === s).length;
  const nPorCliente = (id: string) => baseCliente.filter((f) => f.c.id === id).length;
  const overdueCount = baseVencidos.filter((f) => isOverdue(f.p)).length;

  const tramos: TramoResumen[] = [
    ...statusesPresent.map((s) => {
      const m = statusMeta(s);
      return {
        key: s,
        label: m.label.toLowerCase(),
        valor: nPorEstado(s),
        // Su propio color, el configurable del estudio, no el de la paleta fija de la franja.
        clase: cn(m.className, "hover:opacity-80"),
        href: hrefEstado(s),
        activo: estadoSel.has(s),
      };
    }),
    // La alarma va aquí y no dentro de un menú: un aviso que hay que desplegar para verlo deja de
    // ser un aviso. En el archivo no se pinta —nada corre ya contra el reloj.
    ...(terminados ? [] : [{
      key: "vencidos",
      label: overdueCount === 1 ? "vencido" : "vencidos",
      valor: overdueCount,
      tono: "rose" as const,
      href: hrefCon({ vencidos: !soloVencidos }),
      activo: soloVencidos,
    }]),
  ];

  const nuevoProyecto = (
    <Link
      href="/proyectos/nuevo"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
    >
      <Plus className="size-3.5" />
      {/* En estrecho se queda en «+»: el texto partía en dos líneas y engordaba la fila entera. */}
      <span className="hidden sm:inline">Nuevo proyecto</span>
    </Link>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-6">
      <AtajosBarra />
      {/* La identidad de la pantalla sube a la barra superior, que YA decía «Proyectos»: el ícono
          y el H1 de aquí eran un duplicado literal. El recuento sustituye a la descripción fija. */}
      <PageHeader
        icon={<IconProyectos />}
        title="Proyectos"
        description={hasFilters ? `${total} de ${grandTotal} proyectos` : `${total} proyectos en ${clients.length} clientes`}
      />

      {!anyProjects ? (
        terminados ? (
          <EmptyState
            className="mt-8"
            icon={<IconProyectos />}
            title="No hay proyectos terminados"
            description="Cuando marques un proyecto como «Terminado», se guardará aquí (sin borrarse) y podrás reabrirlo cuando quieras."
            action={<Link href="/proyectos" className="text-sm font-medium text-primary hover:underline">Ver los activos</Link>}
          />
        ) : (
          <EmptyState
            className="mt-8"
            icon={<IconProyectos />}
            title="Aún no hay proyectos"
            description="Crea tu primer proyecto para organizar tareas, entregables, cronograma y archivos por cliente."
            action={
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link href="/proyectos/nuevo" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  <Plus className="size-4" /> Crear proyecto
                </Link>
                {/* Sin esto, un estudio con todo terminado se queda sin puerta al archivo: la
                    barra no se pinta cuando no hay nada que listar. */}
                {finishedCount > 0 ? (
                  <Link href="/proyectos?vista=terminados" className="text-sm font-medium text-primary hover:underline">
                    Ver los {finishedCount} terminados
                  </Link>
                ) : null}
              </div>
            }
          />
        )
      ) : (
        <>
          {/* UNA barra: el ámbito (Activos/Terminados) + buscador + Filtrar + cómo se ve + crear.
              Antes esto eran cinco franjas apiladas y el primer proyecto empezaba en el píxel 399. */}
          <BarraMandos pegajosa className="mt-1">
            <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border text-sm">
              {[
                { href: hrefActivos, label: "Activos", count: activeCount, on: !terminados },
                { href: hrefTerminados, label: "Terminados", count: finishedCount, on: terminados },
              ].map((t, i) => (
                <Link
                  key={t.label}
                  href={t.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5",
                    i > 0 && "border-l border-border",
                    t.on ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  {t.label} <span className="text-xs tabular-nums text-muted-foreground">{t.count}</span>
                </Link>
              ))}
            </div>

            {/* El orden no es estético: es lo que hace que en un teléfono la barra quepa en DOS
                filas y no en tres. A 390 px el ámbito (192 px) y los tres iconos de vista (98)
                caben juntos en la primera; el buscador es elástico y arrastra consigo a Filtrar y
                a «Nuevo» a la segunda. Con el buscador en medio, la primera fila se quedaba con el
                ámbito solo y sobraban 174 px de nada. Y de paso agrupa por sentido: a la izquierda
                QUÉ estás mirando, a la derecha con qué lo recortas. */}
            <SelectorVista
              grupo={grupo}
              hrefGrupoCliente={hrefCon({ grupo: "cliente" })}
              hrefGrupoEstado={hrefCon({ grupo: "estado" })}
            />

            <BuscadorUrl placeholder="Buscar proyecto o cliente" />

            <MenuBarra clave="filtrar" etiqueta="Filtrar" icono={<SlidersHorizontal />} activos={filtrosPuestos} alineado="derecha" ancho="w-64">
              {/* Las cuentas de aquí son las MISMAS que las de la franja (todo lo puesto menos el
                  filtro de esta lista), así que el menú y la franja nunca dicen dos cosas. */}
              <MenuGrupo>Estado</MenuGrupo>
              {statusesPresent.map((s) => {
                const m = statusMeta(s);
                return (
                  <MenuOpcion key={s} multiple activa={estadoSel.has(s)} pista={nPorEstado(s)} href={hrefEstado(s)}>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", m.className)}>{m.label}</span>
                  </MenuOpcion>
                );
              })}
              {clientOptions.length > 1 ? (
                <>
                  <MenuSeparador />
                  <MenuGrupo>Cliente</MenuGrupo>
                  {clientOptions.map((c) => (
                    <MenuOpcion key={c.value} multiple activa={clienteSel.has(c.value)} pista={nPorCliente(c.value)} href={hrefCliente(c.value)}>
                      {c.label}
                    </MenuOpcion>
                  ))}
                </>
              ) : null}
              {filtrosPuestos > 0 ? (
                <>
                  <MenuSeparador />
                  {/* Limpia TODO, «vencidos» y la búsqueda incluidos. El botón anterior se dejaba
                      esos dos puestos y luego la pantalla seguía filtrada sin decir por qué. */}
                  <MenuOpcion marca={false} href={hrefCon({ q: null, estado: null, cliente: null, vencidos: false })}>
                    Limpiar los filtros
                  </MenuOpcion>
                </>
              ) : null}
            </MenuBarra>

            {nuevoProyecto}
          </BarraMandos>

          {/* Lo que está puesto, a la vista y con ✕: es el precio de guardar los mandos en menús. */}
          {filtrosPuestos > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {qRaw ? <ChipFiltro etiqueta={`«${qRaw}»`} href={hrefCon({ q: null })}>«{qRaw}»</ChipFiltro> : null}
              {[...estadoSel].map((s) => (
                <ChipFiltro key={s} etiqueta={statusMeta(s).label} href={hrefEstado(s)}>{statusMeta(s).label}</ChipFiltro>
              ))}
              {[...clienteSel].map((id) => {
                const c = clientOptions.find((o) => o.value === id);
                return <ChipFiltro key={id} etiqueta={c?.label ?? "cliente"} href={hrefCliente(id)}>{c?.label ?? "Cliente"}</ChipFiltro>;
              })}
              {soloVencidos ? <ChipFiltro etiqueta="vencidos" href={hrefCon({ vencidos: false })}>Solo vencidos</ChipFiltro> : null}
            </div>
          ) : null}

          <FranjaResumen tramos={tramos} className="mt-3" />

          <div className="mt-3">
            {total === 0 ? (
              <EmptyState
                icon={<SearchX />}
                title="Sin resultados"
                description="Ningún proyecto coincide con los filtros. Ajústalos o límpialos para ver todos."
                action={
                  <Link href={hrefCon({ q: null, estado: null, cliente: null, vencidos: false })} className="text-sm font-medium text-primary hover:underline">
                    Limpiar los filtros
                  </Link>
                }
              />
            ) : (
              <CuerpoVista
                pipeline={<PipelineView cols={cols} allStatuses={allStatuses} projects={rows} />}
                tabla={<MasterTable projects={rows} allStatuses={allStatuses} grupo={grupo} />}
                portafolio={<PortfolioView projects={rows} allStatuses={allStatuses} />}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
