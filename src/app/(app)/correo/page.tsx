import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, Clock, FileText, Inbox, Mail, Paperclip, PenTool, RefreshCw, Search, Send, Star, Trash2, Unlink, X } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatBogota } from "@/lib/bogota-time";
import { tone } from "@/lib/colors";
import { sanearCorreo, cidLimpio } from "@/lib/correo/sanitizar";
import { bloqueFirma } from "@/lib/correo/redactar";
import { sincronizarCuenta } from "@/lib/correo/imap";
import { agruparHilos, asuntoLimpio } from "@/lib/correo/hilos";
import { estadoRonda } from "@/lib/rondas";
import { accessibleProjectWhere, aliveProjectWhere } from "@/lib/project-access";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { ConectarCorreo } from "./conectar";
import { desconectarCorreo, eliminarBorrador, sincronizarAhora } from "./acciones";
import { AbrirBorrador, BotonRedactar, CompositorProvider } from "./compositor";
import { PanelFirma, BibliotecaGifs } from "./firma-gifs";
import { BarraHilo, BotonesRespuesta, ListaHilos, MarcarHiloLeido, type HiloVM, type ProyectoAsignable } from "./bandeja";

export const dynamic = "force-dynamic";

// ── Pestaña Correo v2: bandeja de CONVERSACIONES al estilo Gmail ────────────
// Raíl (Redactar + carpetas + clientes detectados), lista de hilos con selección y acciones,
// y vista de conversación con los mensajes viejos plegados. El servidor agrupa, sanea y
// serializa; el cliente pinta y dispara. Las etiquetas de cliente y el banner del hilo son
// lo que Gmail no puede hacer: el correo cruzado con el CRM y el estado real del proyecto.

const HOST_DEFECTO = process.env.CORREO_HOST_DEFECTO || "192.168.0.22";
type Adjunto = { indice: number; nombre: string; mime: string; bytes: number; cid?: string };
type CarpetaKey = "recibidos" | "destacados" | "pospuestos" | "enviados" | "borradores" | "archivo" | "papelera" | "ajustes";
const CARPETAS: { key: CarpetaKey; label: string; Icon: typeof Inbox }[] = [
  { key: "recibidos", label: "Recibidos", Icon: Inbox },
  { key: "destacados", label: "Destacados", Icon: Star },
  { key: "pospuestos", label: "Pospuestos", Icon: Clock },
  { key: "enviados", label: "Enviados", Icon: Send },
  { key: "borradores", label: "Borradores", Icon: FileText },
  { key: "archivo", label: "Archivo", Icon: Archive },
  { key: "papelera", label: "Papelera", Icon: Trash2 },
  { key: "ajustes", label: "Firma y GIFs", Icon: PenTool },
];

