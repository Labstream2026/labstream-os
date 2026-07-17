"use client";

// Renderer de PRESENTACIÓN de la propuesta (tema "presentacion"). Experiencia inmersiva a pantalla
// completa: secciones oscuras a sangre, tipografía grande, acento de marca y aparición suave al
// desplazar. Es la alternativa al documento clásico (proposal-renderer.tsx) y se elige por
// brand.theme. Se usa en el portal público del cliente y en la vista previa del editor.
//
// La aparición al desplazar es CSS puro (animation-timeline: view()) tras @supports: los navegadores
// que no lo soportan MUESTRAN el contenido igual (nunca queda en blanco sin JS). Por eso el estado
// por defecto es visible y la animación solo se AÑADE donde el navegador la entiende.

import * as React from "react";
import type { Block, Brand } from "@/lib/proposals/types";
import { formatMoney } from "@/lib/ui";
import { clientTotals, type BudgetSection } from "@/lib/proposals/budget";
import { mesCal } from "@/lib/proposals/calendar";
import { sanitizeProposalHtml } from "@/lib/proposals/sanitize";
import { safeBgUrl, safeExternalUrl } from "@/lib/proposals/safe-url";

function str(v: unknown, d = ""): string {
  return typeof v === "string" ? v : v == null ? d : String(v);
}
function arr<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

// Paleta oscura fija de la presentación. El único color variable es el acento de la marca.
const BG_A = "#0d1017";
const BG_B = "#111624";
const CARD = "rgba(255,255,255,0.045)";
const CARD_BORDER = "rgba(255,255,255,0.09)";
const TXT = "#f4f6fa";
const TXT_BODY = "rgba(238,241,246,0.74)";
const TXT_MUTED = "rgba(238,241,246,0.5)";

// CSS de aparición al desplazar. Seguro: por defecto visible; la animación solo aplica donde el
// navegador soporta scroll-driven animations y el usuario no pidió menos movimiento.
const REVEAL_CSS = `
.pres-sec { opacity: 1; }
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .pres-anim .pres-sec {
      animation: pres-rise linear both;
      animation-timeline: view();
      animation-range: entry 2% cover 22%;
    }
  }
}
@keyframes pres-rise { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
`;

function Eyebrow({ n, children, accent }: { n?: number; children?: React.ReactNode; accent: string }) {
  if (!children && n == null) return null;
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: accent }}>
      {n != null ? <span>{String(n).padStart(2, "0")}</span> : null}
      {n != null && children ? <span style={{ color: TXT_MUTED }}> · </span> : null}
      {children}
    </p>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight sm:text-4xl" style={{ color: TXT }}>{children}</h2>;
}

function DarkVideo({ url, caption }: { url: string; caption?: string }) {
  const u = url.trim();
  let src = "";
  const yt = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  const vimeo = u.match(/vimeo\.com\/(\d+)/);
  if (yt) src = `https://www.youtube.com/embed/${yt[1]}`;
  else if (vimeo) src = `https://player.vimeo.com/video/${vimeo[1]}`;
  if (!u) return <div className="flex aspect-video w-full items-center justify-center rounded-xl text-sm" style={{ background: CARD, border: `1px solid ${CARD_BORDER}`, color: TXT_MUTED }}>Añade la URL del video</div>;
  if (src) return <div className="overflow-hidden rounded-xl bg-black" style={{ border: `1px solid ${CARD_BORDER}` }}><iframe src={src} title={caption || "Video"} allowFullScreen className="aspect-video w-full" /></div>;
  if (/\.(mp4|webm|mov)$/i.test(u)) return <video src={u} controls className="aspect-video w-full rounded-xl bg-black" style={{ border: `1px solid ${CARD_BORDER}` }} />;
  // Enlace de respaldo SOLO si la URL es http(s): así un `javascript:`/`data:` guardado no se vuelve
  // un enlace clicable (XSS almacenado) en el portal público.
  const safe = safeExternalUrl(u);
  return safe
    ? <a href={safe} target="_blank" rel="noreferrer" className="text-sm hover:underline" style={{ color: "#fff" }}>Ver video →</a>
    : <p className="text-sm" style={{ color: TXT_MUTED }}>Video no disponible</p>;
}

