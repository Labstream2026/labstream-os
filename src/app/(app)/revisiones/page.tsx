import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Send, RefreshCw, MessageSquare, Film, Flame, Sparkles, Users, Calendar, Rocket, Eye, EyeOff, Layers, LayoutGrid, List, SlidersHorizontal, UserRound, Building2 } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleProjectWhere, canManageProject } from "@/lib/project-access";
import { UserAvatar } from "@/components/user-avatar";
import { deliverableStatusMeta } from "@/lib/ui";
import { TONE_MAP } from "@/lib/colors";
import { signReviewToken, signReviewMediaToken } from "@/lib/review-token";
import { signFileToken } from "@/lib/storage";
import { PreviewVideo } from "./preview-video";
import { DeliverableAdminActions } from "./deliverable-admin-actions";
import { CopiarEnlace } from "./copiar-enlace";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { IconRevisiones } from "@/components/icons";
import { EntityEmoji } from "@/components/icons/marks";
import { SelectionProvider, SelectCheck, type SelectableItem } from "./selection";
import { isEmailEnabled } from "@/lib/email";
import { isWhatsappEnabled } from "@/lib/whatsapp/send";
import { AtajosBarra, BarraMandos, ChipFiltro, FranjaResumen, MenuBarra, MenuGrupo, MenuOpcion, MenuSeparador, type TramoResumen } from "@/components/ui/barra-menu";
import { BuscadorUrl } from "@/components/ui/buscador-url";
import { VistasGuardadas } from "@/components/ui/menu-vistas-guardadas";
import { getUserPreference, parseSavedViews } from "@/lib/user-preference";

const REVIEW_BASE = process.env.NEXTAUTH_URL || "";

// Tiempo que un entregable lleva esperando esta acción y su nivel de urgencia.
// nowMs() a nivel de módulo evita el falso positivo de la regla de pureza con Date.now().
function nowMs(): number {
  return Date.now();
}
type Tier = "danger" | "warn" | "fresh";
function urgency(date: Date): { tier: Tier; days: number; hours: number } {
  const ms = nowMs() - new Date(date).getTime();
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  const tier: Tier = days >= 3 ? "danger" : hours >= 24 ? "warn" : "fresh";
  return { tier, days, hours };
}
// Etiqueta corta del chip de urgencia para lo que necesita acción del equipo.
function teamChip(u: { tier: Tier; days: number }): string {
  if (u.tier === "danger") return `${u.days} días`;
  if (u.tier === "warn") return `${u.days} día${u.days === 1 ? "" : "s"}`;
  return "nuevo";
}
// Etiqueta neutra "hace…" para lo que ya está con el cliente / entregado (no es urgencia nuestra).
function sinceLabel(u: { days: number; hours: number }): string {
  if (u.days >= 1) return `hace ${u.days} d`;
  if (u.hours >= 1) return `hace ${u.hours} h`;
  return "recién";
}
const CHIP: Record<Tier, string> = {
  danger: "bg-rose-500 text-white",
  warn: "bg-amber-400 text-amber-950",
  fresh: "bg-emerald-500 text-white",
};
// Duración en segundos → "m:ss" (o null si no se capturó).
function fmtDur(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}
// Estados "pasivos" (no es una acción pendiente NUESTRA): con el cliente o ya finalizados.
function isNeutralStatus(status: string): boolean {
  return status === "ENVIADO_CLIENTE" || status === "APROBADO" || status === "ENTREGADO";
}
// Color del cliente → hex para la barra/tinte/punto. `accentColor` guarda un TOKEN de la paleta
// (indigo, teal…): se resuelve al MISMO hex que usa el resto de la app (tone().hex). Se contempla un
// hex directo por compatibilidad; un token desconocido → null (sin color, para no caer en un color
// CSS nombrado inesperado).
function clientHex(accent: string | null | undefined): string | null {
  if (!accent) return null;
  if (accent.startsWith("#")) return accent;
  return TONE_MAP[accent]?.hex ?? null;
}

export const dynamic = "force-dynamic";

type GroupMode = "estado" | "cliente" | "fecha";
type TabKey = "por-aprobar" | "aprobados" | "publicados" | "archivados";
type Fase = "mias" | "otros" | "pre" | "viendo" | "cambios";
type Vista = "tarjetas" | "lista";

// Parámetros que forman parte de una "vista guardada" de esta bandeja.
const CLAVES_VISTA = ["tab", "group", "scope", "uploader", "cliente", "fase", "q", "v"] as const;

