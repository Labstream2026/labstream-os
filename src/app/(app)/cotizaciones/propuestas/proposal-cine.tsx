"use client";

import * as React from "react";
import { CINE_PALETTE, logoItems, type Block, type Brand } from "@/lib/proposals/types";
import { clientTotals } from "@/lib/proposals/budget";
import { formatMoney } from "@/lib/ui";

// ── Tema «Cine» ──
// El deck editorial de Labstream: diapositivas a pantalla completa que alternan verde-noche y
// crema, serif de despliegue, kickers en versalitas espaciadas, videos de fondo, índice lateral
// con puntos y contadores que suben al entrar. Consume los MISMOS bloques que los otros dos
// temas (documento y presentación): lo único que cambia es el envoltorio.
//
// Cada bloque puede traer `tone` ("dark"/"light"), `bgVideo` y `bg` — si no los trae, el tono
// alterna solo y el fondo es el color plano. Así una propuesta vieja se ve bien sin tocarla.

type Props = {
  blocks: Block[];
  brand: Brand;
  // "full" = experiencia completa (teclado, índice, alto de pantalla). "preview" = dentro del
  // editor: mismo diseño, alto acotado y sin secuestrar el teclado de la página.
  variant?: "full" | "preview";
  // Pie de la última diapositiva (aceptar propuesta, avisos de vencida…). Lo pone la página.
  footer?: React.ReactNode;
};

const str = (v: unknown, fb = "") => (typeof v === "string" ? v : fb);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

// Nombre de cada diapositiva para el índice lateral: el kicker si lo hay, si no el título.
function slideName(b: Block, i: number): string {
  const k = str(b.kicker).trim();
  if (k) return k.length > 22 ? k.slice(0, 21) + "…" : k;
  const t = str(b.title).trim();
  if (t) return t.length > 22 ? t.slice(0, 21) + "…" : t;
  return `Sección ${i + 1}`;
}

