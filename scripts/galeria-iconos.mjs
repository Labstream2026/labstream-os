// Genera una galería HTML con TODOS los íconos del set propio, leyéndolos del código fuente.
// No se dibuja nada a mano: si el .tsx cambia, la galería cambia. Sirve para revisar de un
// vistazo que ninguno quedó ilegible o demasiado naranja tras un cambio de paleta.
//
//   node scripts/galeria-iconos.mjs > salida.html
import { readFileSync } from "node:fs";

const SW = 1.8;
const ACENTO = "#F47A20";
const TINTA = "currentColor";

// `fill={C.violet}` → `fill="currentColor"`. Solo `orange` conserva color propio.
function aHtml(cuerpo) {
  return cuerpo
    .replace(/\{C\.orange\}/g, `"${ACENTO}"`)
    .replace(/\{C\.\w+\}/g, `"${TINTA}"`)
    .replace(/\{SW\}/g, `"${SW}"`)
    .replace(/\{([\d.]+)\}/g, `"$1"`)
    .replace(/fillOpacity=/g, "fill-opacity=")
    .replace(/strokeWidth=/g, "stroke-width=")
    .replace(/strokeDasharray=/g, "stroke-dasharray=")
    .replace(/strokeLinecap=/g, "stroke-linecap=")
    .replace(/fillRule=/g, "fill-rule=")
    .replace(/clipRule=/g, "clip-rule=")
    .trim();
}

function extraer(ruta, patron) {
  const src = readFileSync(ruta, "utf8");
  const out = [];
  const re = new RegExp(patron + String.raw`\(p: IconProps\) \{[\s\S]*?<Icon \{\.\.\.p\}>([\s\S]*?)<\/Icon>`, "g");
  let m;
  // Grupo 1 = el nombre (lo aporta `patron`), grupo 2 = la geometría entre <Icon> y </Icon>.
  while ((m = re.exec(src))) out.push({ nombre: m[1], svg: aHtml(m[2]) });
  return out;
}

const seccion = [
  { titulo: "Secciones de la app", items: extraer("src/components/icons/index.tsx", String.raw`export function (Icon\w+)`) },
  { titulo: "Sectores y tipos de proyecto", items: extraer("src/components/icons/marks.tsx", String.raw`function (Mk\w+)`) },
];

const pinta = (i, size) =>
  `<svg viewBox="0 0 24 24" fill="none" width="${size}" height="${size}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${i.svg}</svg>`;

const rejilla = (items, size) =>
  items.map((i) => `<figure><span class="caja">${pinta(i, size)}</span><figcaption>${i.nombre.replace(/^(Icon|Mk)/, "")}</figcaption></figure>`).join("");

const total = seccion.reduce((n, s) => n + s.items.length, 0);

process.stdout.write(`<title>El set en tinta</title>
<style>
  :root{--ground:#FBFAF8;--card:#FFF;--ink:#1C1917;--ink-2:#57534E;--ink-3:#8A827A;--line:#E9E4DC;--orange:#F47A20}
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ground:#111010;--card:#1A1918;--ink:#EFEBE6;--ink-2:#A9A29A;--ink-3:#7D766F;--line:#2A2724}}
  :root[data-theme="dark"]{--ground:#111010;--card:#1A1918;--ink:#EFEBE6;--ink-2:#A9A29A;--ink-3:#7D766F;--line:#2A2724}
  *{box-sizing:border-box}
  body{background:var(--ground);color:var(--ink);margin:0;font:400 16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1000px;margin:0 auto;padding:52px 24px 80px}
  .eyebrow{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3);font-weight:500;margin:0 0 10px}
  h1{font-size:clamp(28px,4vw,40px);line-height:1.1;letter-spacing:-.022em;font-weight:600;margin:0 0 14px}
  .lede{font-size:17px;color:var(--ink-2);max-width:60ch;margin:0}
  h2{font-size:20px;font-weight:600;letter-spacing:-.012em;margin:44px 0 4px}
  .cnt{font-size:13.5px;color:var(--ink-3);margin:0 0 18px}
  .rej{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:4px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}
  figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:7px;padding:14px 4px;border-radius:9px}
  figure:hover{background:color-mix(in srgb,var(--ink) 5%,transparent)}
  .caja{display:grid;place-items:center;height:30px}
  figcaption{font-size:10.5px;color:var(--ink-3);text-align:center;line-height:1.25;word-break:break-word}
  .oscuro{background:#0B0B0C;border-color:#232323;color:#E9E5E0}
  .oscuro figcaption{color:#7C7770}
  .oscuro figure:hover{background:rgba(255,255,255,.05)}
  .nota{font-size:14.5px;color:var(--ink-2);margin:14px 0 0;max-width:64ch}
  .tira{display:flex;flex-wrap:wrap;gap:20px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-top:10px}
  .tira .c{display:flex;align-items:center;gap:9px;font-size:14px}
  .t-mudo{color:var(--ink-3)} .t-normal{color:var(--ink)} .t-marca{color:var(--orange)}
</style>
<div class="wrap">
  <p class="eyebrow">Labstream OS · set propio</p>
  <h1>El set en tinta</h1>
  <p class="lede">Los ${total} íconos, ya convertidos: el cuerpo toma el color del texto y solo un detalle lleva el naranja. Esta página se genera leyendo los archivos <code>.tsx</code>, así que es lo que la app dibuja de verdad.</p>

  <h2>El mismo ícono, tres colores de texto</h2>
  <p class="cnt">Es lo que ocurre al pasar de una pestaña apagada a la activa. El acento no se mueve.</p>
  <div class="tira">
    <span class="c t-mudo">${pinta(seccion[0].items.find((i) => i.nombre === "IconProyectos"), 22)} apagado</span>
    <span class="c t-normal">${pinta(seccion[0].items.find((i) => i.nombre === "IconProyectos"), 22)} normal</span>
    <span class="c t-marca">${pinta(seccion[0].items.find((i) => i.nombre === "IconProyectos"), 22)} activo</span>
  </div>
`);

for (const s of seccion) {
  process.stdout.write(`  <h2>${s.titulo}</h2>
  <p class="cnt">${s.items.length} íconos · claro</p>
  <div class="rej">${rejilla(s.items, 24)}</div>
  <p class="cnt" style="margin-top:14px">${s.items.length} íconos · oscuro</p>
  <div class="rej oscuro">${rejilla(s.items, 24)}</div>
`);
}

process.stdout.write(`  <p class="nota">Si alguno se ve como un manchón naranja o se pierde en el fondo oscuro, es un ícono que hay que rebalancear: el naranja debe ser un detalle, nunca el cuerpo.</p>
</div>
`);