// Bandeja de GESTIÓN de entregables (equipo). "Activos": los que esperan una acción de revisión
// (pre-aprobación / con el cliente / cambios). "Archivados": los ya entregados o parqueados a mano
// — SALEN del inbox pero su enlace de entrega sigue vivo hasta que se borre. Cada ficha se pinta con
// el color de su cliente (barra + tinte) y se puede agrupar por Estado (por defecto), Cliente o Fecha.
//
// Los mandos viven en UNA barra: las cuatro bandejas (la espina de la pantalla) + buscador +
// «Filtrar» + «Vista» + «Vistas». Antes eran tres filas y una rejilla de cuatro métricas antes de
// la primera pieza; ahora las métricas son una franja de una línea que además FILTRA al pulsarla.
export default async function RevisionesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; tab?: string; group?: string; uploader?: string; cliente?: string; fase?: string; q?: string; v?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // La bandeja de revisión INTERNA es del equipo: el portal del cliente no entra (vería versiones
  // sin pre-aprobar y comentarios internos de su propio proyecto). Tiene su vista en /proyectos/[id].
  if (session.role === "cliente") redirect("/proyectos");

  const { scope, tab, group, uploader, cliente, fase, q, v } = await searchParams;
  const onlyMine = scope === "mine";
  const activeTab: TabKey = tab === "aprobados" ? "aprobados" : tab === "publicados" ? "publicados" : tab === "archivados" ? "archivados" : "por-aprobar";
  const groupMode: GroupMode = group === "cliente" ? "cliente" : group === "fecha" ? "fecha" : "estado";
  const uploaderId = uploader || null;
  const clienteId = cliente || null;
  const faseSel: Fase | null = fase === "mias" || fase === "otros" || fase === "pre" || fase === "viendo" || fase === "cambios" ? fase : null;
  const busca = (q ?? "").trim().toLowerCase();
  const vista: Vista = v === "lista" ? "lista" : "tarjetas";
  // ¿Puede el usuario marcar entregables como publicados? Es a nivel de sesión (mismo permiso que la
  // pre-aprobación interna); el gate por proyecto se combina con canManage más abajo, por ítem.
  const sessionCanApprove = hasPermission(session, "aprobar_entregables");

  // Los proyectos TERMINADOS no aparecen en Revisiones (están en su archivo, no en el flujo activo).
  const acc = { ...accessibleProjectWhere(session), finishedAt: null };
  // Cuatro bandejas DISJUNTAS. La clave: "aprobado por el cliente" (APROBADO/ENTREGADO) y "publicado"
  // son cosas distintas → van en pestañas distintas. Un publicado siempre está aprobado, así que
  // publishedAt no-nulo lo saca de «Aprobados». Archivar (parquear) gana sobre todo: si algo se
  // archiva, va a «Archivados» aunque estuviera aprobado o publicado.
  //  · Por aprobar: en revisión, sin archivar, sin publicar.
  //  · Aprobados:   aprobado/entregado por el cliente, sin publicar y sin archivar.
  //  · Publicados:  con sello de publicación (publishedAt), sin archivar.
  //  · Archivados:  parqueados a mano; su enlace de entrega sigue vivo hasta borrarlo.
  const porAprobarWhere: Prisma.DeliverableWhereInput = { project: acc, archivedAt: null, publishedAt: null, status: { in: ["REVISION_INTERNA", "ENVIADO_CLIENTE", "CORRECCIONES"] } };
  const aprobadosWhere: Prisma.DeliverableWhereInput = { project: acc, archivedAt: null, publishedAt: null, status: { in: ["APROBADO", "ENTREGADO"] } };
  const publicadosWhere: Prisma.DeliverableWhereInput = { project: acc, archivedAt: null, publishedAt: { not: null } };
  const archivadosWhere: Prisma.DeliverableWhereInput = { project: acc, archivedAt: { not: null } };
  const whereByTab: Record<TabKey, Prisma.DeliverableWhereInput> = { "por-aprobar": porAprobarWhere, aprobados: aprobadosWhere, publicados: publicadosWhere, archivados: archivadosWhere };

  const [rows, porAprobarCount, aprobadosCount, publicadosCount, archivadosCount] = await Promise.all([
    db.deliverable.findMany({
      where: whereByTab[activeTab],
      select: {
        id: true,
        name: true,
        number: true,
        status: true,
        type: true,
        updatedAt: true,
        reviewerId: true,
        reviewers: { select: { userId: true } },
        ownerId: true,
        coverFileAssetId: true,
        // reviewRevokedAt/reviewExpiresAt → saber si el enlace de entrega sigue activo. archivedAt → tab.
        reviewRevokedAt: true,
        reviewExpiresAt: true,
        archivedAt: true,
        // Visitas del cliente al enlace: 0 = pre-aprobado pero aún sin abrir; >0 = ya lo está viendo.
        reviewVisits: true,
        // Sello de publicación (interno): fecha + quién lo marcó, para la pestaña «Publicados».
        publishedAt: true,
        publishedBy: { select: { name: true } },
        // El proyecto trae lo necesario para pintar (cliente + color) Y para resolver canManage
        // (isPrivate/leadId/members y, para la rama de editor, los miembros del cliente).
        project: {
          select: {
            id: true,
            name: true,
            emoji: true,
            isPrivate: true,
            leadId: true,
            members: { select: { userId: true, role: true } },
            client: { select: { id: true, name: true, photoUrl: true, accentColor: true, members: { select: { userId: true, role: true } } } },
          },
        },
        // id/fileUrl/fileAsset → para firmar la fuente del PREVIEW en hover (la misma que
        // reproduce el player: files-asset si vive en el NAS, review-media si vive en Drive).
        versions: { orderBy: { number: "desc" }, take: 1, select: { id: true, number: true, createdAt: true, durationSec: true, fileUrl: true, fileAsset: { select: { id: true, name: true } }, uploadedBy: { select: { id: true, name: true, initials: true, avatarColor: true } } } },
        _count: { select: { reviewComments: true } },
      },
      orderBy: activeTab === "publicados" ? { publishedAt: "desc" } : { updatedAt: "desc" },
    }),
    db.deliverable.count({ where: porAprobarWhere }),
    db.deliverable.count({ where: aprobadosWhere }),
    db.deliverable.count({ where: publicadosWhere }),
    db.deliverable.count({ where: archivadosWhere }),
  ]);

  // Responsable de la pre-aprobación: CUALQUIER revisor asignado (co-revisores). Si no hay revisores,
  // cae al lead del proyecto (y en último caso, al dueño del entregable). A todos esos les sale "pendiente".
  const isMyResponsibility = (d: (typeof rows)[number]) =>
    d.reviewers.length
      ? d.reviewers.some((r) => r.userId === session.id)
      : (d.project.leadId ?? d.ownerId) === session.id;

  const now = nowMs();

  // La fuente del PREVIEW en hover, firmada AQUÍ (el navegador nunca fabrica estas URLs: sin
  // firma, los dos endpoints devuelven 401). Misma lógica que buildStageVersions, reducida a la
  // única pregunta que importa en una tarjeta: ¿hay un video que enseñar?
  //  · Subido al NAS → files-asset, solo si el nombre ES de video (una imagen no se "previsualiza").
  //  · Drive (archivo o carpeta) → review-media, que ya resuelve y sirve por rangos. Si la
  //    carpeta no tiene video, el <video> falla y la tarjeta se queda con su portada: sin drama.
  const VIDEO_RE = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
  const previewSrcDe = (v: (typeof rows)[number]["versions"][number] | undefined): string | null => {
    if (!v) return null;
    if (v.fileAsset) return VIDEO_RE.test(v.fileAsset.name) ? `/api/files-asset/${v.fileAsset.id}?t=${signFileToken(v.fileAsset.id, 12 * 3600)}` : null;
    if (v.fileUrl) return `/api/review-media/${v.id}?t=${signReviewMediaToken(v.id)}`;
    return null;
  };

  // Vista-modelo enriquecida: se resuelve una sola vez si el usuario puede gestionar el entregable
  // (canManage → acciones del menú ⋯), el enlace de entrega y su estado (vivo/archivado).
  const items: Item[] = rows.map((d) => ({
    id: d.id,
    name: d.name,
    number: d.number,
    status: d.status,
    type: d.type,
    updatedAt: d.updatedAt,
    coverFileAssetId: d.coverFileAssetId,
    project: { id: d.project.id, name: d.project.name, emoji: d.project.emoji, client: d.project.client ? { id: d.project.client.id, name: d.project.client.name, photoUrl: d.project.client.photoUrl, accentColor: d.project.client.accentColor } : null },
    versions: d.versions,
    previewSrc: previewSrcDe(d.versions[0]),
    _count: d._count,
    mine: isMyResponsibility(d),
    manage: canManageProject(d.project, session),
    // Publicar exige gestionar el proyecto Y el permiso de aprobar (mismo gate que setDeliverablePublished).
    canPublish: canManageProject(d.project, session) && sessionCanApprove,
    publishedAt: d.publishedAt,
    publishedByName: d.publishedBy?.name ?? null,
    reviewVisits: d.reviewVisits,
    reviewUrl: `${REVIEW_BASE}/review/${signReviewToken(d.id)}`,
    linkActive: !d.reviewRevokedAt && (!d.reviewExpiresAt || d.reviewExpiresAt.getTime() > now),
    archived: d.archivedAt != null,
  }));

  const mineFilter = (d: Item) => !onlyMine || d.mine;
  const scoped = items.filter(mineFilter);

  // En qué fase está una pieza. Es lo que la franja de resumen filtra: distingue lo que espera algo
  // de TI de lo que espera al cliente, que es la pregunta real del lunes por la mañana.
  const faseDe = (d: Item): Fase | null => {
    if (d.status === "REVISION_INTERNA") return d.mine ? "mias" : "otros";
    if (d.status === "ENVIADO_CLIENTE") return d.reviewVisits > 0 ? "viendo" : "pre";
    if (d.status === "CORRECCIONES") return "cambios";
    return null;
  };

  // Texto sobre el que busca el buscador: nombre de la pieza, del proyecto y del cliente. Los tres
  // son formas legítimas de acordarse de algo («el spot de Skincenter»).
  const heno = (d: Item) =>
    `${d.number ? `#${d.number} ` : ""}${d.name} ${d.project.name} ${d.project.client?.name ?? ""}`.toLowerCase();

  // Opciones de los filtros: se calculan ANTES de aplicarlos (sobre `scoped`), para poder cambiar
  // de persona o de cliente sin quedarse encerrado en una combinación sin resultados.
  const uploaderMap = new Map<string, { id: string; name: string; initials: string | null; avatarColor: string | null }>();
  for (const d of scoped) {
    const u = d.versions[0]?.uploadedBy;
    if (u) uploaderMap.set(u.id, u);
  }
  const uploaders = [...uploaderMap.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const clienteMap = new Map<string, { id: string; name: string; accentColor: string | null }>();
  for (const d of scoped) if (d.project.client) clienteMap.set(d.project.client.id, d.project.client);
  const clientes = [...clienteMap.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));

  // Todo menos la fase: es la base que cuenta la franja. Si contara sobre lo ya filtrado por fase,
  // los demás tramos marcarían 0 y no habría forma de saltar de una fase a otra.
  const baseFranja = scoped.filter((d) => {
    if (uploaderId && d.versions[0]?.uploadedBy?.id !== uploaderId) return false;
    if (clienteId && d.project.client?.id !== clienteId) return false;
    if (busca && !heno(d).includes(busca)) return false;
    return true;
  });
  const visible = faseSel ? baseFranja.filter((d) => faseDe(d) === faseSel) : baseFranja;

  // Enlaces de la barra, conservando el resto de parámetros. `null` explícito = quitar el filtro.
  const hrefFor = (over: {
    tab?: TabKey;
    group?: GroupMode;
    scope?: "mine" | "all";
    uploader?: string | null;
    cliente?: string | null;
    fase?: Fase | null;
    v?: Vista;
  }) => {
    const t = over.tab ?? activeTab;
    const g = over.group ?? groupMode;
    const s = over.scope ?? (onlyMine ? "mine" : "all");
    const u = over.uploader === undefined ? uploaderId : over.uploader;
    const c = over.cliente === undefined ? clienteId : over.cliente;
    const f = over.fase === undefined ? faseSel : over.fase;
    const vv = over.v ?? vista;
    const p = new URLSearchParams();
    if (t !== "por-aprobar") p.set("tab", t); // «Por aprobar» es la pestaña por defecto (sin parámetro)
    if (g !== "estado") p.set("group", g);
    if (s === "mine") p.set("scope", "mine");
    if (u) p.set("uploader", u);
    if (c) p.set("cliente", c);
    // La fase solo existe en «Por aprobar»: al cambiar de bandeja se cae sola, en vez de dejar un
    // filtro invisible que vacía una pestaña donde ni se puede ver a qué se refiere.
    if (f && t === "por-aprobar") p.set("fase", f);
    if (busca) p.set("q", busca);
    if (vv !== "tarjetas") p.set("v", vv);
    const qs = p.toString();
    return qs ? `/revisiones?${qs}` : "/revisiones";
  };

  const total = visible.length;
  // Lo que se puede marcar con la casilla: solo lo que esta persona GESTIONA. La barra lee de
  // aquí para saber cuántas se pueden publicar o cuántas llevan enlace vivo.
  const seleccionables: SelectableItem[] = visible
    .filter((d) => d.manage)
    .map((d) => ({
      id: d.id,
      name: d.name,
      archived: d.archived,
      published: d.publishedAt != null,
      publishable: d.status === "APROBADO" || d.status === "ENTREGADO",
      linkActive: d.linkActive,
      canPublish: d.canPublish,
    }));
  const [emailOk, waOk] = [await isEmailEnabled(), isWhatsappEnabled()];
  const vistasGuardadas = parseSavedViews((await getUserPreference(session.id)).savedViews, "revisiones");

  // Vista "Por aprobar + agrupar por Estado" = la de siempre (grupos con su lógica y su franja).
  const porFase = (f: Fase) => visible.filter((d) => faseDe(d) === f);
  const pendientes = porFase("mias").sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()); // los que más esperan, primero
  // REVISION_INTERNA que NO es responsabilidad de quien mira (típico de admin/gerente, que ve todos
  // los proyectos, o de un miembro cuyo compañero es el revisor asignado): antes no caía en ningún
  // grupo de la vista por Estado, así que el tablero pintaba MENOS tarjetas que el número de la
  // pestaña y del encabezado. Se listan como grupo neutro (no es una acción MÍA) para que cuadre.
  const pendientesOtros = porFase("otros").sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  const preAprobados = porFase("pre");
  const conCliente = porFase("viendo");
  const cambios = porFase("cambios");

  const cuentaFase = (f: Fase) => baseFranja.filter((d) => faseDe(d) === f).length;
  const FASE_META: { key: Fase; label: string; tono: TramoResumen["tono"] }[] = [
    { key: "mias", label: "pendientes de ti", tono: "amber" },
    { key: "otros", label: "las revisa otro", tono: "neutro" },
    { key: "pre", label: "esperando al cliente", tono: "sky" },
    { key: "viendo", label: "el cliente lo está viendo", tono: "teal" },
    { key: "cambios", label: "con cambios", tono: "rose" },
  ];
  const tramos: TramoResumen[] = FASE_META.map((f) => ({
    key: f.key,
    label: f.label,
    tono: f.tono,
    valor: cuentaFase(f.key),
    activo: faseSel === f.key,
    // Pulsar el tramo activo lo suelta: el mismo gesto pone y quita, sin buscar un ✕ aparte.
    href: hrefFor({ fase: faseSel === f.key ? null : f.key }),
  }));

  const FASE_LABEL: Record<Fase, string> = {
    mias: "Pendientes de ti",
    otros: "Las revisa otro",
    pre: "Esperando al cliente",
    viendo: "El cliente lo está viendo",
    cambios: "Con cambios",
  };

  // Cuántos filtros hay puestos: es el número que tiñe el botón «Filtrar», para que esconder los
  // mandos no esconda nunca que hay un filtro activo.
  const filtrosPuestos = (onlyMine ? 1 : 0) + (uploaderId ? 1 : 0) + (clienteId ? 1 : 0);
  const uploaderSel = uploaderId ? uploaders.find((u) => u.id === uploaderId) : null;
  const clienteSel = clienteId ? clientes.find((c) => c.id === clienteId) : null;
  const algoFiltrado = filtrosPuestos > 0 || !!faseSel || !!busca;

  const TAB_META: Record<TabKey, { title: string; desc: string }> = {
    "por-aprobar": {
      title: "Revisiones",
      desc: total > 0 ? `${total} entregable${total === 1 ? "" : "s"} esperan una acción. Abre uno para ver el video, comentar y decidir.` : "Todo al día.",
    },
    aprobados: { title: "Aprobados por el cliente", desc: "Ya aprobados y aún sin publicar. Cuando salgan al aire, márcalos como publicados." },
    publicados: { title: "Publicados", desc: "Piezas que ya salieron al aire, con la fecha en que se publicaron." },
    archivados: { title: "Entregables archivados", desc: "Parqueados a mano. Su enlace de entrega sigue funcionando hasta que lo borres." },
  };
  const tabMeta = TAB_META[activeTab];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <AtajosBarra />
      <header className="mb-5">
        <PageHeader icon={<IconRevisiones />} title={tabMeta.title} description={tabMeta.desc} />

        {/* UNA barra: las cuatro bandejas (la espina) + buscador + los menús. «Solo míos», «Subido
            por» y «Cliente» viven en Filtrar; «Agrupar por» y la densidad, en Vista. */}
        <BarraMandos pegajosa className="mt-4">
          <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-border text-sm">
            {([
              { key: "por-aprobar", label: "Por aprobar", count: porAprobarCount },
              { key: "aprobados", label: "Aprobados", count: aprobadosCount },
              { key: "publicados", label: "Publicados", count: publicadosCount },
              { key: "archivados", label: "Archivados", count: archivadosCount },
            ] as const).map((t, i) => (
              <Link
                key={t.key}
                href={hrefFor({ tab: t.key })}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 ${i > 0 ? "border-l border-border" : ""} ${activeTab === t.key ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}
              >
                {t.label}
                {/* El «0» no cuenta nada que no cuente ya la bandeja vacía, y son 27 px de una
                    barra que quiere caber en una línea. */}
                {t.count > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{t.count}</span> : null}
              </Link>
            ))}
          </div>

          {/* basis-32 y no el basis-40 de la casa: en una fila con `flex-wrap` lo que decide si
              algo baja de línea es el ancho DE PARTIDA, no el que acaba teniendo. Con 160 px de
              partida la barra se rompía en dos a 1280 px de pantalla —justo lo que venía a
              arreglar— y el buscador igual crece luego hasta llenar el hueco que sobre. */}
          <BuscadorUrl placeholder="Buscar pieza, proyecto o cliente" className="basis-32" />

          <MenuBarra clave="filtrar" etiqueta="Filtrar" icono={<SlidersHorizontal />} activos={filtrosPuestos} alineado="derecha">
            <MenuGrupo>Alcance</MenuGrupo>
            <MenuOpcion activa={onlyMine} href={hrefFor({ scope: "mine" })}>Solo míos</MenuOpcion>
            <MenuOpcion activa={!onlyMine} href={hrefFor({ scope: "all" })}>Todo el equipo</MenuOpcion>
            {uploaders.length > 1 ? (
              <>
                <MenuSeparador />
                <MenuGrupo>Subió la última versión</MenuGrupo>
                <MenuOpcion activa={!uploaderId} icono={<UserRound />} href={hrefFor({ uploader: null })}>Cualquiera</MenuOpcion>
                {uploaders.map((u) => (
                  <MenuOpcion key={u.id} activa={uploaderId === u.id} href={hrefFor({ uploader: u.id })}>
                    <span className="inline-flex items-center gap-1.5">
                      <UserAvatar initials={u.initials} color={u.avatarColor} size="sm" className="h-4 w-4" />
                      {u.name}
                    </span>
                  </MenuOpcion>
                ))}
              </>
            ) : null}
            {clientes.length > 1 ? (
              <>
                <MenuSeparador />
                <MenuGrupo>Cliente</MenuGrupo>
                <MenuOpcion activa={!clienteId} icono={<Building2 />} href={hrefFor({ cliente: null })}>Todos los clientes</MenuOpcion>
                {clientes.map((c) => (
                  <MenuOpcion key={c.id} activa={clienteId === c.id} href={hrefFor({ cliente: c.id })}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: clientHex(c.accentColor) ?? "hsl(var(--muted-foreground))" }} />
                      {c.name}
                    </span>
                  </MenuOpcion>
                ))}
              </>
            ) : null}
            {filtrosPuestos > 0 ? (
              <>
                <MenuSeparador />
                <MenuOpcion marca={false} href={hrefFor({ scope: "all", uploader: null, cliente: null })}>
                  Limpiar los filtros
                </MenuOpcion>
              </>
            ) : null}
          </MenuBarra>

          <MenuBarra clave="vista" etiqueta="Vista" icono={vista === "lista" ? <List /> : <LayoutGrid />} alineado="derecha">
            <MenuGrupo>Agrupar por</MenuGrupo>
            <MenuOpcion activa={groupMode === "estado"} icono={<Layers />} href={hrefFor({ group: "estado" })}>Estado</MenuOpcion>
            <MenuOpcion activa={groupMode === "cliente"} icono={<Users />} href={hrefFor({ group: "cliente" })}>Cliente</MenuOpcion>
            <MenuOpcion activa={groupMode === "fecha"} icono={<Calendar />} href={hrefFor({ group: "fecha" })}>Fecha</MenuOpcion>
            <MenuSeparador />
            <MenuGrupo>Cómo se ve</MenuGrupo>
            <MenuOpcion activa={vista === "tarjetas"} icono={<LayoutGrid />} href={hrefFor({ v: "tarjetas" })}>Tarjetas con miniatura</MenuOpcion>
            <MenuOpcion activa={vista === "lista"} icono={<List />} href={hrefFor({ v: "lista" })}>Lista compacta</MenuOpcion>
            {faseSel ? (
              <>
                <MenuSeparador />
                <MenuOpcion marca={false} icono={<EyeOff />} href={hrefFor({ fase: null })}>Quitar el filtro de fase</MenuOpcion>
              </>
            ) : null}
            {/* Las vistas guardadas, dentro. «Vista» y «Vistas» eran dos botones pegados que se
                leen como lo mismo, y el segundo era el que rompía la barra en dos filas. */}
            <MenuSeparador />
            <VistasGuardadas superficie="revisiones" claves={CLAVES_VISTA} iniciales={vistasGuardadas} />
          </MenuBarra>
        </BarraMandos>

        {/* Lo que está puesto, a la vista y con ✕: el precio de esconder los mandos se paga aquí. */}
        {filtrosPuestos > 0 || faseSel ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {onlyMine ? <ChipFiltro href={hrefFor({ scope: "all" })}>Solo míos</ChipFiltro> : null}
            {uploaderSel ? <ChipFiltro href={hrefFor({ uploader: null })}>Subió {uploaderSel.name.split(" ")[0]}</ChipFiltro> : null}
            {clienteSel ? <ChipFiltro href={hrefFor({ cliente: null })}>{clienteSel.name}</ChipFiltro> : null}
            {faseSel ? <ChipFiltro href={hrefFor({ fase: null })}>{FASE_LABEL[faseSel]}</ChipFiltro> : null}
          </div>
        ) : null}

        {/* La franja sustituye a los cuatro cuadros: una línea en vez de ~110 px, y cada tramo filtra. */}
        {activeTab === "por-aprobar" ? <FranjaResumen tramos={tramos} className="mt-3" /> : null}
      </header>

      {/* Selección múltiple: la casilla y la barra de abajo (enviar al cliente, archivar, marcar
          publicado) solo existen sobre lo que esta persona puede gestionar. */}
      <SelectionProvider items={seleccionables} emailEnabled={emailOk} whatsappEnabled={waOk}>
      {visible.length === 0 ? (
        <EmptyState
          icon={<IconRevisiones />}
          title={
            algoFiltrado ? "Nada coincide con lo que buscas"
              : activeTab === "archivados" ? "No hay entregables archivados"
                : activeTab === "aprobados" ? "Nada aprobado todavía"
                  : activeTab === "publicados" ? "Nada publicado todavía"
                    : "No hay nada por revisar"
          }
          description={
            algoFiltrado ? "Prueba a quitar un filtro desde la barra de arriba."
              : activeTab === "archivados" ? "Los que archives aparecerán aquí, con su enlace vivo."
                : activeTab === "aprobados" ? "Cuando el cliente apruebe una pieza, aparecerá aquí lista para publicar."
                  : activeTab === "publicados" ? "Marca un aprobado como publicado y aparecerá aquí."
                    : "Cuando el equipo suba una versión nueva, aparecerá aquí."
          }
        />
      ) : activeTab === "por-aprobar" && groupMode === "estado" ? (
        <div className="space-y-8">
          <Group title="Pendientes de tu pre-aprobación" Icon={Clock} accent="amber" hint="Los más urgentes primero" items={pendientes} vista={vista} />
          <Group title="En pre-aprobación de otros" Icon={Clock} accent="sky" hint="Las revisa otro compañero" items={pendientesOtros} vista={vista} neutral />
          <Group title="Pre-aprobados · esperando al cliente" Icon={Send} accent="sky" hint="El cliente aún no lo ha abierto" items={preAprobados} vista={vista} neutral />
          <Group title="Con el cliente · ya lo está viendo" Icon={Eye} accent="teal" hint="El cliente ya lo abrió" items={conCliente} vista={vista} neutral />
          <Group title="Cambios solicitados" Icon={RefreshCw} accent="rose" items={cambios} vista={vista} />
        </div>
      ) : (
        <GenericGroups items={visible} mode={groupMode} vista={vista} />
      )}
      </SelectionProvider>
    </div>
  );
}

