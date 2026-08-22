// ── Constructor del DECK de propuestas ──
// Convierte los bloques de una propuesta en las diapositivas del deck (mismo markup y clases
// que propuestas.labstreamsas.com/contenido/: secciones sec-dark/sec-light, .wrap, .sec-head,
// .grid/.card, .tiers/.tier, fondos de video/imagen con .vidbg + .scrim, y la clase .r de
// revelado). El motor (DECK_ENGINE) monta los puntos, el progreso, la navegación y el autoplay.
//
// Devuelve CADENAS de HTML: el portal las inyecta con <style>/<script> de página (no global) y
// la vista previa del editor las mete en un <iframe>, ambos aislados del Tailwind de la app.

import type { Block, Brand } from "./types";
import { logoItems } from "./types";
import { formatMoney } from "@/lib/ui";
import { clientTotals } from "./budget";
import { mesCal } from "./calendar";
import { safeBgUrl, safeExternalUrl } from "./safe-url";
import { DECK_CSS, DECK_ENGINE, DECK_FONTS } from "./deck-assets";

const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : v == null ? d : String(v));
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
// Texto plano desde HTML (para campos que no deben inyectar markup del bloque de texto).
const plano = (h: unknown): string =>
  String(h ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();

// Fondo de medios de una diapositiva (video en loop o imagen) + velo para legibilidad.
function vidbg(block: Block): { html: string; hasMedia: boolean } {
  const video = safeExternalUrl(str(block.bgVideo));
  const bg = safeBgUrl(str(block.bg));
  if (video) {
    return { hasMedia: true, html: `<div class="vidbg"><video autoplay muted loop playsinline preload="auto"${bg ? ` poster="${esc(bg)}"` : ""}><source src="${esc(video)}" type="video/mp4"></video></div><div class="scrim scrim-hero"></div>` };
  }
  if (bg) {
    return { hasMedia: true, html: `<div class="vidbg" style="background:#0c0b0a url('${esc(bg)}') center/cover no-repeat"></div><div class="scrim scrim-hero"></div>` };
  }
  return { hasMedia: false, html: "" };
}

// Tono de la sección: lo elige el bloque (control «Fondo y estilo»); por defecto, portada y
// cierre en oscuro, el resto en claro. Con fondo de medios, siempre oscuro (texto claro).
function themeOf(block: Block, media: boolean): "dark" | "light" {
  if (media) return "dark";
  const t = str(block.tone);
  if (t === "dark" || t === "light") return t;
  return block.type === "hero" || block.type === "cta" ? "dark" : "light";
}

// Cabecera de sección (kicker + título + intro).
function secHead(block: Block): string {
  const kicker = str(block.kicker);
  const title = str(block.title);
  const intro = str(block.sub);
  return `<div class="sec-head">${kicker ? `<div class="kicker r">${esc(kicker)}</div>` : ""}${title ? `<h2 class="r">${esc(title)}</h2>` : ""}${intro ? `<p class="intro r">${esc(intro)}</p>` : ""}</div>`;
}

const gridClass = (n: number): string => (n <= 2 ? "g2" : n === 3 ? "g3" : "g4");

// Envuelve un ENTERO en <span class="count" data-target> para que el motor lo anime de 0 al valor
// (igual que el referente). Conserva prefijo/sufijo no numéricos (p. ej. "+40 %" → +[40]% animado,
// "5 años" → [5] años). Solo enteros limpios: si el número trae separadores o decimales ("1.200",
// "98.5%", "24/7") se muestra tal cual — animar un valor mal interpretado sería peor que no animar.
function statNum(raw: string): string {
  const m = /^([^\d]*?)(\d+)(\D*)$/.exec(raw.trim());
  if (!m) return esc(raw);
  const target = parseInt(m[2], 10);
  if (!Number.isFinite(target)) return esc(raw);
  return `${esc(m[1])}<span class="count" data-target="${target}">0</span>${esc(m[3])}`;
}

function section(theme: string, label: string, inner: string, media = "", id = ""): string {
  return `<section${id ? ` id="${esc(id)}"` : ""} class="sec-${theme}" data-theme="${theme}" data-label="${esc(label)}">${media}<div class="wrap${media ? " z" : ""}">${inner}</div></section>`;
}

function bloqueDeck(block: Block, brand: Brand, i: number): string {
  const media = vidbg(block);
  const theme = themeOf(block, media.hasMedia);
  const label = str(block.kicker) || str(block.title) || `0${i + 1}`;
  const accent = brand.accent || "#F26A21";

  switch (block.type) {
    case "hero": {
      const meta = arr<{ k?: string; v?: string }>(block.meta);
      const forName = str(block.forName);
      const inner =
        `<div class="kicker hero-kick r">${esc(str(block.kicker) || brand.company)}</div>` +
        `<h1 class="r">${esc(str(block.title, "Propuesta")).replace(/\n/g, "<br>")}</h1>` +
        (str(block.subtitle) ? `<span class="hero-sub r">${esc(str(block.subtitle))}</span>` : "") +
        (forName ? `<div class="hero-for r">Propuesta preparada para<b>${esc(forName)}</b>${str(block.forSub) ? `<i>${esc(str(block.forSub))}</i>` : ""}</div>` : "") +
        (str(block.intro) ? `<p class="lede r">${esc(str(block.intro))}</p>` : "") +
        (meta.length ? `<div class="hero-meta r">${meta.map((m) => `<span>${esc(m.k)} · <b>${esc(m.v)}</b></span>`).join("")}</div>` : "") +
        `<div class="scrollhint"><span>Desliza</span><span class="line"></span></div>`;
      return section("dark", str(block.kicker) ? "Inicio" : "Inicio", inner, media.html || `<div class="scrim scrim-hero"></div>`, "hero");
    }
    case "text": {
      const body = str(block.body);
      const inner = secHead(block) + (body ? `<div class="lede r" style="max-width:62ch">${body}</div>` : "");
      return section(theme, label, inner, media.html);
    }
    case "cards": {
      const items = arr<{ icon?: string; t?: string; d?: string }>(block.items);
      const cards = items.map((it) => `<div class="card r"><div class="num">${esc(str(it.icon, "✦"))}</div><h3>${esc(it.t)}</h3><p>${esc(it.d)}</p></div>`).join("");
      return section(theme, label, secHead(block) + `<div class="grid ${gridClass(items.length)}">${cards}</div>`, media.html);
    }
    case "entregables": {
      const items = arr<{ q?: string; t?: string; d?: string }>(block.items);
      const cards = items.map((it) => `<div class="card r"><div class="num" style="font-size:2.4rem">${esc(it.q)}</div><h3>${esc(it.t)}</h3><p>${esc(it.d)}</p></div>`).join("");
      return section(theme, label, secHead(block) + `<div class="grid ${gridClass(items.length)}">${cards}</div>`, media.html);
    }
    case "stats": {
      const items = arr<{ n?: string; p?: string; f?: string }>(block.items);
      const cards = items.map((it) => `<div class="card r"><div class="num" style="color:${esc(accent)}">${statNum(str(it.n))}</div><p>${esc(it.p)}</p>${str(it.f) ? `<p style="opacity:.6;font-size:.8rem;margin-top:.4rem">${esc(it.f)}</p>` : ""}</div>`).join("");
      return section(theme, label, secHead(block) + `<div class="grid ${gridClass(items.length)}">${cards}</div>`, media.html);
    }
    case "checks": {
      const items = arr<string>(block.items);
      const cards = items.map((it) => `<div class="card r" style="display:flex;gap:.7rem;align-items:flex-start"><span style="color:${esc(accent)};font-weight:800">✓</span><p style="margin:0">${esc(it)}</p></div>`).join("");
      return section(theme, label, secHead(block) + `<div class="grid g2">${cards}</div>`, media.html);
    }
    case "styles": {
      const items = arr<{ icon?: string; t?: string; d?: string }>(block.items);
      const cards = items.map((it) => `<div class="card r"><div class="num">${esc(str(it.icon, "🎥"))}</div><h3>${esc(it.t)}</h3><p>${esc(it.d)}</p></div>`).join("");
      return section(theme, label, secHead(block) + `<div class="grid g2">${cards}</div>`, media.html);
    }
    case "timeline": {
      const steps = arr<{ phase?: string; dur?: string; desc?: string }>(block.steps);
      const cards = steps.map((s2, k) => `<div class="card r"><div class="num">${String(k + 1).padStart(2, "0")}</div><h3>${esc(s2.phase)}${str(s2.dur) ? ` <span style="opacity:.6;font-weight:500">· ${esc(s2.dur)}</span>` : ""}</h3><p>${esc(s2.desc)}</p></div>`).join("");
      return section(theme, label, secHead(block) + `<div class="grid ${gridClass(steps.length)}">${cards}</div>`, media.html);
    }
    case "planes": {
      const tiers = arr<{ nombre?: string; precio?: string; unidad?: string; destacado?: boolean; incluye?: unknown }>(block.items);
      const cols = tiers
        .map(
          (t) =>
            `<div class="tier${t.destacado ? " feat" : ""}">${t.destacado ? `<div class="tbadge">Recomendado</div>` : ""}<div class="tname">${esc(t.nombre)}</div><div class="tprice">${esc(t.precio)}<span> ${esc(t.unidad)}</span></div><ul>${arr<string>(t.incluye).map((f) => `<li class="hi">${esc(f)}</li>`).join("")}</ul></div>`,
        )
        .join("");
      const fine = str(block.nota) ? `<div class="finenote r">${esc(str(block.nota))}</div>` : "";
      return section("light", label, secHead(block) + `<div class="tiers r">${cols}</div>${fine}`, media.html);
    }
    case "pricing": {
      const rows = arr<{ c?: string; d?: string; p?: string }>(block.rows);
      const filas = rows.map((r) => `<li>${esc(r.c)}${str(r.d) ? ` — <span style="opacity:.7">${esc(r.d)}</span>` : ""}<b style="float:right">${esc(r.p)}</b></li>`).join("");
      const total = `<div class="tprice" style="margin-top:1rem">${esc(str(block.total, "A convenir"))}</div>`;
      const inner = secHead(block) + `<div class="tier feat r" style="max-width:560px;margin:0 auto"><ul>${filas}</ul>${total}</div>${str(block.note) ? `<div class="finenote r">${esc(str(block.note))}</div>` : ""}`;
      return section(theme, label, inner, media.html);
    }
    case "budget": {
      const cur = str(block.cur, "COP");
      const iva = Number(block.iva) || 0;
      const price = Number(block.price) || 0;
      const discountPct = Number(block.discountPct) || 0;
      const has = price > 0;
      const { total } = clientTotals({ price, discountPct, iva });
      const incl = arr<{ items?: unknown }>(block.sections).flatMap((s2) => arr<{ t?: string }>(s2?.items).map((it) => str(it?.t))).filter(Boolean);
      const lista = block.showIncluded !== false && incl.length ? `<ul>${incl.map((n) => `<li class="hi">${esc(n)}</li>`).join("")}</ul>` : "";
      const inner = secHead(block) + `<div class="tier feat r" style="max-width:520px;margin:0 auto">${lista}<div class="tprice" style="margin-top:1rem">${has ? esc(formatMoney(total, cur)) : "Por definir"}<span> IVA inc.</span></div><div class="tsub">${esc(str(block.note, "Valores de referencia."))}</div></div>`;
      return section(theme, label, inner, media.html);
    }
    case "calendar": {
      const cal = mesCal(str(block.pais, "Colombia"), str(block.mes, "Enero"));
      const hitos = cal.hitos.map((h) => `<div class="card r"><div class="num" style="font-size:1.1rem;color:${esc(accent)}">${esc(h.f)}</div><h3 style="font-size:1rem">${esc(h.t)}</h3><p>${esc(h.i)}</p></div>`).join("");
      return section(theme, label, secHead({ ...block, title: str(block.title, `${str(block.mes)} · ${str(block.pais)}`), sub: cal.foco } as Block) + `<div class="grid g4">${hitos}</div>`, media.html);
    }
    case "logos": {
      const items = logoItems(block.items);
      const chips = items.map((it) => (it.logo ? `<img src="${esc(it.logo)}" alt="${esc(it.name)}" style="max-height:34px;max-width:120px;object-fit:contain">` : `<span>${esc(it.name)}</span>`)).join("");
      return section(theme, label, secHead(block) + `<div class="logos r" style="display:flex;flex-wrap:wrap;gap:1rem;justify-content:center;align-items:center">${chips}</div>`, media.html);
    }
    case "carousel": {
      const items = arr<{ img?: string; t?: string; d?: string }>(block.items);
      const cards = items.map((it) => `<div class="card r">${str(it.img) ? `<img src="${esc(it.img)}" alt="${esc(it.t)}" style="width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:12px;margin-bottom:.8rem">` : ""}<h3>${esc(it.t)}</h3><p>${esc(it.d)}</p></div>`).join("");
      return section(theme, label, secHead(block) + `<div class="grid ${gridClass(items.length)}">${cards}</div>`, media.html);
    }
    case "acc": {
      const items = arr<{ q?: string; a?: string }>(block.items);
      const cards = items.map((it) => `<div class="card r"><h3>${esc(it.q)}</h3><p>${esc(it.a)}</p></div>`).join("");
      return section(theme, label, secHead(block) + `<div class="grid g2">${cards}</div>`, media.html);
    }
    case "video":
    case "fullvideo": {
      const url = safeExternalUrl(str(block.url));
      const yt = url ? url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/) : null;
      const vimeo = url ? url.match(/vimeo\.com\/(\d+)/) : null;
      let media2 = "";
      if (yt) media2 = `<iframe src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0;border-radius:14px"></iframe>`;
      else if (vimeo) media2 = `<iframe src="https://player.vimeo.com/video/${vimeo[1]}" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0;border-radius:14px"></iframe>`;
      else if (url && /\.(mp4|webm|mov)$/i.test(url)) media2 = `<video src="${esc(url)}" controls playsinline style="width:100%;border-radius:14px"></video>`;
      const inner = secHead(block) + `<div class="r" style="max-width:820px;margin:0 auto">${media2}</div>`;
      return section(theme, label, inner, media.html);
    }
    case "cta": {
      const inner =
        `<div class="kicker r" style="text-align:center">${esc(str(block.kicker) || "Demos el primer paso")}</div>` +
        `<h2 class="r">${esc(str(block.title, "¿Trabajamos juntos?"))}</h2>` +
        (str(block.sub) ? `<p class="lede r">${esc(str(block.sub))}</p>` : "") +
        `<div class="contact r"><a class="pill solid" href="${brand.whatsapp ? `https://wa.me/${esc(brand.whatsapp.replace(/[^0-9]/g, ""))}` : "#"}" target="_blank" rel="noopener">Escríbenos por WhatsApp</a><a class="pill" href="mailto:${esc(str(block.email, brand.email))}">${esc(str(block.email, brand.email))}</a></div>` +
        `<div class="signoff r"><span style="font-weight:800;font-size:1.3rem;letter-spacing:.02em">${esc(brand.company)}</span></div>`;
      return section("dark", "Contacto", inner, media.html || `<div class="scrim scrim-hero"></div>`, "cierre");
    }
    default:
      return "";
  }
}

