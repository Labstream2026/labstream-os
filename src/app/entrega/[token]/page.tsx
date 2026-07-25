import type * as React from "react";
import { Camera, Download, ImageIcon, Play } from "lucide-react";
import { db } from "@/lib/db";
import { parseDeliveryToken } from "@/lib/delivery-token";
import { deliveryTeamIds, getDeliveryPackage, type DeliveryItem } from "@/lib/delivery-data";
import { DELIVERY_GROUP_LABEL, DELIVERY_GROUP_ORDER, deliveryCountdownLabel, deliveryDaysLeft } from "@/lib/delivery-groups";
import { formatBogotaDate } from "@/lib/bogota-time";
import { tone } from "@/lib/colors";
import { notifyMany } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { Logo } from "@/components/brand/logo";
import { EntityEmoji } from "@/components/icons/marks";

// ── Sala PÚBLICA de entrega del proyecto ──
// El cliente descarga TODO su material final (reels, videos, fotos, portadas) desde un solo
// enlace, sin cuenta: la autorización es el token firmado por proyecto (patrón /portadas).
// A diferencia de las otras salas, ésta SOBREVIVE al archivo del proyecto: el material se
// entrega justo cuando el proyecto se cierra, así que archivedAt NO invalida el enlace (solo
// la purga definitiva, que borra la fila). Cada descarga pasa por /api/entrega/[token]/go
// para registrar actividad — por eso aquí no se arman URLs de Drive directas.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mismo tema carbón de la sala de revisión (variables copiadas de review/[token]).
const ROOM_VARS = {
  "--background": "240 6% 7%",
  "--foreground": "0 0% 95%",
  "--card": "240 6% 9%",
  "--card-foreground": "0 0% 95%",
  "--popover": "240 6% 9%",
  "--popover-foreground": "0 0% 95%",
  "--primary": "25 95% 53%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "240 5% 15%",
  "--secondary-foreground": "0 0% 92%",
  "--muted": "240 5% 14%",
  "--muted-foreground": "240 5% 66%",
  "--accent": "240 5% 16%",
  "--accent-foreground": "0 0% 95%",
  "--border": "240 5% 20%",
  "--input": "240 5% 24%",
  "--ring": "25 95% 53%",
} as React.CSSProperties;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark relative min-h-screen overflow-x-clip bg-background text-foreground" style={ROOM_VARS}>
      <div aria-hidden className="pointer-events-none absolute -top-32 right-[-10%] size-96 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-6rem] left-[-8%] size-80 rounded-full bg-primary/10 blur-3xl" />
      {children}
    </div>
  );
}

function Unavailable({ title, msg }: { title?: string; msg: string }) {
  return (
    <Shell>
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.05] p-8 backdrop-blur-xl">
          <Logo className="mx-auto h-6" />
          <h1 className="mt-4 text-xl font-bold">{title ?? "Enlace no disponible"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
        </div>
      </div>
    </Shell>
  );
}

// Botón de descarga que pasa por /go (registra la descarga y valida el alcance en el servidor).
function goHref(token: string, k: string, id: string) {
  return `/api/entrega/${token}/go?k=${k}&id=${id}`;
}

