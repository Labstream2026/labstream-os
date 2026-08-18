import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Mail, Paperclip, RefreshCw, Search, Send, Unlink } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatBogota } from "@/lib/bogota-time";
import { sanearCorreo } from "@/lib/correo/sanitizar";
import { sincronizarCuenta } from "@/lib/correo/imap";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { ConectarCorreo } from "./conectar";
import { MarcarLeido, Redactar } from "./redactar";
import { desconectarCorreo, sincronizarAhora } from "./acciones";

export const dynamic = "force-dynamic";

// ── Pestaña Correo: el buzón PERSONAL de cada quien ─────────────────────────
// La bandeja vive sincronizada en Postgres (rápida de listar y de buscar) y el detalle se
// pinta desde ahí; los adjuntos se bajan del servidor al pedirse. El HTML de un correo pasa
// SIEMPRE por sanearCorreo y además se encierra en un iframe sandbox: dos vallas, no una.

const HOST_DEFECTO = process.env.CORREO_HOST_DEFECTO || "192.168.0.22";
type Adjunto = { indice: number; nombre: string; mime: string; bytes: number };

export default async function CorreoPage({ searchParams }: { searchParams: Promise<{ c?: string; m?: string; q?: string; img?: string }> }) {
  const session = await getSession();
  if (!session || session.role === "cliente" || session.role === "demo") redirect("/");
  const sp = await searchParams;

  const cuenta = await db.mailAccount.findUnique({ where: { userId: session.id } });

  if (!cuenta) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <PageHeader title="Correo" description="Tu buzón del estudio, dentro de la app" icon={<Mail className="size-4" />} />
        <ConectarCorreo hostDefecto={HOST_DEFECTO} />
      </div>
    );
  }

  // Sincronización oportunista al abrir: si la última fue hace poco, no se molesta al
  // servidor. El cron de fondo mantiene el ritmo cuando nadie tiene la pestaña abierta.
  const rancio = !cuenta.lastSyncAt || Date.now() - cuenta.lastSyncAt.getTime() > 90_000;
  if (rancio) await sincronizarCuenta(cuenta.id, { max: 120 });
  const estado = rancio ? await db.mailAccount.findUnique({ where: { id: cuenta.id }, select: { syncError: true, lastSyncAt: true } }) : cuenta;

  const carpeta = sp.c === "enviados" ? "ENVIADOS" : "INBOX";
  const q = (sp.q ?? "").trim().slice(0, 100);

  const [mensajes, sinLeer] = await Promise.all([
    db.mailMessage.findMany({
      where: {
        accountId: cuenta.id,
        folder: carpeta,
        ...(q
          ? { OR: [{ subject: { contains: q, mode: "insensitive" } }, { fromEmail: { contains: q, mode: "insensitive" } }, { fromName: { contains: q, mode: "insensitive" } }, { snippet: { contains: q, mode: "insensitive" } }] }
          : {}),
      },
      orderBy: { date: "desc" },
      take: 100,
      select: { id: true, fromName: true, fromEmail: true, toList: true, subject: true, snippet: true, date: true, seen: true, answered: true, attachments: true },
    }),
    db.mailMessage.count({ where: { accountId: cuenta.id, folder: "INBOX", seen: false } }),
  ]);

  // El mensaje abierto (?m=): suyo o nada — el id viene del navegador.
  const abierto = sp.m
    ? await db.mailMessage.findFirst({
        where: { id: sp.m, accountId: cuenta.id },
        select: { id: true, folder: true, fromName: true, fromEmail: true, toList: true, subject: true, date: true, textBody: true, htmlBody: true, seen: true, attachments: true },
      })
    : null;
  const cuerpo = abierto?.htmlBody ? sanearCorreo(abierto.htmlBody, { permitirImagenes: sp.img === "1" }) : null;
  const adjuntos = ((abierto?.attachments as Adjunto[] | null) ?? []).filter((a) => a && typeof a.indice === "number");
  const linkBase = `/correo?c=${carpeta === "ENVIADOS" ? "enviados" : "recibidos"}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-7">
      <PageHeader title="Correo" description={cuenta.email} icon={<Mail className="size-4" />} />

      {/* Barra: pestañas + buscar + acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Carpeta">
          <Link href="/correo" className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px]", carpeta === "INBOX" ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted")}>
            <Inbox className="size-3.5" /> Recibidos{sinLeer > 0 ? <b className="tabular-nums">· {sinLeer}</b> : null}
          </Link>
          <Link href="/correo?c=enviados" className={cn("inline-flex items-center gap-1.5 border-l border-border px-2.5 py-1.5 text-[11.5px]", carpeta === "ENVIADOS" ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted")}>
            <Send className="size-3.5" /> Enviados
          </Link>
        </span>
        <form action="/correo" className="relative min-w-40 flex-1 sm:max-w-xs">
          {carpeta === "ENVIADOS" ? <input type="hidden" name="c" value="enviados" /> : null}
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={q} placeholder="Buscar en el correo…"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2.5 text-[12px] outline-none focus:ring-2 focus:ring-ring" />
        </form>
        <Redactar />
        <form action={async () => { "use server"; await sincronizarAhora(); }}>
          <button type="submit" title="Buscar correo nuevo ahora" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground">
            <RefreshCw className="size-3.5" /> Actualizar
          </button>
        </form>
        <form action={async () => { "use server"; await desconectarCorreo(); }}>
          <button type="submit" title="Desconectar este buzón de la app (tu correo real no se toca)" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground">
            <Unlink className="size-3.5" />
          </button>
        </form>
      </div>

      {estado?.syncError ? (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px]">
          <b className="text-destructive">No se pudo sincronizar:</b> <span className="text-muted-foreground">{estado.syncError}</span>
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[340px_1fr]">
        {/* ── Lista ── */}
        <div className={cn("overflow-hidden rounded-xl border border-border bg-card", abierto ? "hidden lg:block" : "")}>
          {mensajes.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12px] text-muted-foreground">
              {q ? "Nada coincide con esa búsqueda." : carpeta === "ENVIADOS" ? "Aún no has enviado nada desde la app." : "Bandeja al día: no hay correos sincronizados todavía."}
            </p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {mensajes.map((m) => {
                const quien = carpeta === "ENVIADOS" ? `Para: ${m.toList || "—"}` : m.fromName || m.fromEmail || "—";
                const conAdj = Array.isArray(m.attachments) && (m.attachments as unknown[]).length > 0;
                return (
                  <li key={m.id}>
                    <Link href={`${linkBase}&m=${m.id}`} prefetch={false} scroll={false}
                      className={cn("block px-3 py-2.5 transition-colors hover:bg-accent/40", abierto?.id === m.id && "bg-primary/5")}>
                      <span className="flex items-baseline gap-2">
                        {!m.seen && carpeta === "INBOX" ? <span aria-label="Sin leer" className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
                        <span className={cn("min-w-0 flex-1 truncate text-[12px]", m.seen ? "text-muted-foreground" : "font-semibold")}>{quien}</span>
                        <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">{formatBogota(m.date, { day: "numeric", month: "short" })}</span>
                      </span>
                      <span className={cn("mt-0.5 block truncate text-[12.5px]", !m.seen && carpeta === "INBOX" && "font-medium")}>
                        {conAdj ? <Paperclip className="mr-1 inline size-3 text-muted-foreground" /> : null}
                        {m.answered ? <span title="Respondido" className="mr-1 text-muted-foreground">↩</span> : null}
                        {m.subject}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{m.snippet}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Lector ── */}
        <div className="min-w-0">
          {!abierto ? (
            <div className="hidden h-full min-h-48 items-center justify-center rounded-xl border border-dashed border-border lg:flex">
              <p className="text-[12px] text-muted-foreground">Elige un correo para leerlo.</p>
            </div>
          ) : (
            <article className="rounded-xl border border-border bg-card p-4">
              {!abierto.seen && abierto.folder === "INBOX" ? <MarcarLeido id={abierto.id} /> : null}
              <Link href={linkBase} scroll={false} className="mb-2 inline-block text-[11px] text-muted-foreground hover:text-foreground lg:hidden">← Volver a la lista</Link>
              <h2 className="text-[15px] font-semibold leading-snug">{abierto.subject}</h2>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {abierto.folder === "ENVIADOS" ? <>Para: <b className="text-foreground">{abierto.toList || "—"}</b></> : <><b className="text-foreground">{abierto.fromName || abierto.fromEmail}</b>{abierto.fromName ? ` <${abierto.fromEmail}>` : ""}</>}
                {" · "}{formatBogota(abierto.date)}
              </p>

              {adjuntos.length ? (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {adjuntos.map((a) => (
                    <a key={a.indice} href={`/api/correo/adjunto/${abierto.id}/${a.indice}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Paperclip className="size-3" /> {a.nombre} <span className="tabular-nums">({Math.max(1, Math.round(a.bytes / 1024))} KB)</span>
                    </a>
                  ))}
                </p>
              ) : null}

              {cuerpo && cuerpo.imagenesBloqueadas > 0 ? (
                <p className="mt-2 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">
                  {cuerpo.imagenesBloqueadas} {cuerpo.imagenesBloqueadas === 1 ? "imagen oculta" : "imágenes ocultas"} — avisan al remitente que abriste el correo.
                  <Link href={`${linkBase}&m=${abierto.id}&img=1`} scroll={false} className="font-medium text-primary hover:underline">Mostrar imágenes</Link>
                </p>
              ) : null}

              <div className="mt-3 overflow-hidden rounded-lg border border-border">
                {cuerpo ? (
                  // Segunda valla tras el saneado: sandbox sin scripts ni mismo origen. Los
                  // enlaces (_blank) necesitan allow-popups para poder abrirse — nada más.
                  <iframe
                    title="Contenido del correo"
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    srcDoc={`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:14px;background:#fff;color:#111;font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;word-break:break-word">${cuerpo.html}</body></html>`}
                    className="h-[58vh] w-full bg-white"
                  />
                ) : (
                  <pre className="max-h-[58vh] overflow-y-auto whitespace-pre-wrap bg-background px-4 py-3 font-sans text-[13px] leading-relaxed">{abierto.textBody || "(sin contenido)"}</pre>
                )}
              </div>

              {abierto.folder === "INBOX" ? (
                <div className="mt-3">
                  <Redactar responderA={{ id: abierto.id, para: abierto.fromEmail ?? "", asunto: abierto.subject }} />
                </div>
              ) : null}
            </article>
          )}
        </div>
      </div>

      <p className="mt-3 text-[10.5px] text-muted-foreground">
        Se sincroniza la bandeja de entrada reciente (últimos {60} días, al abrir y cada pocos minutos). El buzón completo sigue en el webmail de MailPlus.
      </p>
    </div>
  );
}