// Las secciones del deck (contenido de <main>).
export function deckSectionsHtml(blocks: Block[], brand: Brand): string {
  return blocks.map((b, i) => bloqueDeck(b, brand, i)).join("");
}

// La cromática del deck (barra de progreso, barra superior, puntos y flechas).
function deckChrome(brand: Brand): { top: string; nav: string } {
  return {
    top:
      `<div id="progress"></div>` +
      `<header id="topbar"><div class="brand"><span style="font-weight:800;letter-spacing:.02em">${esc(brand.company)}</span></div><div class="tag">${esc(brand.tagline || "Propuesta")}</div></header>` +
      `<nav id="dots"></nav>`,
    nav: `<button id="navprev" aria-label="Anterior">‹</button><button id="navnext" aria-label="Siguiente">›</button>`,
  };
}

// Documento HTML COMPLETO y autocontenido del deck — para el <iframe> de la vista previa.
export function deckDocument(blocks: Block[], brand: Brand): string {
  const chrome = deckChrome(brand);
  return (
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Propuesta</title>${DECK_FONTS}<style>${DECK_CSS}</style></head><body>` +
    chrome.top +
    `<main id="main">${deckSectionsHtml(blocks, brand)}</main>` +
    chrome.nav +
    `<script>${DECK_ENGINE}</script></body></html>`
  );
}

export { deckChrome };
