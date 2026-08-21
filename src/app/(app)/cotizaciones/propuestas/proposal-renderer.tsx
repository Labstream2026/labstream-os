// Renderer ÚNICO de la propuesta — diseño editorial premium (papel crema, serif de
// despliegue, acento de marca). Componente PURO (sin hooks ni imports de servidor): se usa
// tanto en la vista previa del editor (cliente) como en la vista pública del cliente (servidor).
//
// Un solo diseño para TODAS las propuestas (se retiraron los temas "presentación" y "cine").
// Cada bloque puede llevar un FONDO de medios opcional —imagen (`bg`) o video en loop
// (`bgVideo`)— con degradado oscuro encima y texto claro; o un tono oscuro (`tone: "dark"`)
// para una sección de contraste. Sin fondo, la sección va sobre el papel crema.

import * as React from "react";
import { logoItems, type Block, type Brand } from "@/lib/proposals/types";
import { formatMoney } from "@/lib/ui";
import { clientTotals, type BudgetSection } from "@/lib/proposals/budget";
import { mesCal } from "@/lib/proposals/calendar";
import { sanitizeProposalHtml } from "@/lib/proposals/sanitize";
import { safeBgUrl, safeExternalUrl } from "@/lib/proposals/safe-url";

// ── Paleta editorial (fija, NO hereda el tema de la app: la propuesta es un documento) ──
const PAPER = "#fbfaf8";
const INK = "#17171a";
const INK_SOFT = "#5b5b63";
const LINE = "#e7e4dd";
const LINE2 = "#d8d4cb";
const OK = "#0e9f6e";
const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif';

function str(v: unknown, d = ""): string {
  return typeof v === "string" ? v : v == null ? d : String(v);
}
function arr<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

// Colores de una sección según si va sobre fondo oscuro (media/tono oscuro) o sobre papel.
function palette(onDark: boolean, accent: string) {
  return {
    title: onDark ? "#ffffff" : INK,
    body: onDark ? "rgba(255,255,255,0.82)" : "#2e2e34",
    soft: onDark ? "rgba(255,255,255,0.68)" : INK_SOFT,
    accent: onDark ? `color-mix(in srgb, ${accent} 55%, white)` : accent,
    cardBg: onDark ? "rgba(255,255,255,0.06)" : "#ffffff",
    cardBorder: onDark ? "rgba(255,255,255,0.16)" : LINE,
    line: onDark ? "rgba(255,255,255,0.16)" : LINE,
    tableHead: onDark ? "rgba(255,255,255,0.08)" : "#f4f2ec",
  };
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
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed text-sm" style={{ borderColor: LINE2, color: INK_SOFT, background: "#fff" }}>
        Añade la URL del video
      </div>
    );
  }
  if (src) {
    return (
      <div className="overflow-hidden rounded-2xl border bg-black shadow-sm" style={{ borderColor: LINE }}>
        <iframe src={src} title={caption || "Video"} allowFullScreen className="aspect-video w-full" />
      </div>
    );
  }
  if (/\.(mp4|webm|mov)$/i.test(u)) {
    return <video src={u} controls className="aspect-video w-full rounded-2xl border bg-black shadow-sm" style={{ borderColor: LINE }} />;
  }
  const safe = safeExternalUrl(u);
  return safe ? (
    <a href={safe} target="_blank" rel="noreferrer" className="text-sm underline" style={{ color: INK }}>
      Ver video →
    </a>
  ) : (
    <p className="text-sm" style={{ color: INK_SOFT }}>Video no disponible</p>
  );
}

// Etiqueta superior (kicker) de una sección.
function Eyebrow({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <p className="mb-2.5 text-[11.5px] font-bold uppercase" style={{ color, letterSpacing: "0.13em" }}>
      {children}
    </p>
  );
}

// Título de sección (serif de despliegue).
function Titulo({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <h2 className="mb-5 text-[1.55rem] leading-[1.12] sm:text-[2rem]" style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: "-0.015em", color, textWrap: "balance" }}>
      {children}
    </h2>
  );
}