export function ProposalCine({ blocks, brand, variant = "full", footer }: Props) {
  const pal = { ...CINE_PALETTE, ...(brand.cine ?? {}) };
  const full = variant === "full";
  const [active, setActive] = React.useState(0);
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const slideRefs = React.useRef<(HTMLElement | null)[]>([]);

  // Tono por diapositiva: el del bloque si lo trae; si no, alterna arrancando en oscuro (el
  // patrón del deck original: portada y cierre oscuros, el cuerpo alternando).
  const tones = React.useMemo(
    () => blocks.map((b, i) => (b.tone === "light" || b.tone === "dark" ? (b.tone as string) : i % 2 === 0 ? "dark" : "light")),
    [blocks],
  );

  // Diapositiva activa: se calcula observando cuál ocupa el centro del contenedor. Sin esto el
  // índice lateral y el color de los puntos no seguirían al desplazamiento.
  React.useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!vis) return;
        const idx = slideRefs.current.indexOf(vis.target as HTMLElement);
        if (idx >= 0) setActive(idx);
      },
      { root, threshold: [0.45, 0.75] },
    );
    slideRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [blocks.length]);

  // Salta a una diapositiva. Dos decisiones aprendidas probándolo en el navegador:
  //  1. Se desplaza el CONTENEDOR, no la página: `scrollIntoView` movía la página que envuelve
  //     la vista previa del editor y el deck se quedaba clavado en la primera diapositiva.
  //     El contenedor es `relative`, así que el offsetTop de cada sección ya es relativo a él.
  //  2. Salto INSTANTÁNEO: con `scroll-snap-type: y mandatory` el navegador ignora por completo
  //     el desplazamiento suave (verificado: con "smooth" el scrollTop no se movía ni un píxel;
  //     con salto directo va exacto). Preferimos que el índice SIEMPRE funcione.
  const go = React.useCallback((i: number) => {
    const root = scroller.current;
    const el = slideRefs.current[i];
    if (!root || !el) return;
    root.scrollTo({ top: el.offsetTop, behavior: "instant" as ScrollBehavior });
  }, []);

  // Teclado (solo en la experiencia completa): flechas y espacio para pasar diapositiva.
  React.useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(Math.min(active + 1, blocks.length - 1)); }
      else if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); go(Math.max(active - 1, 0)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, active, blocks.length, go]);

  return (
    <div
      ref={scroller}
      className={
        full
          ? "relative h-[calc(100dvh-var(--pwa-nav-h,0px))] snap-y snap-mandatory overflow-y-auto overflow-x-hidden"
          : "relative h-[70vh] min-h-[26rem] snap-y snap-mandatory overflow-y-auto overflow-x-hidden rounded-xl border border-border"
      }
      style={{ background: pal.ink, scrollbarWidth: "none" }}
    >
      {/* Marca y sello de confidencial, fijos sobre las diapositivas */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-6 py-4 sm:px-10">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.2em] transition-colors"
          style={{ color: tones[active] === "light" ? "rgba(14,21,18,.5)" : "rgba(237,239,234,.6)" }}
        >
          {brand.company}
        </span>
        <span
          className="text-[9px] font-semibold uppercase tracking-[0.2em] transition-colors"
          style={{ color: tones[active] === "light" ? "rgba(14,21,18,.38)" : "rgba(237,239,234,.42)" }}
        >
          Propuesta confidencial
        </span>
      </div>

      {/* Índice lateral: un punto por diapositiva, con su nombre al pasar el mouse */}
      <nav className="absolute right-3 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-2 sm:flex" aria-label="Índice de la propuesta">
        {blocks.map((b, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            title={slideName(b, i)}
            aria-label={slideName(b, i)}
            aria-current={i === active ? "true" : undefined}
            className="size-2 rounded-full transition-all"
            style={{
              background: i === active ? pal.gold : tones[active] === "light" ? "rgba(14,21,18,.22)" : "rgba(237,239,234,.28)",
              transform: i === active ? "scale(1.5)" : "none",
            }}
          />
        ))}
      </nav>

      {blocks.map((b, i) => (
        <section
          key={i}
          ref={(el) => { slideRefs.current[i] = el; }}
          className={`relative flex snap-start flex-col justify-center overflow-hidden px-6 py-16 sm:px-14 ${full ? "min-h-[calc(100dvh-var(--pwa-nav-h,0px))]" : "min-h-[70vh]"}`}
          style={{
            background: tones[i] === "light" ? pal.cream : pal.ink,
            color: tones[i] === "light" ? pal.ink : "#EDEFEA",
          }}
        >
          <SlideBackground block={b} ink={pal.ink} />
          <div className="relative z-10 mx-auto w-full max-w-5xl">
            <SlideBody block={b} pal={pal} tone={tones[i]} brand={brand} active={i === active} />
          </div>
        </section>
      ))}

      {footer ? (
        <section
          className={`relative flex snap-start flex-col justify-center px-6 py-16 sm:px-14 ${full ? "min-h-[60dvh]" : "min-h-[40vh]"}`}
          style={{ background: pal.ink, color: "#EDEFEA" }}
        >
          <div className="mx-auto w-full max-w-xl">{footer}</div>
        </section>
      ) : null}
    </div>
  );
}

// ── Fondo de la diapositiva: video (silenciado, en bucle) o imagen, con velo para que el
// texto se lea. El video lleva `playsInline` y `muted` porque sin eso iOS ni siquiera arranca.
function SlideBackground({ block, ink }: { block: Block; ink: string }) {
  const video = str(block.bgVideo);
  const img = str(block.bg);
  if (!video && !img) return null;
  return (
    <div className="absolute inset-0 overflow-hidden">
      {video ? (
        <video
          src={video}
          poster={img || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* Velo: oscuro a la izquierda (donde vive el texto) y degradado hacia arriba. */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(90deg, ${ink}dd 0%, ${ink}73 55%, ${ink}33 100%)` }}
      />
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to top, ${ink}c4, transparent 55%)` }}
      />
    </div>
  );
}

// ── Piezas tipográficas compartidas ──
const SERIF = 'var(--font-playfair, "Playfair Display", Georgia, "Times New Roman", serif)';

function Kicker({ text, color }: { text: string; color: string }) {
  if (!text) return null;
  return <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color }}>{text}</p>;
}