export default async function CorreoPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string; h?: string; img?: string }> }) {
  const session = await getSession();
  if (!session || session.role === "cliente" || session.role === "demo") redirect("/");
  const sp = await searchParams;

  const cuenta = await db.mailAccount.findUnique({ where: { userId: session.id } });
  if (!cuenta) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <PageHeader title="Correo" description="Tu buzón del estudio, dentro de la app" icon={<Mail className="size-4" />} />
        {/* La dirección viene de la cuenta de la app: los correos del equipo SON sus buzones
            de MailPlus, así que conectar es escribir la contraseña y nada más. */}
        <ConectarCorreo hostDefecto={HOST_DEFECTO} emailSugerido={session.email ?? undefined} />
      </div>
    );
  }

  const rancio = !cuenta.lastSyncAt || Date.now() - cuenta.lastSyncAt.getTime() > 90_000;
  if (rancio) await sincronizarCuenta(cuenta.id, { max: 120 });
  const estado = rancio ? await db.mailAccount.findUnique({ where: { id: cuenta.id }, select: { syncError: true } }) : cuenta;

  const carpeta: CarpetaKey = (CARPETAS.find((c) => c.key === sp.c)?.key ?? "recibidos") as CarpetaKey;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const clFiltro = (sp.c ?? "").startsWith("cliente:") ? (sp.c ?? "").slice(8) : null;

  const ahora = new Date();
  const whereCarpeta = clFiltro
    ? { clientId: clFiltro, folder: { not: "PAPELERA" } }
    : carpeta === "destacados"
      ? { flagged: true, folder: { not: "PAPELERA" } }
      : carpeta === "pospuestos"
        ? { snoozedUntil: { gt: ahora }, folder: { not: "PAPELERA" } }
        : carpeta === "recibidos" || carpeta === "ajustes"
          ? { folder: "INBOX", OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: ahora } }] }
          : { folder: carpeta === "enviados" ? "ENVIADOS" : carpeta === "archivo" ? "ARCHIVO" : "PAPELERA" };

  const [mensajes, sinLeer, nPospuestos, borradores, porCliente, clientes, contactosEquipo, gifsLib, yo] = await Promise.all([
    db.mailMessage.findMany({
      where: {
        accountId: cuenta.id,
        ...whereCarpeta,
        ...(q
          ? { OR: [{ subject: { contains: q, mode: "insensitive" } }, { fromEmail: { contains: q, mode: "insensitive" } }, { fromName: { contains: q, mode: "insensitive" } }, { snippet: { contains: q, mode: "insensitive" } }, { textBody: { contains: q, mode: "insensitive" } }] }
          : {}),
      },
      orderBy: { date: "desc" },
      take: 400,
      select: { id: true, threadKey: true, folder: true, fromName: true, fromEmail: true, toList: true, subject: true, snippet: true, date: true, seen: true, flagged: true, clientId: true, attachments: true },
    }),
    // No leídos SIN los pospuestos: posponer es sacarlo de la vista, contarlo sería trampa.
    db.mailMessage.count({ where: { accountId: cuenta.id, folder: "INBOX", seen: false, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: ahora } }] } }),
    db.mailMessage.count({ where: { accountId: cuenta.id, snoozedUntil: { gt: ahora }, folder: { not: "PAPELERA" } } }),
    db.mailDraft.findMany({ where: { accountId: cuenta.id }, orderBy: { updatedAt: "desc" }, take: 50 }),
    // Clientes detectados en ESTE buzón, con sus no-leídos: el raíl solo lista lo que existe.
    db.mailMessage.groupBy({ by: ["clientId"], where: { accountId: cuenta.id, clientId: { not: null }, folder: "INBOX", seen: false }, _count: { _all: true } }),
    db.mailMessage.findMany({ where: { accountId: cuenta.id, clientId: { not: null } }, distinct: ["clientId"], select: { client: { select: { id: true, name: true, accentColor: true } } } }),
    // Autocompletar del compositor: equipo + miembros de portales de clientes. Del CRM, no
    // de una libreta aparte.
    db.user.findMany({ where: { active: true, isSystemBot: false, isGuest: false }, select: { email: true } }),
    // La biblioteca de GIFs (solo metadatos: los bytes los sirve /api/correo/gif/<id>).
    db.mailGif.findMany({ orderBy: { createdAt: "desc" }, take: 60, select: { id: true, nombre: true, createdBy: { select: { name: true } } } }),
    db.user.findUnique({ where: { id: session.id }, select: { name: true, title: true } }),
  ]);

  const clienteInfo = new Map(clientes.filter((c) => c.client).map((c) => [c.client!.id, { nombre: c.client!.name, hex: tone(c.client!.accentColor ?? "slate").hex }]));
  const noLeidosCliente = new Map(porCliente.map((r) => [r.clientId!, r._count._all]));
  const contactos = [...new Set(contactosEquipo.map((u) => u.email).filter(Boolean))].sort();
  const gifs = gifsLib.map((g) => ({ id: g.id, nombre: g.nombre }));

  // La firma tal como saldrá (para la vista previa del compositor): el cid de la imagen se
  // sustituye por la ruta propia — en el correo real viaja incrustada.
  const firma = bloqueFirma({
    nombre: yo?.name ?? session.name ?? "Labstream",
    cargo: yo?.title,
    firmaHtml: cuenta.signatureHtml,
    tieneImagen: !!cuenta.signatureImage,
  });
  const firmaPreview = firma.html.replace(/cid:firma@labstream/g, "/api/correo/firma-imagen");

  const hiloAbiertoIds = (sp.h ?? "").split(".").filter(Boolean).slice(0, 60);
  const linkBase = `/correo?c=${clFiltro ? `cliente:${clFiltro}` : carpeta}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  // ── VM de la lista: hilos agrupados, ya formateados ──
  const cortito = (d: Date) => {
    const hoy = new Date().toDateString() === d.toDateString();
    return hoy ? formatBogota(d, { hour: "2-digit", minute: "2-digit", hour12: false }) : formatBogota(d, { day: "numeric", month: "short" }).replace(".", "");
  };
  const hilos: HiloVM[] = agruparHilos(mensajes).slice(0, 80).map((h) => {
    const u = h.ultimo;
    const quien = u.folder === "ENVIADOS" ? `Para: ${(u as (typeof mensajes)[number]).toList || "—"}` : ((u as (typeof mensajes)[number]).fromName || u.fromEmail || "—");
    const cid = h.mensajes.map((m) => (m as (typeof mensajes)[number]).clientId).find(Boolean) ?? null;
    return {
      clave: h.clave,
      href: `${linkBase}&h=${h.mensajes.map((m) => m.id).join(".")}`,
      quien,
      n: h.mensajes.length,
      asunto: asuntoLimpio(u.subject),
      snippet: (u as (typeof mensajes)[number]).snippet,
      cuando: cortito(u.date),
      noLeidos: h.noLeidos,
      destacado: h.destacado,
      conAdjunto: h.mensajes.some((m) => Array.isArray((m as (typeof mensajes)[number]).attachments) && ((m as (typeof mensajes)[number]).attachments as unknown[]).length > 0),
      cliente: cid ? clienteInfo.get(cid) ?? null : null,
      ids: h.mensajes.map((m) => m.id),
      ultimoId: u.id,
    };
  });

  // ── El hilo abierto (por ids, del propio buzón siempre) ──
  const hiloMsgs = hiloAbiertoIds.length
    ? await db.mailMessage.findMany({
        where: { id: { in: hiloAbiertoIds }, accountId: cuenta.id },
        orderBy: { date: "asc" },
        select: { id: true, folder: true, fromName: true, fromEmail: true, toList: true, ccList: true, subject: true, snippet: true, date: true, textBody: true, htmlBody: true, seen: true, clientId: true, attachments: true, projectId: true, project: { select: { id: true, name: true } } },
      })
    : [];

  // Banner CRM del hilo: cliente + la pieza que está en su cancha ahora mismo.
  const hiloClienteId = hiloMsgs.map((m) => m.clientId).find(Boolean) ?? null;

  // ── Proyecto del hilo + a cuáles se puede asignar ──
  // Los del cliente detectado van de primeros (es casi siempre la respuesta); después el
  // resto de proyectos vivos que el usuario puede ver.
  const hiloProyecto = hiloMsgs.map((m) => m.project).find(Boolean) ?? null;
  const proyectosAsignables: ProyectoAsignable[] = hiloMsgs.length
    ? (
        await db.project.findMany({
          where: { ...accessibleProjectWhere(session), ...aliveProjectWhere },
          orderBy: [{ updatedAt: "desc" }],
          take: 60,
          select: { id: true, name: true, clientId: true },
        })
      )
        .sort((a, b) => Number(b.clientId === hiloClienteId) - Number(a.clientId === hiloClienteId))
        .map((p) => ({ id: p.id, nombre: p.name }))
    : [];
  const hiloRemitente = hiloMsgs.find((m) => m.folder !== "ENVIADOS")?.fromEmail ?? null;
  const crm = hiloClienteId
    ? await db.client.findUnique({
        where: { id: hiloClienteId },
        select: {
          id: true, name: true,
          projects: {
            where: { archivedAt: null, deliverables: { some: { status: "ENVIADO_CLIENTE", sentToClientAt: { not: null } } } },
            select: {
              id: true, name: true, roundsIncluded: true,
              deliverables: {
                where: { status: "ENVIADO_CLIENTE", sentToClientAt: { not: null } },
                orderBy: { sentToClientAt: "desc" }, take: 1,
                select: { id: true, name: true, number: true, sentToClientAt: true, decisions: { where: { stage: "CLIENTE", result: "CAMBIOS" }, select: { id: true } } },
              },
            },
            take: 1,
          },
        },
      })
    : null;
  const crmPieza = crm?.projects[0]?.deliverables[0] ?? null;
  const crmRonda = crmPieza && crm?.projects[0] ? estadoRonda(crmPieza.decisions.length, crm.projects[0].roundsIncluded) : null;
  const diasConCliente = crmPieza?.sentToClientAt ? Math.max(0, Math.floor((Date.now() - crmPieza.sentToClientAt.getTime()) / 86_400_000)) : null;

  const ultimo = hiloMsgs[hiloMsgs.length - 1] ?? null;
  const miEmail = cuenta.email.toLowerCase();
  const otros = ultimo
    ? [...(ultimo.toList ?? "").split(","), ...(ultimo.ccList ?? "").split(",")]
        .map((s) => s.trim()).filter((s) => s && !s.toLowerCase().includes(miEmail))
    : [];
  const prefills = ultimo
    ? {
        responder: { modo: "responder" as const, para: ultimo.folder === "ENVIADOS" ? ultimo.toList : (ultimo.fromEmail ?? ""), asunto: `Re: ${asuntoLimpio(ultimo.subject)}`, responderAId: ultimo.id },
        todos: otros.length
          ? { modo: "todos" as const, para: ultimo.folder === "ENVIADOS" ? ultimo.toList : (ultimo.fromEmail ?? ""), cc: otros.join(", "), asunto: `Re: ${asuntoLimpio(ultimo.subject)}`, responderAId: ultimo.id }
          : null,
        reenviar: { modo: "reenviar" as const, asunto: `Fwd: ${asuntoLimpio(ultimo.subject)}`, reenviarDeId: ultimo.id },
      }
    : null;

  return (
    <CompositorProvider contactos={contactos} firmaHtml={firmaPreview} gifs={gifs}>
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <PageHeader title="Correo" description={cuenta.email} icon={<Mail className="size-4" />} />

        <div className="grid gap-3 lg:grid-cols-[200px_1fr]">
          {/* ── Raíl ── */}
          <nav className="flex flex-row flex-wrap gap-1 lg:flex-col">
            <div className="mb-1 w-full lg:mb-3"><BotonRedactar /></div>
            {CARPETAS.map(({ key, label, Icon }) => (
              <Link key={key} href={`/correo?c=${key}`} prefetch={false}
                className={cn("flex items-center gap-2.5 rounded-full px-3.5 py-1.5 text-[13px]", !clFiltro && carpeta === key ? "bg-primary/10 font-bold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                <Icon className="size-4" /> {label}
                {key === "recibidos" && sinLeer > 0 ? <b className="ml-auto text-[11.5px] tabular-nums">{sinLeer}</b> : null}
                {key === "pospuestos" && nPospuestos > 0 ? <span className="ml-auto text-[11.5px] tabular-nums">{nPospuestos}</span> : null}
                {key === "borradores" && borradores.length > 0 ? <span className="ml-auto text-[11.5px] tabular-nums">{borradores.length}</span> : null}
              </Link>
            ))}
            {clienteInfo.size ? <p className="mt-2 hidden px-3.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground lg:block">Clientes · automático</p> : null}
            {[...clienteInfo.entries()].map(([id, c]) => (
              <Link key={id} href={`/correo?c=cliente:${id}`} prefetch={false}
                className={cn("flex items-center gap-2.5 rounded-full px-3.5 py-1.5 text-[13px]", clFiltro === id ? "bg-primary/10 font-bold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                <span className="size-2.5 rounded-full" style={{ background: c.hex }} /> <span className="truncate">{c.nombre}</span>
                {noLeidosCliente.get(id) ? <b className="ml-auto text-[11.5px] tabular-nums">{noLeidosCliente.get(id)}</b> : null}
              </Link>
            ))}
          </nav>

          {/* ── Panel ── */}
          <div className="flex min-h-[70vh] flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <form action="/correo" className="relative min-w-40 flex-1 sm:max-w-md">
                <input type="hidden" name="c" value={clFiltro ? `cliente:${clFiltro}` : carpeta} />
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input name="q" defaultValue={q} placeholder="Buscar en el correo…"
                  className="w-full rounded-full border border-border bg-background py-1.5 pl-9 pr-3 text-[12.5px] outline-none focus:ring-2 focus:ring-ring" />
              </form>
              <form action={async () => { "use server"; await sincronizarAhora(); }}>
                <button type="submit" title="Buscar correo nuevo ahora" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><RefreshCw className="size-4" /></button>
              </form>
              <form action={async () => { "use server"; await desconectarCorreo(); }}>
                <button type="submit" title="Desconectar este buzón (tu correo real no se toca)" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Unlink className="size-4" /></button>
              </form>
            </div>

            {estado?.syncError ? (
              <p className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-[12px]"><b className="text-destructive">No se pudo sincronizar:</b> <span className="text-muted-foreground">{estado.syncError}</span></p>
            ) : null}

            {carpeta === "ajustes" && !clFiltro ? (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <PanelFirma firmaHtml={cuenta.signatureHtml ?? ""} imagenUrl={cuenta.signatureImage ? "/api/correo/firma-imagen" : null} />
                <BibliotecaGifs gifs={gifsLib.map((g) => ({ id: g.id, nombre: g.nombre, autor: g.createdBy?.name ?? null }))} />
              </div>
            ) : carpeta === "borradores" && !clFiltro ? (
              <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                {borradores.map((b) => (
                  <li key={b.id} className="group flex h-11 items-center gap-2 px-4 hover:bg-accent/40">
                    <AbrirBorrador borrador={b} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="shrink-0 text-[11px] font-bold uppercase text-red-600 dark:text-red-400">Borrador</span>
                      <span className="w-44 shrink-0 truncate text-[13px] text-muted-foreground">{b.para || "(sin destinatario)"}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {b.asunto || "(sin asunto)"} <span className="text-muted-foreground">— {b.texto.replace(/\s+/g, " ").slice(0, 90)}</span>
                      </span>
                      <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{formatBogota(b.updatedAt, { day: "numeric", month: "short" }).replace(".", "")}</span>
                    </AbrirBorrador>
                    <form action={eliminarBorrador.bind(null, b.id)}>
                      <button type="submit" title="Descartar borrador" className="hidden rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-destructive group-hover:block">
                        <X className="size-4" />
                      </button>
                    </form>
                  </li>
                ))}
                {borradores.length === 0 ? <li className="px-4 py-12 text-center text-[12.5px] text-muted-foreground">Sin borradores. Lo que escribas en el compositor se guarda aquí solo.</li> : null}
              </ul>
            ) : !hiloMsgs.length ? (
              <ListaHilos hilos={hilos} carpeta={clFiltro ? "recibidos" : carpeta} />
            ) : (
              <>
                <BarraHilo
                  ids={hiloMsgs.map((m) => m.id)}
                  carpeta={carpeta}
                  volverHref={linkBase}
                  proyectos={proyectosAsignables}
                  proyectoActual={hiloProyecto ? { id: hiloProyecto.id, nombre: hiloProyecto.name } : null}
                  remitente={hiloRemitente}
                />
                <MarcarHiloLeido ids={hiloMsgs.filter((m) => !m.seen && m.folder === "INBOX").map((m) => m.id)} />
                <article className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
                  <h1 className="flex flex-wrap items-center gap-2 text-[18px] font-medium">
                    {asuntoLimpio(ultimo?.subject ?? "")}
                    {hiloClienteId && clienteInfo.get(hiloClienteId) ? (
                      <span className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ background: `${clienteInfo.get(hiloClienteId)!.hex}22`, color: clienteInfo.get(hiloClienteId)!.hex }}>
                        {clienteInfo.get(hiloClienteId)!.nombre}
                      </span>
                    ) : null}
                  </h1>

                  {crm ? (
                    <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border border-l-2 border-l-primary bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
                      🎬 Este hilo es de <b className="text-foreground">{crm.name}</b>
                      {crmPieza ? (
                        <> · la pieza <b className="text-foreground">{crmPieza.number ? `#${crmPieza.number} ` : ""}{crmPieza.name}</b> está con el cliente
                          {diasConCliente !== null ? <> hace <b className="text-foreground">{diasConCliente} día{diasConCliente === 1 ? "" : "s"}</b></> : null}
                          {crmRonda?.texto ? <> · {crmRonda.texto.toLowerCase()}</> : null}</>
                      ) : null}
                      <Link href={`/clientes/${crm.id}`} className="ml-auto font-semibold text-primary hover:underline">Abrir el cliente →</Link>
                    </p>
                  ) : null}

                  <div className="mt-2 space-y-2.5">
                    {hiloMsgs.map((m, i) => {
                      const esUltimo = i === hiloMsgs.length - 1;
                      const adjuntos = ((m.attachments as Adjunto[] | null) ?? []).filter((a) => a && typeof a.indice === "number");
                      // Imágenes INCRUSTADAS (firmas, GIFs): cid → nuestra ruta autenticada.
                      const cids = new Map(adjuntos.filter((a) => a.cid).map((a) => [cidLimpio(a.cid!), `/api/correo/inline/${m.id}/${a.indice}`]));
                      const cuerpo = m.htmlBody ? sanearCorreo(m.htmlBody, { permitirImagenes: sp.img === m.id, cids }) : null;
                      return (
                        <details key={m.id} open={esUltimo} className="group/msg rounded-xl border border-border open:bg-card [&:not([open])]:bg-muted/30">
                          <summary className="flex cursor-pointer list-none items-baseline gap-2.5 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                            <b className="shrink-0 text-[13px]">{m.folder === "ENVIADOS" ? "Yo" : m.fromName || m.fromEmail}</b>
                            <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground group-open/msg:hidden">{m.snippet ?? ""}</span>
                            <span className="hidden min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground group-open/msg:inline">
                              {m.folder === "ENVIADOS" ? `para ${m.toList}` : m.fromEmail}{m.ccList ? ` · cc: ${m.ccList}` : ""}
                            </span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatBogota(m.date)}</span>
                          </summary>
                          <div className="px-4 pb-4">
                            {adjuntos.length ? (
                              <p className="mb-2 flex flex-wrap gap-1.5">
                                {adjuntos.map((a) => (
                                  <a key={a.indice} href={m.folder === "ENVIADOS" ? undefined : `/api/correo/adjunto/${m.id}/${a.indice}`}
                                    className={cn("inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground", m.folder !== "ENVIADOS" && "hover:bg-muted hover:text-foreground")}>
                                    <Paperclip className="size-3" /> {a.nombre} <span className="tabular-nums">({Math.max(1, Math.round(a.bytes / 1024))} KB)</span>
                                  </a>
                                ))}
                              </p>
                            ) : null}
                            {cuerpo && cuerpo.imagenesBloqueadas > 0 ? (
                              <p className="mb-2 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">
                                🛡️ {cuerpo.imagenesBloqueadas} {cuerpo.imagenesBloqueadas === 1 ? "imagen oculta" : "imágenes ocultas"} — avisan al remitente que abriste el correo.
                                <Link href={`${linkBase}&h=${sp.h}&img=${m.id}`} scroll={false} className="font-medium text-primary hover:underline">Mostrar</Link>
                              </p>
                            ) : null}
                            {cuerpo ? (
                              <iframe title="Mensaje" sandbox="allow-popups allow-popups-to-escape-sandbox"
                                srcDoc={`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:10px;background:#fff;color:#111;font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;word-break:break-word">${cuerpo.html}</body></html>`}
                                className="h-[46vh] w-full rounded-lg border border-border bg-white" />
                            ) : (
                              <pre className="max-h-[46vh] overflow-y-auto whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed">{m.textBody || "(sin contenido)"}</pre>
                            )}
                          </div>
                        </details>
                      );
                    })}
                  </div>

                  {prefills ? <BotonesRespuesta prefills={prefills} /> : null}
                </article>
              </>
            )}
          </div>
        </div>

        <p className="mt-2 text-[10.5px] text-muted-foreground">
          Sincronizado con MailPlus: archivar, destacar o leer aquí se refleja igual en el webmail (posponer y borradores son solo de la app).
          Atajos: <kbd className="rounded border border-border bg-muted px-1">c</kbd> redactar · <kbd className="rounded border border-border bg-muted px-1">j</kbd>/<kbd className="rounded border border-border bg-muted px-1">k</kbd> moverse · <kbd className="rounded border border-border bg-muted px-1">Enter</kbd> abrir · <kbd className="rounded border border-border bg-muted px-1">e</kbd> archivar · <kbd className="rounded border border-border bg-muted px-1">s</kbd> destacar.
        </p>
      </div>
    </CompositorProvider>
  );
}
