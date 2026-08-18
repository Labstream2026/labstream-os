// Empaqueta el puente del plugin de Resolve para que los editores se actualicen solos.
//
// Produce, bajo public/plugin/:
//   <version>/<archivo>.js   los archivos que el puente descarga uno a uno (sin zip: Electron
//                            no trae descompresor y bajar 4 archivos sueltos evita esa dependencia)
//   manifest.json            versión, notas y el sha256 de CADA archivo
//
// El manifiesto y los archivos salen SIEMPRE de la misma corrida, así que no puede quedar un
// manifiesto prometiendo una versión que los archivos no tienen.
//
// Uso:  node scripts/empaquetar-plugin.mjs "notas de la versión"
// La versión NO se escribe aquí: se lee de main.js (const VERSION), que es la que manda de verdad.

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { crearZip } from "./lib/zip.mjs";

const RAIZ = process.cwd();
const PANEL = path.join(RAIZ, "resolve-plugin", "panel");
const ORIGEN = path.join(PANEL, "com.labstream.correcciones");
const DESTINO = path.join(RAIZ, "public", "plugin");

// Lo que el puente puede descargar: solo código JS. El .node de Blackmagic NO viaja (es binario
// con licencia y solo el instalador puede ponerlo, con permisos de administrador).
const ARCHIVOS = ["main.js", "preload.js", "timecode.js"];

const notas = process.argv[2] || null;

const mainJs = await readFile(path.join(ORIGEN, "main.js"), "utf8");
const m = mainJs.match(/^const VERSION = "([^"]+)";/m);
if (!m) {
  console.error("No encuentro `const VERSION = \"…\";` en main.js — no empaqueto a ciegas.");
  process.exit(1);
}
const version = m[1];

// El preload anuncia su propia versión al panel: si no cuadra con la de main.js, el aviso de
// «hay versión nueva» mentiría. Se comprueba aquí y no en producción.
const preloadJs = await readFile(path.join(ORIGEN, "preload.js"), "utf8");
const mp = preloadJs.match(/version: "([^"]+)"/);
if (!mp || mp[1].replace(/\.0$/, "") !== version) {
  console.error(`Descuadre de versión: main.js dice ${version} y preload.js dice ${mp ? mp[1] : "(nada)"}.`);
  process.exit(1);
}

await rm(path.join(DESTINO, version), { recursive: true, force: true });
await mkdir(path.join(DESTINO, version), { recursive: true });

// Los saltos de línea se normalizan a LF ANTES de hashear y de escribir. No es cosmética: el
// puente compara byte a byte contra este sha256, y con core.autocrlf el árbol de trabajo de
// Windows tiene CRLF mientras git guarda —y el NAS sirve— LF. Hasheando el archivo tal cual, el
// manifiesto anunciaba una firma que ningún archivo servido cumplía y la actualización fallaba
// SIEMPRE, sin que nada avisara (todo respondía 200). Normalizando aquí, el hash no depende de
// en qué sistema se empaquete.
const aLF = (buf) => Buffer.from(buf.toString("utf8").replace(/\r\n/g, "\n"), "utf8");

const files = [];
for (const nombre of ARCHIVOS) {
  const datos = aLF(await readFile(path.join(ORIGEN, nombre)));
  const sha256 = createHash("sha256").update(datos).digest("hex");
  await writeFile(path.join(DESTINO, version, nombre), datos);
  files.push({ name: nombre, sha256, size: datos.length });
}

// ── Kit de instalación (zip) ──────────────────────────────────────────────────
// La autoactualización solo sabe reemplazar JS. La PRIMERA instalación (y cualquier equipo
// nuevo) necesita el kit completo: la carpeta del plugin más los instaladores, que son los que
// buscan WorkflowIntegration.node en el Resolve del propio equipo y copian todo a ProgramData
// con permisos de administrador. Por eso el zip se arma aquí y no se descarga por partes.
const DEL_PLUGIN = ["main.js", "preload.js", "timecode.js", "manifest.xml", "package.json", "offline.html", "icon.ico", "icon.png"];
const DEL_KIT = [
  "INSTALAR-Windows.bat",
  "instalar-panel-windows.ps1",
  "instalar-panel-mac.command",
  "DIAGNOSTICO-Windows.bat",
  "diagnostico-windows.ps1",
  "diagnostico-mac.command",
];

const entradas = [];
for (const n of DEL_PLUGIN) {
  // Los .js del kit se normalizan igual que los publicados: así el puente que se instala a mano
  // y el que se descarga solo son el MISMO archivo byte a byte. Lo demás (iconos, y los .bat que
  // cmd.exe prefiere en CRLF) viaja tal cual.
  const crudo = await readFile(path.join(ORIGEN, n));
  entradas.push({ name: `com.labstream.correcciones/${n}`, data: n.endsWith(".js") ? aLF(crudo) : crudo });
}
for (const n of DEL_KIT) {
  // Los .command de Mac necesitan permiso de ejecución o el doble clic no hace nada.
  entradas.push({ name: n, data: await readFile(path.join(PANEL, n)), mode: n.endsWith(".command") ? 0o755 : 0o644 });
}
const zip = crearZip(entradas);
const nombreZip = `labstream-correcciones-${version}.zip`;
await writeFile(path.join(DESTINO, nombreZip), zip);

const manifiesto = {
  version,
  notes: notas,
  files,
  builtAt: new Date().toISOString(),
  // Para quien tenga un puente viejo (sin autoactualización) y deba reinstalar a mano.
  installer: "/plugin/instalar",
  kit: `/plugin/${nombreZip}`,
  kitSize: zip.length,
  kitSha256: createHash("sha256").update(zip).digest("hex"),
};
await writeFile(path.join(DESTINO, "manifest.json"), JSON.stringify(manifiesto, null, 2) + "\n");

// Limpieza: se conservan las DOS últimas versiones (la vigente y la anterior, por si hay que
// volver atrás); las más viejas ya no las descarga nadie.
const dirs = (await readdir(DESTINO, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && /^\d+\.\d+/.test(d.name))
  .map((d) => d.name)
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
const vigentes = new Set(dirs.slice(0, 2));
for (const viejo of dirs.slice(2)) {
  await rm(path.join(DESTINO, viejo), { recursive: true, force: true });
  console.log("  retirada la versión vieja:", viejo);
}
// El zip de una versión retirada se va con ella: si no, quedaban kits viejos descargables para
// siempre y alguien acabaría instalando el de hace tres versiones.
for (const f of await readdir(DESTINO)) {
  const z = f.match(/^labstream-correcciones-(\d+\.\d+(?:\.\d+)?)\.zip$/);
  if (z && !vigentes.has(z[1])) {
    await rm(path.join(DESTINO, f), { force: true });
    console.log("  retirado el kit viejo:", f);
  }
}

console.log(`Plugin ${version} empaquetado en public/plugin/`);
for (const f of files) console.log(`  ${f.name}  ${f.size} B  ${f.sha256.slice(0, 16)}…`);
console.log(`  ${nombreZip}  ${zip.length} B  (kit de instalación: ${entradas.length} archivos)`);
