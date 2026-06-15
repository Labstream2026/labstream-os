// Renderer del documento de propuesta. Componente PURO (sin hooks ni imports de
// servidor): se usa tanto en la vista previa del editor (cliente) como en la
// vista pública del cliente (servidor). El color de acento viene de brand.accent.

import * as React from "react";
import type { Block, Brand } from "@/lib/proposals/types";
import { formatMoney } from "@/lib/ui";
import { budgetTotals, sectionSubtotal, type BudgetSection } from "@/lib/proposals/budget";
import { mesCal } from "@/lib/proposals/calendar";

function str(v: unknown, d = ""): string {
  return typeof v === "string" ? v : v == null ? d : String(v);
}
function arr<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

// Convierte una URL de YouTube/Vimeo/MP4 en un embed; si no, deja un enlace.
function VideoEmbed({ url, caption }: { url: string; caption?: string }) {
  const u = url.trim();
  let src = "";
  const yt = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  const vimeo = u.match(/vimeo\.com\/(\d+)/);
  if (yt) src = `https://www.youtube.com/embed/${yt[1]}`;
  else if (vimeo) src = `https://player.vimeo.com/video/${vimeo[1]}`;
  if (!u) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-sm text-muted-foreground">
        Añade la URL del video
      </div>
    );
  }
  if (src) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-black">
        <iframe src={src} title={caption || "Video"} allowFullScreen className="aspect-video w-full" />
      </div>
    );
  }
  if (/\.(mp4|webm|mov)$/i.test(u)) {
    return <video src={u} controls className="aspect-video w-full rounded-xl border border-border bg-black" />;
  }
  return (
    <a href={u} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
      Ver video →
    </a>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{children}</h2>;
}