const cardStyle: React.CSSProperties = { background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: 14 };

// Contenido de un bloque, ya tematizado en oscuro. El hero se maneja aparte (es a sangre completa).
function PresContent({ block, brand, n }: { block: Block; brand: Brand; n: number }) {
  const accent = brand.accent || "#6366f1";
  switch (block.type) {
    case "text":
      return (
        <>
          <Eyebrow n={n} accent={accent} />
          <Title>{str(block.title)}</Title>
          <div
            className="mt-5 max-w-2xl text-base leading-relaxed sm:text-lg [&_a]:underline [&_strong]:font-semibold"
            style={{ color: TXT_BODY }}
            dangerouslySetInnerHTML={{ __html: sanitizeProposalHtml(str(block.body)) }}
          />
        </>
      );
    case "cards":
      return (
        <>
          <Eyebrow n={n} accent={accent} />
          <Title>{str(block.title)}</Title>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {arr<{ icon?: string; t?: string; d?: string }>(block.items).map((it, i) => (
              <div key={i} className="p-5" style={cardStyle}>
                <div className="text-2xl">{it.icon || "✦"}</div>
                <h3 className="mt-3 font-semibold" style={{ color: TXT }}>{it.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: TXT_BODY }}>{it.d}</p>
              </div>
            ))}
          </div>
        </>
      );
    case "stats":
      return (
        <>
          <Eyebrow n={n} accent={accent} />
          <Title>{str(block.title)}</Title>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {arr<{ n?: string; p?: string; f?: string }>(block.items).map((it, i) => (
              <div key={i} className="p-5" style={cardStyle}>
                <div className="text-3xl font-semibold sm:text-4xl" style={{ color: accent }}>{it.n}</div>
                <p className="mt-2 text-sm" style={{ color: TXT_BODY }}>{it.p}</p>
                {it.f ? <p className="mt-2 text-[11px] uppercase tracking-wide" style={{ color: TXT_MUTED }}>{it.f}</p> : null}
              </div>
            ))}
          </div>
        </>
      );
    case "timeline":
      return (
        <>
          <Eyebrow n={n} accent={accent} />
          <Title>{str(block.title)}</Title>
          <ol className="mt-6 space-y-5 border-l pl-6" style={{ borderColor: CARD_BORDER }}>
            {arr<{ phase?: string; dur?: string; desc?: string }>(block.steps).map((s, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.72rem] top-1.5 size-3 rounded-full" style={{ background: accent, boxShadow: `0 0 0 4px ${BG_A}` }} />
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-lg font-semibold" style={{ color: TXT }}>{s.phase}</h3>
                  {s.dur ? <span className="text-xs" style={{ color: TXT_MUTED }}>· {s.dur}</span> : null}
                </div>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: TXT_BODY }}>{s.desc}</p>
              </li>
            ))}
          </ol>
        </>
      );
    case "plan":
      return (
        <>
          <Eyebrow n={n} accent={accent} />
          <Title>{str(block.title)}</Title>
          {str(block.sub) ? <p className="mt-2 text-sm" style={{ color: TXT_MUTED }}>{str(block.sub)}</p> : null}
          <div className="mt-6 overflow-hidden" style={cardStyle}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>{arr<string>(block.cols).map((c, i) => (<th key={i} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: TXT_MUTED }}>{c}</th>))}</tr>
              </thead>
              <tbody>
                {arr<string[]>(block.rows).map((row, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${CARD_BORDER}` }}>
                    {arr<string>(row).map((cell, j) => (<td key={j} className="px-4 py-3" style={{ color: TXT_BODY }}>{cell}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    case "pricing": {
      const rows = arr<{ c?: string; d?: string; p?: string }>(block.rows);
      return (
        <>
          <Eyebrow n={n} accent={accent} />
          <Title>{str(block.title)}</Title>
          <div className="mt-6 overflow-hidden" style={cardStyle}>
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${CARD_BORDER}` }}>
                    <td className="px-4 py-3.5 font-medium" style={{ color: TXT }}>{r.c}</td>
                    <td className="px-4 py-3.5" style={{ color: TXT_MUTED }}>{r.d}</td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums" style={{ color: TXT }}>{r.p}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  <td className="px-4 py-3.5 font-semibold" style={{ color: TXT }} colSpan={2}>Total</td>
                  <td className="px-4 py-3.5 text-right text-lg font-bold tabular-nums" style={{ color: accent }}>{str(block.total, "A convenir")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {str(block.note) ? <p className="mt-3 text-xs" style={{ color: TXT_MUTED }}>{str(block.note)}</p> : null}
        </>
      );
    }
    case "budget": {
      const sections = arr<BudgetSection>(block.sections);
      const cur = str(block.cur, "COP");
      const iva = Number(block.iva) || 0;
      const discountPct = Number(block.discountPct) || 0;
      const explicitPrice = Number(block.price) || 0;
      const hasPrice = explicitPrice > 0;
      const { discount, subtotal, tax, total } = clientTotals({ price: explicitPrice, discountPct, iva });
      // arr(s?.items): una sección malformada (sin items o null) NO debe tumbar toda la presentación.
      const included = sections.flatMap((s) => arr<{ t?: string }>((s as { items?: unknown })?.items).map((it) => it?.t)).filter(Boolean);
      const showIncluded = block.showIncluded !== false && included.length > 0;
      return (
        <>
          <Eyebrow n={n} accent={accent} />
          <Title>{str(block.title)}</Title>
          {str(block.sub) ? <p className="mt-2 text-sm" style={{ color: TXT_MUTED }}>{str(block.sub)}</p> : null}
          {/* Cifra grande al centro: es el clímax de una propuesta económica. */}
          <div className="mt-6 text-center">
            <div className="text-4xl font-semibold tabular-nums sm:text-5xl" style={{ color: TXT }}>{hasPrice ? formatMoney(total, cur) : "Por definir"}</div>
            <p className="mt-2 text-xs uppercase tracking-wide" style={{ color: TXT_MUTED }}>IVA incluido</p>
          </div>
          {showIncluded ? (
            <div className="mx-auto mt-6 max-w-xl p-5" style={cardStyle}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: TXT_MUTED }}>Incluye</p>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {included.map((name, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: TXT_BODY }}>
                    <span className="mt-0.5 font-bold" style={{ color: accent }}>✓</span>
                    <span>{name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {hasPrice && (discountPct > 0 || iva > 0) ? (
            <div className="mx-auto mt-4 max-w-xl overflow-hidden" style={cardStyle}>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="px-4 py-2.5" style={{ color: TXT_MUTED }}>Precio</td><td className="px-4 py-2.5 text-right tabular-nums" style={{ color: TXT_BODY }}>{formatMoney(explicitPrice, cur)}</td></tr>
                  {discountPct > 0 ? (
                    <>
                      <tr style={{ borderTop: `1px solid ${CARD_BORDER}` }}><td className="px-4 py-2.5" style={{ color: TXT_MUTED }}>Descuento ({discountPct}%)</td><td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "#5dcaa5" }}>− {formatMoney(discount, cur)}</td></tr>
                      <tr style={{ borderTop: `1px solid ${CARD_BORDER}` }}><td className="px-4 py-2.5" style={{ color: TXT_MUTED }}>Subtotal</td><td className="px-4 py-2.5 text-right tabular-nums" style={{ color: TXT_BODY }}>{formatMoney(subtotal, cur)}</td></tr>
                    </>
                  ) : null}
                  <tr style={{ borderTop: `1px solid ${CARD_BORDER}` }}><td className="px-4 py-2.5" style={{ color: TXT_MUTED }}>IVA ({iva}%)</td><td className="px-4 py-2.5 text-right tabular-nums" style={{ color: TXT_BODY }}>{formatMoney(tax, cur)}</td></tr>
                </tbody>
              </table>
            </div>
          ) : null}
          {str(block.note) ? <p className="mt-3 text-center text-xs" style={{ color: TXT_MUTED }}>{str(block.note)}</p> : null}
        </>
      );
    }
    case "calendar": {
      const pais = str(block.pais, "Colombia");
      const mes = str(block.mes, "Enero");
      const cal = mesCal(pais, mes);
      return (
        <>
          <Eyebrow n={n} accent={accent} />
          <Title>{str(block.title)}</Title>
          <div className="mt-6 p-5" style={cardStyle}>
            <p className="text-sm" style={{ color: TXT_BODY }}><span className="font-semibold" style={{ color: TXT }}>{mes} · {pais}</span> — {cal.foco}</p>
            {cal.hitos.length ? (
              <ul className="mt-4 space-y-2.5">
                {cal.hitos.map((h, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="mt-0.5 inline-block w-24 shrink-0 text-xs font-medium" style={{ color: accent }}>{h.f}</span>
                    <span style={{ color: TXT_BODY }}><span className="font-medium" style={{ color: TXT }}>{h.t}.</span> {h.i}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      );
    }
    case "video":
      return (
        <>
          {str(block.caption) ? <Eyebrow accent={accent}>{str(block.caption)}</Eyebrow> : null}
          <div className="mt-4"><DarkVideo url={str(block.url)} caption={str(block.caption)} /></div>
        </>
      );
    case "fullvideo":
      return (
        <>
          <Eyebrow n={n} accent={accent} />
          <Title>{str(block.title)}</Title>
          <div className="mt-6"><DarkVideo url={str(block.url)} caption={str(block.title)} /></div>
        </>
      );
    case "carousel":
      return (
        <>
          <Eyebrow n={n} accent={accent} />
          <Title>{str(block.title)}</Title>
          {str(block.sub) ? <p className="mt-2 text-sm" style={{ color: TXT_MUTED }}>{str(block.sub)}</p> : null}
          <div className="mt-6 flex snap-x gap-4 overflow-x-auto pb-2">
            {arr<{ img?: string; t?: string; d?: string }>(block.items).map((it, i) => (
              <div key={i} className="w-72 shrink-0 snap-start overflow-hidden" style={cardStyle}>
                {it.img
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={it.img} alt={it.t || ""} className="aspect-video w-full object-cover" />
                  : <div className="flex aspect-video items-center justify-center text-xs" style={{ color: TXT_MUTED }}>Imagen</div>}
                <div className="p-4"><h3 className="text-sm font-semibold" style={{ color: TXT }}>{it.t}</h3><p className="mt-1 text-xs" style={{ color: TXT_BODY }}>{it.d}</p></div>
              </div>
            ))}
          </div>
        </>
      );
    case "acc":
      return (
        <>
          <Eyebrow n={n} accent={accent} />
          <Title>{str(block.title)}</Title>
          <div className="mt-6 overflow-hidden" style={cardStyle}>
            {arr<{ q?: string; a?: string }>(block.items).map((it, i) => (
              <details key={i} className="group p-4" style={{ borderTop: i ? `1px solid ${CARD_BORDER}` : undefined }}>
                <summary className="cursor-pointer list-none font-medium" style={{ color: TXT }}>{it.q}</summary>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: TXT_BODY }}>{it.a}</p>
              </details>
            ))}
          </div>
        </>
      );
    case "logos":
      return (
        <div className="text-center">
          <Eyebrow n={n} accent={accent} />
          <Title>{str(block.title)}</Title>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {arr<string>(block.items).map((name, i) => (
              <span key={i} className="px-4 py-2 text-sm font-medium" style={{ ...cardStyle, color: TXT_BODY }}>{name}</span>
            ))}
          </div>
        </div>
      );
    case "styles":
      return (
        <>
          <Eyebrow n={n} accent={accent} />
          <Title>{str(block.title)}</Title>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {arr<{ icon?: string; t?: string; d?: string; url?: string }>(block.items).map((it, i) => (
              <div key={i} className="p-5" style={cardStyle}>
                <div className="flex items-center gap-2"><span className="text-xl">{it.icon || "🎥"}</span><h3 className="font-semibold" style={{ color: TXT }}>{it.t}</h3></div>
                <p className="mt-1.5 text-sm" style={{ color: TXT_BODY }}>{it.d}</p>
                {it.url ? <div className="mt-3"><DarkVideo url={it.url} caption={it.t} /></div> : null}
              </div>
            ))}
          </div>
        </>
      );
    case "cta":
      return (
        <div className="text-center">
          <Title>{str(block.title, "Trabajemos juntos")}</Title>
          {str(block.sub) ? <p className="mx-auto mt-3 max-w-md text-base" style={{ color: TXT_BODY }}>{str(block.sub)}</p> : null}
          <a
            href={`mailto:${str(block.email, brand.email)}`}
            className="mt-7 inline-flex items-center justify-center rounded-lg px-7 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: accent }}
          >
            {str(block.btn, "Contactar")}
          </a>
          <p className="mt-4 text-xs" style={{ color: TXT_MUTED }}>{brand.email} · {brand.whatsapp}</p>
        </div>
      );
    default:
      return null;
  }
}

// Hero a sangre completa: foto de fondo con degradado, o degradado del acento.
function PresHero({ block, brand, full }: { block: Block; brand: Brand; full: boolean }) {
  const accent = brand.accent || "#6366f1";
  // Se valida antes de meterla en el url() del CSS: una cadena con comillas/paréntesis podría
  // inyectar declaraciones CSS extra en el elemento (overlay/beacon). safeBgUrl la descarta.
  const bg = safeBgUrl(str(block.bg));
  const style: React.CSSProperties = bg
    ? { backgroundImage: `linear-gradient(180deg, rgba(8,10,15,0.55), rgba(8,10,15,0.86)), url("${bg}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: `radial-gradient(120% 120% at 50% 0%, ${accent}33, ${BG_A} 60%)` };
  return (
    <section className={`pres-sec relative flex flex-col items-center justify-center px-6 py-24 text-center ${full ? "min-h-screen" : "min-h-[70vh] py-20"}`} style={style}>
      <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: accent }}>{brand.company}</p>
      <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl" style={{ color: "#fff" }}>{str(block.title, "Propuesta")}</h1>
      {str(block.subtitle) ? <p className="mx-auto mt-5 max-w-xl text-lg" style={{ color: "rgba(255,255,255,0.82)" }}>{str(block.subtitle)}</p> : null}
      {full ? (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
          desliza ↓
        </div>
      ) : null}
    </section>
  );
}

// Tipos de bloque con contenido renderizable (aparte del hero). Un tipo fuera de este conjunto
// (JSON viejo/renombrado) NO se dibuja: sin esto se colaría una sección oscura vacía a pantalla
// completa y además desajustaría la numeración de las secciones.
const CONTENT_TYPES = new Set([
  "text", "cards", "stats", "timeline", "plan", "pricing", "budget", "calendar",
  "video", "fullvideo", "carousel", "acc", "logos", "styles", "cta",
]);

export function ProposalPresentation({ blocks, brand, variant = "full" }: { blocks: Block[]; brand: Brand; variant?: "full" | "preview" }) {
  const full = variant === "full";
  // Numeración de las secciones de CONTENIDO (la portada y los tipos desconocidos no cuentan),
  // precalculada antes del render para no mutar variables durante la construcción del árbol (lo
  // prohíbe el compilador de React).
  const nums: number[] = [];
  let count = 0;
  for (const b of blocks) {
    if (b.type !== "hero" && CONTENT_TYPES.has(b.type)) { count += 1; nums.push(count); }
    else nums.push(0);
  }
  return (
    <div className={full ? "pres-anim" : ""} style={{ background: BG_A }}>
      <style>{REVEAL_CSS}</style>
      {blocks.map((b, i) => {
        if (b.type === "hero") return <PresHero key={i} block={b} brand={brand} full={full} />;
        // Tipo desconocido: no emite sección (evita el panel vacío a pantalla completa).
        if (!CONTENT_TYPES.has(b.type)) return null;
        const n = nums[i];
        return (
          <section
            key={i}
            className={`pres-sec flex flex-col justify-center px-6 sm:px-10 ${full ? "min-h-screen py-24" : "py-16"}`}
            style={{ background: n % 2 === 0 ? BG_B : BG_A }}
          >
            <div className="mx-auto w-full max-w-3xl">
              <PresContent block={b} brand={brand} n={n} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
