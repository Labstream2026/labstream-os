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

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
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

// ── Instalador .exe de Windows ────────────────────────────────────────────────
// Un solo ejecutable con el kit embebido: doble clic → administrador → instalado. Se compila
// con el csc del .NET Framework que trae todo Windows; en otro sistema simplemente no se
// genera (el zip sigue siendo el camino universal). Si csc existe pero la compilación FALLA,
// se aborta: publicar un manifiesto que promete un .exe que no se construyó sería mentir.
const CSC = "C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe";
const DIR_INSTALADOR = path.join(RAIZ, "resolve-plugin", "instalador-windows");
let exe = null;
if (existsSync(CSC)) {
  const nombreExe = `InstalarLabstreamCorrecciones-${version}.exe`;
  // La versión llega al C# como constante generada (C# 5: sin interpolación ni recursos .resx).
  const tmpVer = path.join(os.tmpdir(), "InfoInstalador.cs");
  await writeFile(tmpVer, `internal static class InfoInstalador { public const string Version = "${version}"; }\n`);
  const r = spawnSync(
    CSC,
    [
      "/nologo",
      "/optimize+",
      "/target:winexe",
      `/out:${path.join(DESTINO, nombreExe)}`,
      `/win32icon:${path.join(ORIGEN, "icon.ico")}`,
      `/win32manifest:${path.join(DIR_INSTALADOR, "app.manifest")}`,
      `/res:${path.join(DESTINO, nombreZip)},kit.zip`,
      "/r:System.IO.Compression.dll",
      "/r:System.IO.Compression.FileSystem.dll",
      "/r:System.Windows.Forms.dll",
      path.join(DIR_INSTALADOR, "Instalador.cs"),
      tmpVer,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error("La compilación del instalador .exe falló:\n" + (r.stdout || "") + (r.stderr || ""));
    process.exit(1);
  }
  exe = `/plugin/${nombreExe}`;
} else {
  console.warn("  (sin csc en este sistema: el instalador .exe no se genera aquí)");
}

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
  // Instalador de un clic para Windows; el .dmg de Mac lo construye GitHub Actions (un runner
  // de macOS: hdiutil no existe fuera de Mac) y la página de instalación lo detecta en disco.
  exe,
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
// Y cualquier carpeta con pinta de kit DESCOMPRIMIDO (residuo de una verificación manual del
// zip): el kit legítimo es siempre el .zip; una carpeta suelta acabaría commiteada y servida
// para siempre sin que ninguna limpieza la tocara.
for (const d of await readdir(DESTINO, { withFileTypes: true })) {
  if (d.isDirectory() && /^labstream-correcciones-/i.test(d.name)) {
    await rm(path.join(DESTINO, d.name), { recursive: true, force: true });
    console.log("  retirado un kit descomprimido suelto:", d.name);
  }
}
// Los instaladores de una versión retirada se van con ella: si no, quedaban kits viejos
// descargables para siempre y alguien acabaría instalando el de hace tres versiones.
const PATRONES_VIEJOS = [
  /^labstream-correcciones-(\d+\.\d+(?:\.\d+)?)\.zip$/,
  /^InstalarLabstreamCorrecciones-(\d+\.\d+(?:\.\d+)?)\.exe$/,
  /^LabstreamCorrecciones-(\d+\.\d+(?:\.\d+)?)\.dmg$/,
];
for (const f of await readdir(DESTINO)) {
  for (const patron of PATRONES_VIEJOS) {
    const z = f.match(patron);
    if (z && !vigentes.has(z[1])) {
      await rm(path.join(DESTINO, f), { force: true });
      console.log("  retirado el instalador viejo:", f);
    }
  }
}

console.log(`Plugin ${version} empaquetado en public/plugin/`);
for (const f of files) console.log(`  ${f.name}  ${f.size} B  ${f.sha256.slice(0, 16)}…`);
console.log(`  ${nombreZip}  ${zip.length} B  (kit de instalación: ${entradas.length} archivos)`);
if (exe) console.log(`  ${exe.slice(8)}  (instalador de Windows)`);