function BlockView({ block, brand }: { block: Block; brand: Brand }) {
  const accent = brand.accent || "#6366f1";
  switch (block.type) {
    case "hero":
      return (
        <header
          className="overflow-hidden rounded-2xl px-6 py-14 text-center text-white sm:px-12 sm:py-20"
          style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc 55%, #0f172a)` }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">{brand.company}</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-3xl font-bold leading-tight sm:text-5xl">{str(block.title, "Propuesta")}</h1>
          {str(block.subtitle) ? <p className="mx-auto mt-4 max-w-xl text-base text-white/85 sm:text-lg">{str(block.subtitle)}</p> : null}
        </header>
      );
    case "text":
      return (
        <section className="space-y-3">
          {str(block.title) ? <SectionTitle>{str(block.title)}</SectionTitle> : null}
          <div
            className="prose-proposal max-w-none leading-relaxed text-muted-foreground [&_strong]:text-foreground"
            dangerouslySetInnerHTML={{ __html: str(block.body) }}
          />
        </section>
      );
    case "cards":
      return (
        <section className="space-y-4">
          {str(block.title) ? <SectionTitle>{str(block.title)}</SectionTitle> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {arr<{ icon?: string; t?: string; d?: string }>(block.items).map((it, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-2xl">{it.icon || "✦"}</div>
                <h3 className="mt-2 font-semibold">{it.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{it.d}</p>
              </div>
            ))}
          </div>
        </section>
      );
    case "stats":
      return (
        <section className="space-y-4">
          {str(block.title) ? <SectionTitle>{str(block.title)}</SectionTitle> : null}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {arr<{ n?: string; p?: string; f?: string }>(block.items).map((it, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-3xl font-bold" style={{ color: accent }}>{it.n}</div>
                <p className="mt-1 text-sm text-muted-foreground">{it.p}</p>
                {it.f ? <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground/70">{it.f}</p> : null}
              </div>
            ))}
          </div>
        </section>
      );
    case "cta":
      return (
        <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <SectionTitle>{str(block.title, "Trabajemos juntos")}</SectionTitle>
          {str(block.sub) ? <p className="mx-auto mt-2 max-w-md text-muted-foreground">{str(block.sub)}</p> : null}
          <a
            href={`mailto:${str(block.email, brand.email)}`}
            className="mt-5 inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ background: accent }}
          >
            {str(block.btn, "Contactar")}
          </a>
          <p className="mt-3 text-xs text-muted-foreground">{brand.email} · {brand.whatsapp}</p>
        </section>
      );
    case "timeline":
      return (
        <section className="space-y-4">
          {str(block.title) ? <SectionTitle>{str(block.title)}</SectionTitle> : null}
          <ol className="relative space-y-4 border-l border-border pl-6">
            {arr<{ phase?: string; dur?: string; desc?: string }>(block.steps).map((s, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.65rem] top-1 size-3 rounded-full ring-4 ring-background" style={{ background: accent }} />
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="font-semibold">{s.phase}</h3>
                  {s.dur ? <span className="text-xs text-muted-foreground">· {s.dur}</span> : null}
                </div>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>
      );
    case "plan":
      return (
        <section className="space-y-4">
          {str(block.title) ? <SectionTitle>{str(block.title)}</SectionTitle> : null}
          {str(block.sub) ? <p className="text-sm text-muted-foreground">{str(block.sub)}</p> : null}
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <tr>{arr<string>(block.cols).map((c, i) => (<th key={i} className="px-4 py-2.5">{c}</th>))}</tr>
              </thead>
              <tbody>
                {arr<string[]>(block.rows).map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    {arr<string>(row).map((cell, j) => (<td key={j} className="px-4 py-2.5">{cell}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );
    case "pricing": {
      const rows = arr<{ c?: string; d?: string; p?: string }>(block.rows);
      return (
        <section className="space-y-4">
          {str(block.title) ? <SectionTitle>{str(block.title)}</SectionTitle> : null}
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{r.c}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.d}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{r.p}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40">
                  <td className="px-4 py-3 font-semibold" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: accent }}>{str(block.total, "A convenir")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {str(block.note) ? <p className="text-xs text-muted-foreground">{str(block.note)}</p> : null}
        </section>
      );
    }
    case "budget": {
      const sections = arr<BudgetSection>(block.sections);
      const cur = str(block.cur, "COP");
      const iva = Number(block.iva) || 0;
      const { subtotal, tax, total } = budgetTotals(sections, iva);
      return (
        <section className="space-y-4">
          {str(block.title) ? <SectionTitle>{str(block.title)}</SectionTitle> : null}
          {str(block.sub) ? <p className="text-sm text-muted-foreground">{str(block.sub)}</p> : null}
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <tbody>
                {sections.map((sec, si) => (
                  <React.Fragment key={si}>
                    <tr className="bg-muted/40">
                      <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" colSpan={3}>{sec.s}</td>
                      <td className="px-4 py-2 text-right text-xs font-medium text-muted-foreground tabular-nums">{formatMoney(sectionSubtotal(sec), cur)}</td>
                    </tr>
                    {sec.items.map((it, ii) => (
                      <tr key={ii} className="border-t border-border">
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{it.t}</div>
                          {it.d ? <div className="text-xs text-muted-foreground">{it.d}</div> : null}
                        </td>
                        <td className="px-2 py-2.5 text-right text-muted-foreground tabular-nums">{it.q} {it.u}</td>
                        <td className="px-2 py-2.5 text-right text-muted-foreground tabular-nums">{formatMoney(it.v, cur)}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatMoney((Number(it.q) || 0) * (Number(it.v) || 0), cur)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border">
                <tr><td className="px-4 py-1.5 text-right text-muted-foreground" colSpan={3}>Subtotal</td><td className="px-4 py-1.5 text-right tabular-nums">{formatMoney(subtotal, cur)}</td></tr>
                <tr><td className="px-4 py-1.5 text-right text-muted-foreground" colSpan={3}>IVA ({iva}%)</td><td className="px-4 py-1.5 text-right tabular-nums">{formatMoney(tax, cur)}</td></tr>
                <tr><td className="px-4 py-2.5 text-right font-bold" colSpan={3}>Total</td><td className="px-4 py-2.5 text-right text-base font-bold tabular-nums" style={{ color: accent }}>{formatMoney(total, cur)}</td></tr>
              </tfoot>
            </table>
          </div>
          {str(block.note) ? <p className="text-xs text-muted-foreground">{str(block.note)}</p> : null}
        </section>
      );
    }
    case "calendar": {
      const pais = str(block.pais, "Colombia");
      const mes = str(block.mes, "Enero");
      const cal = mesCal(pais, mes);
      return (
        <section className="space-y-4">
          {str(block.title) ? <SectionTitle>{str(block.title)}</SectionTitle> : null}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm"><span className="font-semibold">{mes} · {pais}</span> — {cal.foco}</p>
            {cal.hitos.length ? (
              <ul className="mt-3 space-y-2">
                {cal.hitos.map((h, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="mt-0.5 inline-block w-24 shrink-0 text-xs font-medium" style={{ color: accent }}>{h.f}</span>
                    <span><span className="font-medium">{h.t}.</span> <span className="text-muted-foreground">{h.i}</span></span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      );
    }
    case "video":
      return (
        <section className="space-y-2">
          <VideoEmbed url={str(block.url)} caption={str(block.caption)} />
          {str(block.caption) ? <p className="text-center text-sm text-muted-foreground">{str(block.caption)}</p> : null}
        </section>
      );
    case "fullvideo":
      return (
        <section className="space-y-3">
          {str(block.title) ? <SectionTitle>{str(block.title)}</SectionTitle> : null}
          <VideoEmbed url={str(block.url)} caption={str(block.title)} />
        </section>
      );
    case "carousel":
      return (
        <section className="space-y-4">
          {str(block.title) ? <SectionTitle>{str(block.title)}</SectionTitle> : null}
          {str(block.sub) ? <p className="text-sm text-muted-foreground">{str(block.sub)}</p> : null}
          <div className="flex snap-x gap-4 overflow-x-auto pb-2">
            {arr<{ img?: string; t?: string; d?: string }>(block.items).map((it, i) => (
              <div key={i} className="w-64 shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                {it.img ? <img src={it.img} alt={it.t || ""} className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-muted/40 text-xs text-muted-foreground">Imagen</div>}
                <div className="p-3"><h3 className="text-sm font-semibold">{it.t}</h3><p className="text-xs text-muted-foreground">{it.d}</p></div>
              </div>
            ))}
          </div>
        </section>
      );
    case "acc":
      return (
        <section className="space-y-3">
          {str(block.title) ? <SectionTitle>{str(block.title)}</SectionTitle> : null}
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {arr<{ q?: string; a?: string }>(block.items).map((it, i) => (
              <details key={i} className="group p-4">
                <summary className="cursor-pointer list-none font-medium">{it.q}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{it.a}</p>
              </details>
            ))}
          </div>
        </section>
      );
    case "logos":
      return (
        <section className="space-y-4 text-center">
          {str(block.title) ? <SectionTitle>{str(block.title)}</SectionTitle> : null}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {arr<string>(block.items).map((name, i) => (
              <span key={i} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm">{name}</span>
            ))}
          </div>
        </section>
      );
    case "styles":
      return (
        <section className="space-y-4">
          {str(block.title) ? <SectionTitle>{str(block.title)}</SectionTitle> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {arr<{ icon?: string; t?: string; d?: string; url?: string }>(block.items).map((it, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2"><span className="text-xl">{it.icon || "🎥"}</span><h3 className="font-semibold">{it.t}</h3></div>
                <p className="mt-1 text-sm text-muted-foreground">{it.d}</p>
                {it.url ? <div className="mt-3"><VideoEmbed url={it.url} caption={it.t} /></div> : null}
              </div>
            ))}
          </div>
        </section>
      );
    default:
      return null;
  }
}

export function ProposalRenderer({ blocks, brand }: { blocks: Block[]; brand: Brand }) {
  return (
    <div className="space-y-10">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} brand={brand} />
      ))}
    </div>
  );
}