// Envoltorio de una sección: pinta el fondo (papel / oscuro / medios) y centra el contenido.
function Shell({
  bg,
  video,
  dark,
  first,
  padY = "py-12 sm:py-14",
  children,
}: {
  bg?: string | null;
  video?: string | null;
  dark?: boolean;
  first?: boolean;
  padY?: string;
  children: React.ReactNode;
}) {
  const media = !!(bg || video);
  const onDark = media || !!dark;
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: onDark ? INK : "transparent",
        borderTop: !onDark && !first ? `1px solid ${LINE}` : undefined,
      }}
    >
      {video ? (
        <video autoPlay muted loop playsInline src={video} className="absolute inset-0 z-0 h-full w-full object-cover" />
      ) : bg ? (
        <div className="absolute inset-0 z-0" style={{ backgroundImage: `url("${bg}")`, backgroundSize: "cover", backgroundPosition: "center" }} />
      ) : null}
      {media ? <div className="absolute inset-0 z-[1]" style={{ background: "linear-gradient(180deg, rgba(10,12,20,0.35), rgba(10,12,20,0.80))" }} /> : null}
      <div className={`relative z-[2] mx-auto w-full max-w-3xl px-6 sm:px-8 ${padY}`}>{children}</div>
    </section>
  );
}

function BlockView({ block, brand, first }: { block: Block; brand: Brand; first?: boolean }) {
  const accent = brand.accent || "#2563eb";
  const bg = safeBgUrl(str(block.bg));
  const video = safeExternalUrl(str(block.bgVideo));
  const dark = block.tone === "dark";
  const onDark = !!(bg || video) || dark;
  const c = palette(onDark, accent);
  const kicker = str(block.kicker);

  switch (block.type) {
    case "hero": {
      const meta = arr<{ k?: string; v?: string }>(block.meta);
      return (
        <Shell bg={bg} video={video} dark={dark} first={first} padY="pt-16 pb-12 sm:pt-20 sm:pb-14">
          <p className="text-[12px] font-bold uppercase" style={{ color: c.accent, letterSpacing: "0.14em" }}>
            {kicker || brand.company}
          </p>
          <h1 className="mt-3 max-w-2xl text-[2.2rem] leading-[1.05] sm:text-[3.1rem]" style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: "-0.02em", color: c.title, textWrap: "balance" }}>
            {str(block.title, "Propuesta")}
          </h1>
          {str(block.subtitle) ? (
            <p className="mt-4 max-w-[34ch] text-[1.15rem]" style={{ color: c.soft }}>{str(block.subtitle)}</p>
          ) : null}
          {str(block.intro) ? (
            <p className="mt-3 max-w-[52ch] text-[0.98rem]" style={{ color: c.soft }}>{str(block.intro)}</p>
          ) : null}
          {meta.length ? (
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
              {meta.map((m, i) => (
                <div key={i} className="text-[13px]" style={{ color: c.body }}>
                  <span className="block text-[10.5px] font-bold uppercase" style={{ color: c.soft, letterSpacing: "0.09em" }}>{str(m.k)}</span>
                  {str(m.v)}
                </div>
              ))}
            </div>
          ) : null}
          {video ? (
            <span className="mt-6 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold text-white" style={{ background: "rgba(0,0,0,0.35)" }}>🎬 Video en loop</span>
          ) : null}
        </Shell>
      );
    }
    case "text":
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          <div
            className="prose-proposal max-w-[60ch] text-[1.05rem] leading-relaxed"
            style={{ color: c.body }}
            dangerouslySetInnerHTML={{ __html: sanitizeProposalHtml(str(block.body)) }}
          />
        </Shell>
      );
    case "cards":
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {arr<{ icon?: string; t?: string; d?: string }>(block.items).map((it, i) => {
              const ico = str(it.icon, "✦");
              const esNum = /^\d{1,2}$/.test(ico.trim());
              return (
                <div key={i} className="rounded-2xl border p-5" style={{ background: c.cardBg, borderColor: c.cardBorder, boxShadow: onDark ? undefined : "0 1px 2px rgba(20,20,25,.04), 0 12px 32px rgba(20,20,25,.05)" }}>
                  {esNum ? (
                    <div className="text-[1.05rem] font-semibold" style={{ fontFamily: SERIF, color: c.accent }}>{ico}</div>
                  ) : (
                    <div className="text-2xl leading-none">{ico}</div>
                  )}
                  <h3 className="mt-2.5 font-semibold" style={{ color: c.title }}>{str(it.t)}</h3>
                  <p className="mt-1 text-sm" style={{ color: c.soft }}>{str(it.d)}</p>
                </div>
              );
            })}
          </div>
        </Shell>
      );
    case "stats":
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            {arr<{ n?: string; p?: string; f?: string }>(block.items).map((it, i) => (
              <div key={i} className="rounded-2xl border p-5" style={{ background: c.cardBg, borderColor: c.cardBorder }}>
                <div className="text-[2.1rem] leading-none" style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: "-0.02em", color: c.accent }}>{str(it.n)}</div>
                <p className="mt-2 text-sm" style={{ color: c.body }}>{str(it.p)}</p>
                {str(it.f) ? <p className="mt-2 text-[10.5px] uppercase" style={{ color: c.soft, letterSpacing: "0.06em" }}>{str(it.f)}</p> : null}
              </div>
            ))}
          </div>
        </Shell>
      );
    case "checks":
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          <ul className="rounded-2xl border p-6" style={{ background: c.cardBg, borderColor: c.cardBorder, boxShadow: onDark ? undefined : "0 1px 2px rgba(20,20,25,.04), 0 12px 32px rgba(20,20,25,.05)" }}>
            {arr<string>(block.items).map((it, i) => (
              <li key={i} className="flex gap-3 py-2 text-[0.98rem]" style={{ color: c.body, borderTop: i === 0 ? undefined : `1px solid ${c.line}` }}>
                <span className="shrink-0 font-extrabold" style={{ color: OK }}>✓</span>
                <span>{str(it)}</span>
              </li>
            ))}
          </ul>
        </Shell>
      );
    case "timeline":
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          <div className="ml-1 pl-6" style={{ borderLeft: `2px solid ${c.line}` }}>
            {arr<{ phase?: string; dur?: string; desc?: string }>(block.steps).map((s, i) => (
              <div key={i} className="relative py-2 pb-4">
                <span className="absolute top-[0.8rem] size-[11px] rounded-full" style={{ left: "calc(-1.5rem - 6px)", background: c.accent, boxShadow: `0 0 0 4px ${onDark ? INK : PAPER}` }} />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h3 className="font-semibold" style={{ color: c.title }}>{str(s.phase)}</h3>
                  {str(s.dur) ? <span className="text-xs font-semibold" style={{ color: c.accent }}>{str(s.dur)}</span> : null}
                </div>
                <p className="mt-0.5 text-sm" style={{ color: c.soft }}>{str(s.desc)}</p>
              </div>
            ))}
          </div>
        </Shell>
      );
    case "plan":
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          {str(block.sub) ? <p className="mb-3 text-sm" style={{ color: c.soft }}>{str(block.sub)}</p> : null}
          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: c.cardBorder }}>
            <table className="w-full text-sm" style={{ background: c.cardBg }}>
              <thead style={{ background: c.tableHead }}>
                <tr>{arr<string>(block.cols).map((col, i) => (<th key={i} className="px-4 py-3 text-left text-[11px] font-bold uppercase" style={{ color: c.soft, letterSpacing: "0.06em" }}>{col}</th>))}</tr>
              </thead>
              <tbody>
                {arr<string[]>(block.rows).map((row, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${c.line}` }}>
                    {arr<string>(row).map((cell, j) => (<td key={j} className="px-4 py-3" style={{ color: j === 0 ? c.title : c.body }}>{cell}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Shell>
      );
    case "pricing": {
      const rows = arr<{ c?: string; d?: string; p?: string }>(block.rows);
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: c.cardBorder }}>
            <table className="w-full text-sm" style={{ background: c.cardBg }}>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: i === 0 ? undefined : `1px solid ${c.line}` }}>
                    <td className="px-4 py-3 font-medium" style={{ color: c.title }}>{str(r.c)}</td>
                    <td className="px-4 py-3" style={{ color: c.soft }}>{str(r.d)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: c.title }}>{str(r.p)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: c.tableHead }}>
                  <td className="px-4 py-3 font-bold" style={{ color: c.title }} colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: c.accent }}>{str(block.total, "A convenir")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {str(block.note) ? <p className="mt-3 text-[0.82rem]" style={{ color: c.soft }}>{str(block.note)}</p> : null}
        </Shell>
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
      const included = sections.flatMap((s) => arr<{ t?: string }>((s as { items?: unknown })?.items).map((it) => it?.t)).filter(Boolean);
      const showIncluded = block.showIncluded !== false && included.length > 0;
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          {str(block.sub) ? <p className="mb-3 text-sm" style={{ color: c.soft }}>{str(block.sub)}</p> : null}
          {showIncluded ? (
            <div className="mb-4 rounded-2xl border p-5" style={{ background: c.cardBg, borderColor: c.cardBorder }}>
              <p className="mb-3 text-[10.5px] font-bold uppercase" style={{ color: c.soft, letterSpacing: "0.08em" }}>Incluye</p>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {included.map((n, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: c.body }}>
                    <span className="mt-0.5 font-extrabold" style={{ color: OK }}>✓</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: c.cardBorder }}>
            <table className="w-full text-sm" style={{ background: c.cardBg }}>
              <tbody>
                <tr><td className="px-4 py-3" style={{ color: c.soft }}>Precio</td><td className="px-4 py-3 text-right tabular-nums" style={{ color: c.title }}>{hasPrice ? formatMoney(explicitPrice, cur) : "Por definir"}</td></tr>
                {hasPrice && discountPct > 0 ? (
                  <>
                    <tr style={{ borderTop: `1px solid ${c.line}` }}><td className="px-4 py-3" style={{ color: c.soft }}>Descuento ({discountPct}%)</td><td className="px-4 py-3 text-right tabular-nums" style={{ color: OK }}>− {formatMoney(discount, cur)}</td></tr>
                    <tr style={{ borderTop: `1px solid ${c.line}` }}><td className="px-4 py-3" style={{ color: c.soft }}>Subtotal</td><td className="px-4 py-3 text-right tabular-nums" style={{ color: c.title }}>{formatMoney(subtotal, cur)}</td></tr>
                  </>
                ) : null}
                {hasPrice ? (
                  <tr style={{ borderTop: `1px solid ${c.line}` }}><td className="px-4 py-3" style={{ color: c.soft }}>IVA ({iva}%)</td><td className="px-4 py-3 text-right tabular-nums" style={{ color: c.title }}>{formatMoney(tax, cur)}</td></tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr style={{ background: c.tableHead }}><td className="px-4 py-3 font-bold" style={{ color: c.title }}>Total</td><td className="px-4 py-3 text-right text-base font-bold tabular-nums" style={{ color: c.accent }}>{hasPrice ? formatMoney(total, cur) : "Por definir"}</td></tr>
              </tfoot>
            </table>
          </div>
          {str(block.note) ? <p className="mt-3 text-[0.82rem]" style={{ color: c.soft }}>{str(block.note)}</p> : null}
        </Shell>
      );
    }
    case "calendar": {
      const pais = str(block.pais, "Colombia");
      const mes = str(block.mes, "Enero");
      const cal = mesCal(pais, mes);
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          <div className="rounded-2xl border p-5" style={{ background: c.cardBg, borderColor: c.cardBorder }}>
            <p className="text-[0.95rem]" style={{ color: c.body }}><span className="font-semibold" style={{ color: c.title }}>{mes} · {pais}</span> — {cal.foco}</p>
            {cal.hitos.length ? (
              <div className="mt-3">
                {cal.hitos.map((h, i) => (
                  <div key={i} className="flex gap-3 py-2 text-sm" style={{ borderTop: i === 0 ? undefined : `1px solid ${c.line}` }}>
                    <span className="w-24 shrink-0 text-[0.82rem] font-semibold" style={{ color: c.accent }}>{h.f}</span>
                    <span style={{ color: c.body }}><span className="font-medium" style={{ color: c.title }}>{h.t}.</span> <span style={{ color: c.soft }}>{h.i}</span></span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Shell>
      );
    }
    case "video":
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          <VideoEmbed url={str(block.url)} caption={str(block.caption)} />
          {str(block.caption) ? <p className="mt-2 text-center text-sm" style={{ color: c.soft }}>{str(block.caption)}</p> : null}
        </Shell>
      );
    case "fullvideo":
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          <VideoEmbed url={str(block.url)} caption={str(block.title)} />
        </Shell>
      );
    case "carousel":
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          {str(block.sub) ? <p className="mb-3 text-sm" style={{ color: c.soft }}>{str(block.sub)}</p> : null}
          <div className="flex snap-x gap-4 overflow-x-auto pb-2">
            {arr<{ img?: string; t?: string; d?: string }>(block.items).map((it, i) => (
              <div key={i} className="w-60 shrink-0 snap-start overflow-hidden rounded-2xl border" style={{ background: c.cardBg, borderColor: c.cardBorder }}>
                {str(it.img) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={str(it.img)} alt={str(it.t)} className="aspect-video w-full object-cover" />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-xs" style={{ background: "rgba(0,0,0,0.05)", color: c.soft }}>Imagen</div>
                )}
                <div className="p-3.5"><h3 className="text-sm font-semibold" style={{ color: c.title }}>{str(it.t)}</h3><p className="text-xs" style={{ color: c.soft }}>{str(it.d)}</p></div>
              </div>
            ))}
          </div>
        </Shell>
      );
    case "acc":
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          <div className="overflow-hidden rounded-2xl border" style={{ background: c.cardBg, borderColor: c.cardBorder }}>
            {arr<{ q?: string; a?: string }>(block.items).map((it, i) => (
              <details key={i} className="p-4" style={{ borderTop: i === 0 ? undefined : `1px solid ${c.line}` }}>
                <summary className="cursor-pointer list-none font-medium" style={{ color: c.title }}>{str(it.q)}</summary>
                <p className="mt-2 text-sm" style={{ color: c.soft }}>{str(it.a)}</p>
              </details>
            ))}
          </div>
        </Shell>
      );
    case "logos":
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <div className="text-center"><Eyebrow color={c.accent}>{kicker}</Eyebrow></div> : null}
          {str(block.title) ? <div className="text-center"><Titulo color={c.title}>{str(block.title)}</Titulo></div> : null}
          {str(block.sub) ? <p className="mx-auto mb-4 max-w-[52ch] text-center text-sm" style={{ color: c.soft }}>{str(block.sub)}</p> : null}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {logoItems(block.items).map((it, i) => (
              <span key={i} className="flex items-center rounded-xl border px-4 py-2 text-sm font-semibold" style={{ background: c.cardBg, borderColor: c.cardBorder, color: c.soft }}>
                {it.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.logo} alt={it.name} className="max-h-7 max-w-[7rem] object-contain" />
                ) : (
                  it.name
                )}
              </span>
            ))}
          </div>
        </Shell>
      );
    case "styles":
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {arr<{ icon?: string; t?: string; d?: string; url?: string }>(block.items).map((it, i) => (
              <div key={i} className="rounded-2xl border p-5" style={{ background: c.cardBg, borderColor: c.cardBorder }}>
                <div className="flex items-center gap-2"><span className="text-xl">{str(it.icon, "🎥")}</span><h3 className="font-semibold" style={{ color: c.title }}>{str(it.t)}</h3></div>
                <p className="mt-1 text-sm" style={{ color: c.soft }}>{str(it.d)}</p>
                {str(it.url) ? <div className="mt-3"><VideoEmbed url={str(it.url)} caption={str(it.t)} /></div> : null}
              </div>
            ))}
          </div>
        </Shell>
      );
    case "cta":
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          <div className="text-center">
            {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
            <h2 className="text-[1.6rem] sm:text-[2.3rem]" style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: "-0.02em", color: c.title, textWrap: "balance" }}>{str(block.title, "Trabajemos juntos")}</h2>
            {str(block.sub) ? <p className="mx-auto mt-3 max-w-[44ch]" style={{ color: c.soft }}>{str(block.sub)}</p> : null}
            <a
              href={`mailto:${str(block.email, brand.email)}`}
              className="mt-6 inline-flex items-center justify-center rounded-full px-7 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ background: accent }}
            >
              {str(block.btn, "Contactar")}
            </a>
            <p className="mt-3 text-xs" style={{ color: c.soft }}>{brand.email} · {brand.whatsapp}</p>
          </div>
        </Shell>
      );
    case "planes": {
      const planes = arr<{ nombre?: string; precio?: string; unidad?: string; destacado?: boolean; incluye?: unknown }>(block.items);
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {planes.map((p, i) => {
              const dest = !!p.destacado;
              return (
                <div
                  key={i}
                  className="relative rounded-2xl border p-5"
                  style={{
                    background: c.cardBg,
                    borderColor: dest ? accent : c.cardBorder,
                    boxShadow: dest ? `0 0 0 1px ${accent}, 0 12px 32px rgba(20,20,25,.07)` : onDark ? undefined : "0 1px 2px rgba(20,20,25,.04), 0 12px 32px rgba(20,20,25,.05)",
                  }}
                >
                  {dest ? <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: accent, letterSpacing: "0.06em" }}>Recomendado</span> : null}
                  <h3 className="text-[1.25rem]" style={{ fontFamily: SERIF, fontWeight: 600, color: c.title }}>{str(p.nombre)}</h3>
                  <div className="mt-1 text-[1.6rem] font-bold" style={{ letterSpacing: "-0.02em", color: c.title }}>
                    {str(p.precio)} {str(p.unidad) ? <span className="text-[0.8rem] font-medium" style={{ color: c.soft }}>{str(p.unidad)}</span> : null}
                  </div>
                  <ul className="mt-3.5 flex flex-col gap-1.5">
                    {arr<string>(p.incluye).map((f, j) => (
                      <li key={j} className="flex gap-2 text-[0.86rem]" style={{ color: c.body }}><span className="shrink-0 font-extrabold" style={{ color: OK }}>✓</span><span>{str(f)}</span></li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {str(block.nota) ? <p className="mt-4 text-[0.82rem]" style={{ color: c.soft }}>{str(block.nota)}</p> : null}
        </Shell>
      );
    }
    case "entregables": {
      const ent = arr<{ q?: string; t?: string; d?: string }>(block.items);
      return (
        <Shell bg={bg} video={video} dark={dark} first={first}>
          {kicker ? <Eyebrow color={c.accent}>{kicker}</Eyebrow> : null}
          {str(block.title) ? <Titulo color={c.title}>{str(block.title)}</Titulo> : null}
          <div
            className="rounded-2xl border px-2 sm:px-3"
            style={{ background: c.cardBg, borderColor: c.cardBorder, boxShadow: onDark ? undefined : "0 1px 2px rgba(20,20,25,.04), 0 12px 32px rgba(20,20,25,.05)" }}
          >
            {ent.map((e, i) => (
              <div key={i} className="flex items-start gap-4 px-3 py-3.5" style={{ borderTop: i === 0 ? undefined : `1px solid ${c.line}` }}>
                <div className="min-w-[52px] shrink-0 text-[1.5rem] leading-none" style={{ fontFamily: SERIF, fontWeight: 600, color: c.accent }}>{str(e.q)}</div>
                <div className="min-w-0">
                  <b className="block text-[0.98rem] font-semibold" style={{ color: c.title }}>{str(e.t)}</b>
                  {str(e.d) ? <span className="text-[0.88rem]" style={{ color: c.soft }}>{str(e.d)}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </Shell>
      );
    }
    default:
      return null;
  }
}

export function ProposalRenderer({ blocks, brand }: { blocks: Block[]; brand: Brand }) {
  return (
    <div style={{ background: PAPER, color: INK }}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} brand={brand} first={i === 0} />
      ))}
    </div>
  );
}