function Title({ children, big }: { children: React.ReactNode; big?: boolean }) {
  return (
    <h2
      className={big ? "text-4xl leading-[1.03] sm:text-6xl" : "text-2xl leading-[1.1] sm:text-4xl"}
      style={{ fontFamily: SERIF, fontWeight: 400, textWrap: "balance" }}
    >
      {children}
    </h2>
  );
}

function Lede({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <p className="mt-3 max-w-2xl text-sm leading-relaxed sm:text-base" style={{ color: tone === "light" ? "rgba(14,21,18,.66)" : "rgba(237,239,234,.72)" }}>
      {children}
    </p>
  );
}

// Contador que sube al entrar la diapositiva (los «1 día de rodaje · 2 min · 4 rondas»).
function CountUp({ value, active }: { value: string; active: boolean }) {
  const target = Number((value.match(/\d+/) ?? ["0"])[0]);
  const prefix = value.slice(0, value.indexOf(String(target)));
  const suffix = value.slice(value.indexOf(String(target)) + String(target).length);
  const [n, setN] = React.useState(0);
  const done = React.useRef(false);
  React.useEffect(() => {
    if (!active || done.current || !Number.isFinite(target) || target <= 0) return;
    done.current = true;
    let v = 0;
    const step = Math.max(1, Math.round(target / 16));
    const id = setInterval(() => {
      v += step;
      if (v >= target) { v = target; clearInterval(id); }
      setN(v);
    }, 45);
    return () => clearInterval(id);
  }, [active, target]);
  if (!Number.isFinite(target) || target <= 0) return <>{value}</>;
  return <>{prefix}{active ? n : 0}{suffix}</>;
}