function ItemCard({ item, token }: { item: DeliveryItem; token: string }) {
  if (item.photos) {
    // Set de fotos: la galería completa (ver, elegir, descargar) vive en su sala.
    return (
      <article className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
        {item.photos.thumbs.length > 0 ? (
          <div className="grid grid-cols-3 gap-0.5 bg-muted/40">
            {item.photos.thumbs.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" loading="lazy" className="aspect-square w-full object-cover" />
            ))}
          </div>
        ) : (
          <div className="flex aspect-[3/1] items-center justify-center bg-muted/40">
            <Camera className="size-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" title={item.name}>{item.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.photos.count} fotos{item.photos.liked ? ` · ♥ ${item.photos.liked} elegidas` : ""}
            </p>
          </div>
          <a
            href={goHref(token, "fotos", item.id)}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Abrir galería ↗
          </a>
        </div>
      </article>
    );
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
      <div className="relative aspect-video w-full overflow-hidden bg-muted/60">
        <div className="absolute inset-0 flex items-center justify-center">
          <Play className="size-6 text-muted-foreground" />
        </div>
        {item.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.cover} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : null}
        {item.versionNumber ? (
          <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">v{item.versionNumber} final</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="truncate text-sm font-semibold" title={item.name}>
          {item.number ? <span className="text-muted-foreground">#{item.number} · </span> : null}
          {item.name}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {item.typeLabel} · aprobado el {formatBogotaDate(item.approvedAt, { day: "numeric", month: "short" })}
        </p>
        {item.renditions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.renditions.map((r) => (
              <a
                key={r.id}
                href={goHref(token, "rend", r.id)}
                target="_blank"
                rel="noreferrer"
                title={`Descargar ${r.label}`}
                className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                ⬇ {r.label}
              </a>
            ))}
          </div>
        ) : null}
        <div className="mt-auto flex items-center gap-1.5 pt-1.5">
          {item.download ? (
            <a
              href={goHref(token, "master", item.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Download className="size-3.5" /> Descargar
            </a>
          ) : item.renditions.length === 0 ? (
            <span className="flex-1 text-center text-[11px] text-muted-foreground">Pídele el archivo al equipo</span>
          ) : (
            <span className="flex-1 text-center text-[11px] text-muted-foreground">Elige un formato ↑</span>
          )}
          {item.coverDownload ? (
            <a
              href={goHref(token, "itemcover", item.id)}
              target="_blank"
              rel="noreferrer"
              title="Descargar la portada aprobada de este video"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ImageIcon className="size-3" /> Portada
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default async function EntregaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = parseDeliveryToken(token);
  if (!parsed) return <Unavailable msg="Este enlace de entrega no es válido. Pide uno nuevo a tu productor." />;

  const project = await db.project.findUnique({
    where: { id: parsed.projectId },
    select: {
      id: true,
      name: true,
      emoji: true,
      bannerUrl: true,
      deliveryNonce: true,
      deliveryRevokedAt: true,
      deliveryExpiresAt: true,
      client: { select: { name: true, logoUrl: true, logoBg: true, accentColor: true, bannerUrl: true } },
    },
  });
  // OJO: a propósito NO se corta por archivedAt — la entrega sobrevive al archivo del proyecto.
  if (!project) return <Unavailable msg="Este enlace de entrega ya no está disponible." />;
  const badNonce = !project.deliveryNonce || project.deliveryNonce !== parsed.nonce;
  if (badNonce || project.deliveryRevokedAt)
    return <Unavailable msg="El equipo reemplazó o revocó este enlace. Pide el enlace vigente a tu productor." />;
  // deliveryDaysLeft (lib pura) hace la aritmética de fechas: 0 = vencido, null = sin límite.
  const daysLeft = deliveryDaysLeft(project.deliveryExpiresAt);
  if (daysLeft !== null && daysLeft <= 0)
    return (
      <Unavailable
        title="Esta entrega expiró"
        msg={`El material estuvo disponible hasta el ${formatBogotaDate(project.deliveryExpiresAt!, { day: "numeric", month: "long", year: "numeric" })}. Escríbele a tu productor para reactivarla.`}
      />
    );

  // Visita: contador + evento de actividad (nunca debe romper la sala).
  await Promise.all([
    db.project.update({ where: { id: project.id }, data: { deliveryVisits: { increment: 1 } } }),
    db.deliveryEvent.create({ data: { projectId: project.id, kind: "VISIT", label: null } }),
  ]).catch(() => {});

  // Campana al equipo (responsable + miembros): «el cliente ya está descargando». Con tope de
  // 6 h por proyecto para que una sesión de descargas no dispare una ráfaga de avisos.
  if (rateLimit(`delivery-visit:${project.id}`, 1, 6 * 3_600_000)) {
    void (async () => {
      const ids = await deliveryTeamIds(project.id);
      if (ids.length) {
        await notifyMany(ids, {
          type: "delivery",
          event: "delivery_visit",
          title: `El cliente abrió su entrega: ${project.name}`,
          body: "Entró a la sala de descargas del proyecto. La actividad queda en la pestaña Entrega.",
          link: `/proyectos/${project.id}?tab=entregables`,
          groupKey: `delivery-visit:${project.id}`,
          projectId: project.id,
        });
      }
    })().catch(() => {});
  }

  const pack = await getDeliveryPackage(project.id);
  const items = pack.items.filter((i) => !i.excluded);
  const countdown = deliveryCountdownLabel(daysLeft);
  const accentHex = project.client?.accentColor ? tone(project.client.accentColor).hex : null;
  const banner = project.bannerUrl ?? project.client?.bannerUrl ?? null;

  const byGroup = DELIVERY_GROUP_ORDER.map((g) => ({
    key: g,
    label: DELIVERY_GROUP_LABEL[g],
    items: items.filter((i) => i.group === g),
  })).filter((g) => g.items.length > 0);

  return (
    <Shell>
      {/* Branding del cliente: banda de portada del proyecto (si existe) con degradado al fondo. */}
      {banner ? (
        <div className="relative h-28 w-full overflow-hidden sm:h-36">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={banner} alt="" className="size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-[hsl(240_6%_7%)]" />
        </div>
      ) : null}

      <header className="sticky top-0 z-20 border-b border-white/10 bg-white/[0.04] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-6 py-3.5">
          <Logo className="h-6" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              Tu entrega · <EntityEmoji value={project.emoji} /> {project.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {project.client ? `${project.client.name} · ` : ""}
              {pack.includedCount} {pack.includedCount === 1 ? "archivo" : "archivos"}
              {pack.lastDeliveredAt ? ` · entregado el ${formatBogotaDate(pack.lastDeliveredAt, { day: "numeric", month: "long" })}` : ""}
            </p>
          </div>
          {project.client?.logoUrl ? (
            <span
              className="inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10"
              style={{ backgroundColor: project.client.logoBg ?? "transparent" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={project.client.logoUrl} alt={project.client.name} className="size-full object-contain" />
            </span>
          ) : null}
          {countdown ? (
            <span
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
                (daysLeft ?? 99) <= 7
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                  : "border-primary/40 bg-primary/10 text-primary"
              }`}
            >
              ⏳ Hasta el {formatBogotaDate(project.deliveryExpiresAt!, { day: "numeric", month: "short" })} · {countdown}
            </span>
          ) : null}
        </div>
        {accentHex ? <div aria-hidden className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${accentHex}, transparent 70%)` }} /> : null}
      </header>

      <main className="relative mx-auto max-w-5xl px-6 py-6">
        {items.length === 0 && pack.covers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            El equipo aún está preparando tu entrega. En cuanto haya material aprobado, aparecerá aquí listo para descargar.
          </div>
        ) : null}

        {byGroup.map((g) => (
          <section key={g.key} className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {g.label}
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">{g.items.length}</span>
            </h2>
            <div className={`grid gap-3 ${g.key === "fotos" ? "sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
              {g.items.map((i) => (
                <ItemCard key={i.id} item={i} token={token} />
              ))}
            </div>
          </section>
        ))}

        {pack.covers.length > 0 ? (
          <section className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Portadas aprobadas
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">{pack.covers.length}</span>
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {pack.covers.map((c) => (
                <a
                  key={c.id}
                  href={goHref(token, "cover", c.id)}
                  target="_blank"
                  rel="noreferrer"
                  title={`Descargar ${c.name}`}
                  className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.view} alt={c.name} loading="lazy" className="aspect-[9/16] w-full object-cover" />
                  <p className="truncate px-2 py-1.5 text-[11px] font-medium" title={c.name}>{c.name}</p>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4 text-xs text-muted-foreground">
          <span>¿Un archivo no descarga? Escríbenos y lo resolvemos.</span>
          <span>Entregado por Labstream ✦</span>
        </footer>
      </main>
    </Shell>
  );
}