type Item = {
  id: string;
  name: string;
  number: number | null;
  status: string;
  type: string | null;
  updatedAt: Date;
  coverFileAssetId: string | null;
  project: { id: string; name: string; emoji: string | null; client: { id: string; name: string; photoUrl: string | null; accentColor: string | null } | null };
  versions: { number: number; createdAt: Date; durationSec: number | null; uploadedBy: { id: string; name: string; initials: string | null; avatarColor: string | null } | null }[];
  // Fuente firmada del preview en hover; null = esta pieza no tiene video que enseñar.
  previewSrc: string | null;
  _count: { reviewComments: number };
  mine: boolean;
  manage: boolean;
  canPublish: boolean;
  publishedAt: Date | null;
  publishedByName: string | null;
  reviewVisits: number;
  reviewUrl: string;
  linkActive: boolean;
  archived: boolean;
};

// Piezas que YA están en manos del cliente (esperándolo o abiertas por él): son las únicas
// donde el enlace es lo que uno viene a buscar, así que son las únicas que enseñan «Copiar
// enlace» al frente. En lo que aún se revisa, el enlace todavía no significa nada.
const conElCliente = (d: Item) => d.status === "ENVIADO_CLIENTE";

const ACCENT: Record<string, string> = {
  amber: "text-amber-600 dark:text-amber-400",
  sky: "text-sky-600 dark:text-sky-400",
  teal: "text-teal-600 dark:text-teal-400",
  rose: "text-rose-600 dark:text-rose-400",
};
const BADGE: Record<string, string> = {
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

// Rejilla de tarjetas o lista compacta, según la vista elegida. La lista es para cuando hay
// cuarenta piezas y lo que quieres es CONTAR lo que hay, no mirarlo una a una.
function Piezas({ items, vista, neutral, showStatus }: { items: Item[]; vista: Vista; neutral?: boolean; showStatus?: boolean }) {
  if (vista === "lista") {
    return (
      // Las esquinas se redondean en la primera y la última fila en vez de con overflow-hidden en
      // el contenedor: el recorte cortaría el panel del menú ⋯ de cada fila (mismo caso que en la
      // tarjeta). La barra de color del cliente se recorta en su propia fila.
      <div className="rounded-xl border border-border [&>*:first-child]:rounded-t-xl [&>*:last-child]:rounded-b-xl">
        {items.map((d, i) => (
          <Fila key={d.id} d={d} primera={i === 0} neutral={neutral} showStatus={showStatus} />
        ))}
      </div>
    );
  }
  // Tarjetas compactas en subgrupos por PROYECTO: la cabecera —punto del color del cliente +
  // nombre + cuántas— carga con lo que antes repetía cada tarjeta, y separa las tandas: seis
  // miniaturas con la misma cara se leen como UNA entrega, no como seis piezas perdidas.
  return (
    <div className="space-y-4">
      {porProyecto(items).map((g) => (
        <div key={g.id}>
          <div className="mb-1.5 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            {g.color ? <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: g.color }} /> : null}
            <span className="opacity-80"><EntityEmoji value={g.emoji} fallback="🎬" /></span>
            <span className="truncate uppercase tracking-wide">{g.nombre}</span>
            {g.cliente && g.cliente !== g.nombre ? <span className="truncate font-normal">· {g.cliente}</span> : null}
            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums">{g.items.length}</span>
          </div>
          {/* auto-fill con mínimo de 11.5rem: la rejilla decide cuántas caben (5–6 en un
              monitor normal) en vez de clavar 4 columnas gigantes. */}
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(11.5rem,1fr))]">
            {g.items.map((d) => (
              <Card key={d.id} d={d} neutral={neutral} showStatus={showStatus} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Agrupa por proyecto CONSERVANDO el orden de llegada (las piezas ya vienen ordenadas por
// urgencia/fecha): el primer proyecto que aparece es el que tiene la pieza más urgente.
function porProyecto(items: Item[]): { id: string; nombre: string; emoji: string | null; cliente: string | null; color: string | null; items: Item[] }[] {
  const map = new Map<string, Item[]>();
  for (const d of items) {
    if (!map.has(d.project.id)) map.set(d.project.id, []);
    map.get(d.project.id)!.push(d);
  }
  return [...map.values()].map((its) => ({
    id: its[0].project.id,
    nombre: its[0].project.name,
    emoji: its[0].project.emoji,
    cliente: its[0].project.client?.name ?? null,
    color: clientHex(its[0].project.client?.accentColor),
    items: its,
  }));
}

function Group({ title, Icon, accent, hint, items, vista, neutral }: { title: string; Icon: React.ComponentType<{ className?: string }>; accent: string; hint?: string; items: Item[]; vista: Vista; neutral?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className={`mb-3 flex items-center gap-2 text-sm font-semibold ${ACCENT[accent]}`}>
        <Icon className="size-4" /> {title}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[accent]}`}>{items.length}</span>
        {hint ? <span className="ml-auto text-[11px] font-normal text-muted-foreground">{hint}</span> : null}
      </h2>
      <Piezas items={items} vista={vista} neutral={neutral} />
    </section>
  );
}

// Agrupación genérica (Cliente / Fecha / Estado en la pestaña de archivados): cabecera con punto de
// color (cliente) + piezas. Cada pieza muestra su estado (chip) porque la cabecera ya no lo indica.
function GenericGroups({ items, mode, vista }: { items: Item[]; mode: GroupMode; vista: Vista }) {
  const groups = mode === "cliente" ? groupByClient(items) : mode === "fecha" ? groupByDate(items) : groupByStatus(items);
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.key}>
          <div className="mb-3 flex items-center gap-2">
            {g.color ? <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: g.color }} /> : null}
            <h2 className="text-sm font-semibold">{g.label}</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{g.items.length}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <Piezas items={g.items} vista={vista} neutral={g.items.every((d) => isNeutralStatus(d.status))} showStatus />
        </section>
      ))}
    </div>
  );
}

type Bucket = { key: string; label: string; color: string | null; items: Item[] };

function groupByClient(items: Item[]): Bucket[] {
  const map = new Map<string, Item[]>();
  for (const d of items) {
    const k = d.project.client?.id ?? "__none__";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(d);
  }
  return [...map.entries()]
    .map(([key, its]) => ({ key, label: its[0].project.client?.name ?? "Sin cliente", color: clientHex(its[0].project.client?.accentColor), items: its }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function groupByStatus(items: Item[]): Bucket[] {
  const order = ["REVISION_INTERNA", "CORRECCIONES", "ENVIADO_CLIENTE", "APROBADO", "ENTREGADO"];
  const map = new Map<string, Item[]>();
  for (const d of items) {
    if (!map.has(d.status)) map.set(d.status, []);
    map.get(d.status)!.push(d);
  }
  return [...map.keys()]
    .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map((k) => ({ key: k, label: deliverableStatusMeta(k).label, color: null, items: map.get(k)! }));
}

function groupByDate(items: Item[]): Bucket[] {
  const now = nowMs();
  const defs: { key: string; label: string; maxH: number }[] = [
    { key: "hoy", label: "Hoy", maxH: 24 },
    { key: "semana", label: "Esta semana", maxH: 24 * 7 },
    { key: "mes", label: "Este mes", maxH: 24 * 31 },
    { key: "old", label: "Anteriores", maxH: Infinity },
  ];
  const groups: Bucket[] = defs.map((d) => ({ key: d.key, label: d.label, color: null, items: [] }));
  for (const d of items) {
    const h = (now - d.updatedAt.getTime()) / 3_600_000;
    const idx = defs.findIndex((b) => h < b.maxH);
    groups[idx === -1 ? groups.length - 1 : idx].items.push(d);
  }
  return groups.filter((g) => g.items.length > 0);
}

// Chip de estado de una pieza (o el sello «Publicado», que manda sobre el estado: en la pestaña de
// Publicados es lo que importa).
function EstadoChip({ d }: { d: Item }) {
  if (d.publishedAt) {
    return (
      <span
        className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
        title={`Publicado ${sinceLabel(urgency(d.publishedAt))}${d.publishedByName ? ` por ${d.publishedByName}` : ""}`}
      >
        <Rocket className="size-3" /> Publicado{d.publishedByName ? ` · ${d.publishedByName.split(" ")[0]}` : ""}
      </span>
    );
  }
  // Afinamos "Enviado a cliente" según si el cliente ya abrió el enlace: pre-aprobado (sin abrir)
  // vs con el cliente (ya lo vio). Mismo criterio que los grupos de «Por aprobar».
  if (d.status === "ENVIADO_CLIENTE") {
    return (
      <span className={`inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${d.reviewVisits > 0 ? "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"}`}>
        {d.reviewVisits > 0 ? "Con el cliente" : "Pre-aprobado"}
      </span>
    );
  }
  const st = deliverableStatusMeta(d.status);
  return <span className={`inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${st.className}`}>{st.label}</span>;
}

// Fila de la lista compacta: una línea por pieza, sin miniatura.
function Fila({ d, primera, neutral, showStatus }: { d: Item; primera: boolean; neutral?: boolean; showStatus?: boolean }) {
  const v = d.versions[0];
  const u = urgency(d.updatedAt);
  const color = clientHex(d.project.client?.accentColor);
  const UrgencyIcon = u.tier === "danger" ? Flame : u.tier === "warn" ? Clock : Sparkles;
  return (
    <div className={`relative flex items-center gap-2.5 bg-card px-3 py-2 transition-colors hover:bg-accent/40 ${primera ? "" : "border-t border-border"}`}>
      {color ? <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} /> : null}
      <Link href={`/revisiones/${d.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 pl-1.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {d.number ? <span className="mr-1 text-muted-foreground">#{d.number}</span> : null}{d.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            <EntityEmoji value={d.project.emoji} fallback="🎬" /> {d.project.name}{d.project.client ? ` · ${d.project.client.name}` : ""}
          </span>
        </span>
        {showStatus || d.publishedAt ? <EstadoChip d={d} /> : null}
        {v ? <span className="hidden shrink-0 text-[11px] tabular-nums text-muted-foreground sm:inline">v{v.number}</span> : null}
        {d._count.reviewComments > 0 ? (
          <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
            <MessageSquare className="size-3" /> {d._count.reviewComments}
          </span>
        ) : null}
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${neutral ? "bg-muted text-muted-foreground" : CHIP[u.tier]}`}>
          {neutral ? sinceLabel(u) : <><UrgencyIcon className="mr-0.5 inline size-3 align-[-2px]" />{teamChip(u)}</>}
        </span>
      </Link>
      {/* Mismo botón que en la tarjeta. En pantallas estrechas se cae: la fila ya va apretada y
          el ⋯ de al lado lo sigue teniendo. */}
      {conElCliente(d) ? <CopiarEnlace url={d.reviewUrl} activo={d.linkActive} className="hidden shrink-0 lg:inline-flex" /> : null}
      {d.manage ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <SelectCheck id={d.id} />
          <DeliverableAdminActions
            deliverableId={d.id}
            projectId={d.project.id}
            reviewUrl={d.reviewUrl}
            linkActive={d.linkActive}
            archived={d.archived}
            name={d.name}
            canPublish={d.canPublish}
            published={d.publishedAt != null}
            publishable={d.status === "APROBADO" || d.status === "ENTREGADO"}
          />
        </span>
      ) : null}
    </div>
  );
}

// Tarjeta COMPACTA. La versión anterior pintaba ocho cosas con el mismo peso (chip de fecha,
// urgencia, ⋯, versión, comentarios, proyecto, avatar y un botón «Ver →» que no hacía nada que
// no hiciera ya la tarjeta entera): con dieciséis a la vista eran ~130 elementos compitiendo.
// Ahora: miniatura con preview en vivo + título + UNA línea de meta. El proyecto lo dice la
// cabecera del grupo; el ⋯ aparece al posar el ratón; la edad solo toma color cuando es un
// problema. Caben ~15 por pantalla en vez de 8.
function Card({ d, neutral, showStatus }: { d: Item; neutral?: boolean; showStatus?: boolean }) {
  const v = d.versions[0];
  const u = urgency(d.updatedAt);
  const uploader = v?.uploadedBy;
  const dur = fmtDur(v?.durationSec);
  const clientPhoto = d.project.client?.photoUrl ? `/api/client-asset/photo/${d.project.client.id}` : null;
  const src = d.coverFileAssetId ? `/api/files-asset/${d.coverFileAssetId}` : clientPhoto;
  // La edad como texto plano que solo GRITA cuando es un problema del equipo, con los umbrales
  // que la pantalla ya usaba (1+ día ámbar, 3+ días rojo). En los grupos neutrales el tiempo
  // corre para el cliente: sin color, sin culpa.
  const edadCls =
    neutral || u.tier === "fresh"
      ? ""
      : u.tier === "warn"
        ? "font-semibold text-amber-600 dark:text-amber-400"
        : "font-semibold text-red-600 dark:text-red-400";
  return (
    // Envoltorio SIN overflow-hidden. La tarjeta recorta su contenido para las esquinas
    // redondeadas y el tinte del cliente, pero el panel del menú ⋯ mide 240 px: dentro del
    // recorte salía cortado por los dos lados. Así el menú es hermano de la tarjeta, no hijo.
    // OJO si alguna vez tientas `isolate` aquí: encerraría la escala de la tarjeta, sí, pero
    // también su menú ⋯ —que mide 240 px y TIENE que montarse sobre las tarjetas vecinas—, y
    // quedaría tapado por la siguiente de la cuadrícula. Que estos z- compitan con los hermanos
    // es justo lo que se necesita. De que no le ganen a la barra superior se encarga la barra,
    // que tiene su propio contexto (ver components/layout/topbar.tsx).
    <div className="group relative">
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors group-hover:border-primary/40">
      {/* El color del cliente ya no tiñe ni pone barra: una barra roja a toda altura se leía
          como alerta, no como «Diana Méndez». Ahora lo lleva el punto de la cabecera del grupo. */}
      <Link href={`/revisiones/${d.id}`} className="flex flex-1 flex-col">
        <div className="relative aspect-video w-full overflow-hidden bg-muted/40">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Film className="size-6 text-muted-foreground" />
            </div>
          )}
          {/* El preview en vivo: cubre la miniatura y solo carga si alguien posa el ratón. */}
          {d.previewSrc ? <PreviewVideo src={d.previewSrc} /> : null}
          {/* Sobre la miniatura viven SOLO los dos datos del video (versión y duración), en las
              esquinas de abajo. `pointer-events-none` para no robarle el ratón al preview. */}
          {v ? <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">v{v.number}</span> : null}
          {dur ? <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] tabular-nums text-white">{dur}</span> : null}
        </div>

        <div className="flex flex-1 flex-col gap-1 px-2.5 py-2">
          {/* El «#n» se queda (el equipo dice «la #4») pero deja de pesar como el título. */}
          <p className="truncate text-[13px] font-medium leading-snug" title={d.name}>
            {d.number ? <span className="mr-1 text-[11px] font-normal text-muted-foreground">#{d.number}</span> : null}{d.name}
          </p>
          {/* UNA línea de meta: quién subió, hace cuánto, y comentarios si los hay. El proyecto
              ya no se repite aquí: lo dice la cabecera del grupo. Sin botón «Ver →»: la tarjeta
              entera navega desde siempre, y dieciséis botones iguales solo eran ruido. */}
          <p className="mt-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {uploader ? (
              <>
                <UserAvatar initials={uploader.initials} color={uploader.avatarColor} size="sm" className="h-4 w-4" />
                <span className="truncate">{uploader.name.split(" ")[0]}</span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span className={`shrink-0 ${edadCls}`}>{sinceLabel(u)}</span>
            {d._count.reviewComments > 0 ? (
              <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 tabular-nums">
                <MessageSquare className="size-3" /> {d._count.reviewComments}
              </span>
            ) : null}
          </p>
          {d.publishedAt || showStatus ? <EstadoChip d={d} /> : null}
          {/* Ya está con el cliente: copiar su enlace es lo que uno viene a hacer aquí, así que
              sale al frente en vez de vivir dentro del menú ⋯. */}
          {conElCliente(d) ? <CopiarEnlace url={d.reviewUrl} activo={d.linkActive} className="w-full" /> : null}
        </div>
      </Link>
      </div>

      {/* Acciones de gestión en un solo ⋯ sobre la miniatura (publicar, copiar enlace, seleccionar,
          archivar, borrar). Antes era una barra de cuatro botones al pie: 44 px por tarjeta y casi
          sesenta botones en una pantalla llena. Va FUERA del <Link> para que no navegue al abrirlo. */}
      {d.manage ? (
        // En escritorio el ⋯ aparece al posar el ratón (o al tabular hasta él); en táctil,
        // donde no hay hover, se queda siempre visible. Una pantalla llena pasa de cincuenta
        // botones oscuros a cero hasta que alguien mira una tarjeta.
        <div className="absolute right-1.5 top-1.5 z-30 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
          <DeliverableAdminActions
            deliverableId={d.id}
            projectId={d.project.id}
            reviewUrl={d.reviewUrl}
            linkActive={d.linkActive}
            archived={d.archived}
            name={d.name}
            canPublish={d.canPublish}
            published={d.publishedAt != null}
            publishable={d.status === "APROBADO" || d.status === "ENTREGADO"}
          />
        </div>
      ) : null}
    </div>
  );
}