// ── Cuerpo de la diapositiva según el tipo de bloque ──
function SlideBody({
  block,
  pal,
  tone,
  brand,
  active,
}: {
  block: Block;
  pal: { ink: string; cream: string; gold: string };
  tone: string;
  brand: Brand;
  active: boolean;
}) {
  const gold = tone === "light" ? shade(pal.gold, -0.35) : pal.gold;
  const soft = tone === "light" ? "rgba(14,21,18,.12)" : "rgba(237,239,234,.14)";
  const dim = tone === "light" ? "rgba(14,21,18,.6)" : "rgba(237,239,234,.66)";
  const kicker = str(block.kicker);
  const title = str(block.title);

  switch (block.type) {
    case "hero":
      return (
        <>
          <Kicker text={kicker || brand.tagline} color={gold} />
          <Title big>{title || brand.company}</Title>
          {str(block.subtitle) ? (
            <p className="mt-2 text-lg italic sm:text-2xl" style={{ fontFamily: SERIF, color: gold }}>{str(block.subtitle)}</p>
          ) : null}
          {str(block.intro) ? <Lede tone={tone}>{str(block.intro)}</Lede> : null}
          {arr(block.meta).length > 0 ? (
            <div className="mt-7 flex flex-wrap gap-x-8 gap-y-2 text-xs sm:text-sm">
              {arr(block.meta).map((m, i) => (
                <span key={i} style={{ color: dim }}>
                  {str(m.k)} · <b style={{ color: tone === "light" ? pal.ink : "#EDEFEA" }}>{str(m.v)}</b>
                </span>
              ))}
            </div>
          ) : null}
        </>
      );

    case "text":
      return (
        <>
          <Kicker text={kicker} color={gold} />
          <Title>{title}</Title>
          {str(block.body) ? (
            <div
              className="mt-4 max-w-3xl text-sm leading-relaxed sm:text-base [&_strong]:font-semibold"
              style={{ color: dim }}
              dangerouslySetInnerHTML={{ __html: str(block.body) }}
            />
          ) : null}
        </>
      );

    case "cards":
    case "styles":
      return (
        <>
          <Kicker text={kicker} color={gold} />
          <Title>{title}</Title>
          {str(block.sub) ? <Lede tone={tone}>{str(block.sub)}</Lede> : null}
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {arr(block.items).map((it, i) => (
              <div key={i} className="rounded-xl border p-4" style={{ borderColor: soft, background: tone === "light" ? "rgba(14,21,18,.03)" : "rgba(237,239,234,.03)" }}>
                <span className="text-lg" style={{ color: gold }}>{str(it.icon) || String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-1.5 text-sm font-semibold">{str(it.t)}</h3>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: dim }}>{str(it.d)}</p>
              </div>
            ))}
          </div>
        </>
      );

    case "checks":
      return (
        <>
          <Kicker text={kicker} color={gold} />
          <Title>{title}</Title>
          <div className="mt-7 grid gap-x-10 gap-y-2.5 sm:grid-cols-2">
            {strArr(block.items).map((t, i) => (
              <p key={i} className="flex gap-3 text-sm leading-relaxed">
                <span style={{ color: gold }}>✓</span>
                <span style={{ color: dim }}>{t}</span>
              </p>
            ))}
          </div>
        </>
      );

    case "logos":
      return (
        <>
          <Kicker text={kicker} color={gold} />
          <Title>{title}</Title>
          {str(block.sub) ? <Lede tone={tone}>{str(block.sub)}</Lede> : null}
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {logoItems(block.items).map((it, i) => (
              <div key={i} className="flex h-16 items-center justify-center rounded-lg border px-3" style={{ borderColor: soft }}>
                {it.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.logo} alt={it.name} className="max-h-9 max-w-full object-contain" />
                ) : (
                  <span className="text-center text-[11px] uppercase tracking-[0.14em]" style={{ color: dim }}>{it.name}</span>
                )}
              </div>
            ))}
          </div>
        </>
      );

    case "stats":
      return (
        <>
          <Kicker text={kicker} color={gold} />
          <Title>{title}</Title>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {arr(block.items).map((it, i) => (
              <div key={i} className="rounded-xl border p-5 text-center" style={{ borderColor: soft }}>
                <span className="block text-3xl sm:text-5xl" style={{ fontFamily: SERIF, color: gold }}>
                  <CountUp value={str(it.n)} active={active} />
                </span>
                <span className="mt-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: dim }}>{str(it.p)}</span>
                {str(it.f) ? <span className="mt-1 block text-[10px]" style={{ color: dim, opacity: 0.7 }}>{str(it.f)}</span> : null}
              </div>
            ))}
          </div>
        </>
      );

    case "timeline":
      return (
        <>
          <Kicker text={kicker} color={gold} />
          <Title>{title}</Title>
          <div className="mt-7 grid gap-3">
            {arr(block.steps).map((s, i) => (
              <div key={i} className="grid grid-cols-[6rem_1fr] items-baseline gap-4 border-b pb-3" style={{ borderColor: soft }}>
                <span className="text-base sm:text-lg" style={{ fontFamily: SERIF, color: gold }}>{str(s.dur) || String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="text-sm font-semibold">{str(s.phase)}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: dim }}>{str(s.desc)}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      );

    case "acc":
      return (
        <>
          <Kicker text={kicker} color={gold} />
          <Title>{title}</Title>
          <div className="mt-6 grid gap-2">
            {arr(block.items).map((it, i) => (
              <details key={i} className="rounded-lg border p-3" style={{ borderColor: soft }}>
                <summary className="cursor-pointer text-sm font-medium">{str(it.q)}</summary>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: dim }}>{str(it.a)}</p>
              </details>
            ))}
          </div>
        </>
      );

    case "pricing":
      return (
        <>
          <Kicker text={kicker || "Inversión"} color={gold} />
          <Title>{title}</Title>
          <div className="mt-6 grid gap-1.5">
            {arr(block.rows).map((r, i) => (
              <div key={i} className="flex items-baseline justify-between gap-6 border-b py-2" style={{ borderColor: soft }}>
                <div>
                  <span className="text-base" style={{ fontFamily: SERIF }}>{str(r.c)}</span>
                  {str(r.d) ? <p className="text-xs" style={{ color: dim }}>{str(r.d)}</p> : null}
                </div>
                <span className="shrink-0 text-sm tabular-nums">{str(r.p)}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-right text-3xl sm:text-4xl" style={{ fontFamily: SERIF, color: gold }}>{str(block.total)}</p>
          {str(block.note) ? <p className="mt-2 text-right text-[11px]" style={{ color: dim }}>{str(block.note)}</p> : null}
        </>
      );

    case "budget": {
      const cur = str(block.cur, "COP");
      const t = clientTotals({
        price: Number(block.price) || 0,
        discountPct: Number(block.discountPct) || 0,
        iva: Number(block.iva) || 0,
      });
      const included = block.showIncluded !== false;
      return (
        <>
          <Kicker text={kicker || "Inversión"} color={gold} />
          <Title>{title || "Cotización."}</Title>
          {str(block.sub) ? <Lede tone={tone}>{str(block.sub)}</Lede> : null}
          {included ? (
            <div className="mt-6 grid gap-1.5">
              {arr(block.sections).map((sec, i) => (
                <div key={i} className="border-b py-2" style={{ borderColor: soft }}>
                  <span className="text-base" style={{ fontFamily: SERIF }}>{str(sec.s)}</span>
                  <p className="mt-0.5 text-xs leading-relaxed" style={{ color: dim }}>
                    {arr(sec.items).map((it) => str(it.t)).filter(Boolean).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-6 grid justify-items-end gap-0.5 text-sm" style={{ color: dim }}>
            <span>Precio antes de IVA · {formatMoney(t.subtotal, cur)}</span>
            {t.discount > 0 ? <span>Descuento · −{formatMoney(t.discount, cur)}</span> : null}
            <span>IVA · {formatMoney(t.tax, cur)}</span>
            <span className="mt-1 text-3xl sm:text-4xl" style={{ fontFamily: SERIF, color: gold }}>{formatMoney(t.total, cur)}</span>
          </div>
          {str(block.note) ? <p className="mt-3 text-right text-[11px]" style={{ color: dim }}>{str(block.note)}</p> : null}
        </>
      );
    }

    case "fullvideo":
    case "video": {
      const url = str(block.url);
      return (
        <>
          <Kicker text={kicker} color={gold} />
          {title ? <Title>{title}</Title> : null}
          {url ? (
            <div className="mt-6 flex justify-center">
              {/^https?:\/\//.test(url) && !/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ? (
                <iframe src={url} className="aspect-video w-full max-w-3xl rounded-xl border-0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={title || "Video"} />
              ) : (
                <video src={url} controls playsInline className="max-h-[60vh] w-auto max-w-full rounded-xl" />
              )}
            </div>
          ) : null}
          {str(block.caption) ? <p className="mt-3 text-center text-xs" style={{ color: dim }}>{str(block.caption)}</p> : null}
        </>
      );
    }

    case "cta":
      return (
        <>
          <Kicker text={kicker || "Estamos listos"} color={gold} />
          <Title>{title}</Title>
          {str(block.sub) ? <Lede tone={tone}>{str(block.sub)}</Lede> : null}
          <div className="mt-7 flex flex-wrap gap-2">
            <a
              href={`mailto:${str(block.email) || brand.email}`}
              className="rounded-full px-5 py-2 text-sm font-semibold"
              style={{ background: pal.gold, color: pal.ink }}
            >
              {str(block.btn) || "Contactar"}
            </a>
            {brand.whatsapp ? (
              <a href={`https://wa.me/${brand.whatsapp.replace(/\D/g, "")}`} className="rounded-full border px-5 py-2 text-sm" style={{ borderColor: soft }}>
                WhatsApp
              </a>
            ) : null}
          </div>
        </>
      );

    default:
      // Bloques que aún no tienen forma propia en este tema (plan, calendario, carrusel):
      // se muestran con su título y su contenido en crudo antes que desaparecer.
      return (
        <>
          <Kicker text={kicker} color={gold} />
          <Title>{title}</Title>
          {str(block.sub) ? <Lede tone={tone}>{str(block.sub)}</Lede> : null}
        </>
      );
  }
}

// Aclara u oscurece un HEX (para que el dorado siga legible sobre el fondo crema).
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.max(0, Math.min(255, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)))),
  );
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
