"use strict";
// Labstream Correcciones — Workflow Integration para DaVinci Resolve Studio (Win/Mac).
//
// LIGERO a propósito: este plugin NO empaca Electron ni Node — Resolve lo ejecuta con su
// Electron embebido (36.x). Todo el peso propio son ~30 KB de JS + WorkflowIntegration.node
// (el módulo de Blackmagic que copia el instalador desde los ejemplos del SDK local).
//
// La interfaz ES la web: una ventana que carga os.labstreamsas.com/resolve, donde el editor
// inicia sesión NORMAL (Authentik/credenciales, cookie persistente) y solo ve clientes →
// proyectos → correcciones de entregables. Este main solo aporta el puente nativo:
//   ls:jump     → mover el cabezal al timecode de una corrección
//   ls:markers  → pintar/retirar los marcadores lsos:* del timeline
//   ls:info     → nombre/fps del timeline abierto
// La página detecta el puente (window.labstream) y habilita esos botones.

const { app, BrowserWindow, ipcMain, shell, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http"); // solo para el panel en localhost durante el desarrollo
const crypto = require("crypto");

const PLUGIN_ID = "com.labstream.correcciones";
const PANEL_URL = process.env.LABSTREAM_PANEL_URL || "https://os.labstreamsas.com/resolve";
const MARKER_PREFIX = "lsos:";
const VERSION = "2.1.1";

// ── Arranque en dos pisos: ¿hay una versión más nueva ya descargada? ───────────
// El plugin se instala en una carpeta del SISTEMA (ProgramData en Windows, /Library en Mac):
// escribir ahí exige administrador, así que actualizarse solo encima de sí mismo es imposible
// sin pedirle la contraseña al editor cada vez.
//
// La salida: las versiones nuevas se descargan a la carpeta del USUARIO (siempre escribible) y
// este archivo, al arrancar, prefiere la más nueva que encuentre ahí. Resolve sigue cargando el
// mismo archivo instalado; ese archivo decide qué código correr.
//
// Tres cierres para que esto NUNCA deje al equipo sin panel:
//   1. Si el require de la versión descargada lanza, se sigue con la integrada (este archivo).
//   2. Se cuentan los intentos: si una versión descargada arranca 3 veces sin llegar a abrir la
//      ventana, se marca mala y no se vuelve a usar.
//   3. Solo se acepta lo que trae la firma sha256 que anunció el servidor (ver descargarActualizacion).
// La carpeta INSTALADA (ProgramData / Library). Importa que sea la instalada y no __dirname:
// cuando corre una versión descargada, su __dirname es la carpeta del usuario, donde SOLO hay
// .js — ni WorkflowIntegration.node, ni offline.html, ni los iconos. La versión instalada deja
// su ruta en el global antes de cargar la descargada, así que esta constante resuelve bien en
// los dos casos y todo lo que no viaja en la descarga se sigue encontrando.
const DIR_INSTALADO = global.__labstreamPluginDir || __dirname;

// ¿Este módulo es la copia DESCARGADA o la instalada? Lo decide de dónde se cargó el archivo,
// sin coordinación entre copias: la instalada vive en ProgramData/Library y la descargada
// siempre bajo userData.
function soyLaDescargada() {
  try {
    return path.resolve(__dirname).startsWith(path.resolve(dirDescargas()));
  } catch {
    return false;
  }
}

function dirDescargas() {
  return path.join(app.getPath("userData"), "labstream-bridge");
}

function leerJson(p, porDefecto) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return porDefecto;
  }
}

function comparaVersion(a, b) {
  const na = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const nb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    if ((na[i] || 0) !== (nb[i] || 0)) return (na[i] || 0) - (nb[i] || 0);
  }
  return 0;
}

// La versión descargada que debe usarse, o null para quedarse con la integrada.
function buscarDescargada() {
  try {
    const base = dirDescargas();
    const estado = leerJson(path.join(base, "estado.json"), {});
    const v = estado.version;
    if (!v || comparaVersion(v, VERSION) <= 0) return null;
    if (estado.mala) return null;
    if ((estado.intentos || 0) >= 3) {
      // Arrancó 3 veces sin llegar a abrir ventana. Se DEJA CONSTANCIA en disco: sin esta
      // marca el descarte no era permanente — marcarArranqueBueno pone `intentos` a cero y en
      // el arranque siguiente se reintentaba la misma versión rota, para siempre.
      try {
        fs.writeFileSync(path.join(base, "estado.json"), JSON.stringify({ ...estado, mala: true }));
      } catch {}
      console.error("[labstream] la versión " + v + " no arrancó 3 veces: se descarta y se sigue con la instalada.");
      return null;
    }
    const main = path.join(base, v, "main.js");
    if (!fs.existsSync(main)) return null;
    // Se anota el intento ANTES de cargarla; la propia versión nueva lo pone a cero al abrir
    // la ventana (marcarArranqueBueno). Si revienta antes, el contador sube y a la tercera se rinde.
    fs.writeFileSync(
      path.join(base, "estado.json"),
      JSON.stringify({ ...estado, intentos: (estado.intentos || 0) + 1 }),
    );
    return main;
  } catch {
    return null;
  }
}

function marcarArranqueBueno() {
  // SOLO cuenta como arranque bueno si quien abrió la ventana es de verdad la versión
  // descargada. La instalada también llega aquí cuando actúa de respaldo (el require de la
  // descargada lanzó, o el cortacircuitos ya la descartó): si tambien pusiera el contador a
  // cero, la version rota se reintentaria en cada arranque y los 3 intentos no servirian de nada.
  if (!soyLaDescargada()) return;
  try {
    const p = path.join(dirDescargas(), "estado.json");
    const estado = leerJson(p, {});
    if (estado.intentos) fs.writeFileSync(p, JSON.stringify({ ...estado, intentos: 0 }));
  } catch {}
}

const descargada = buscarDescargada();
if (descargada) {
  try {
    // La versión nueva necesita saber dónde vive el .node (que NO se descarga: es binario de
    // Blackmagic y solo lo instala el instalador con permisos).
    global.__labstreamPluginDir = DIR_INSTALADO;
    require(descargada);
    return; // el resto de este archivo no corre: manda la versión descargada
  } catch (e) {
    console.error("[labstream] la versión descargada no cargó; sigo con la integrada:", e && e.message);
  }
}

const { secondsToOffsetFrames, framesToTimecode, markerColor } = require("./timecode");

// El .node solo existe instalado (lo copia el instalador). Sin él, la ventana funciona como
// checklist (la página lo explica) y los handlers responden un error claro en vez de romper.
let WorkflowIntegration = null;
try {
  // El .node vive SIEMPRE en la carpeta instalada, aunque el código venga de una descarga:
  // es binario de Blackmagic y solo el instalador puede ponerlo ahí.
  const dirNode = DIR_INSTALADO;
  WorkflowIntegration = require(path.join(dirNode, "WorkflowIntegration.node"));
} catch {
  console.warn("WorkflowIntegration.node no está junto a main.js: el puente al timeline queda apagado.");
}

let initialized = false;
let resolveObj = null;
let mainWindow = null;

function getResolve() {
  if (!WorkflowIntegration) throw new Error("El puente con Resolve no está instalado (falta WorkflowIntegration.node).");
  if (!initialized) {
    initialized = Boolean(WorkflowIntegration.Initialize(PLUGIN_ID));
    if (!initialized) throw new Error("Resolve no aceptó la conexión del plugin.");
    // La conexión se logró AHORA (Resolve no estaba listo al arrancar): registra el aviso de
    // cierre en este momento, o la ventana quedaría huérfana al cerrar Resolve.
    registerQuitCallback();
  }
  if (!resolveObj) resolveObj = WorkflowIntegration.GetResolve();
  if (!resolveObj) throw new Error("No se pudo obtener el objeto Resolve.");
  return resolveObj;
}

function getTimeline() {
  const resolve = getResolve();
  const pm = resolve.GetProjectManager();
  const project = pm && pm.GetCurrentProject();
  const timeline = project && project.GetCurrentTimeline();
  if (!timeline) throw new Error("Abre un timeline en la página Edit primero.");
  return { project, timeline };
}

function timelineRate(project, timeline) {
  let fps = 24;
  try {
    const raw = timeline.GetSetting("timelineFrameRate") || (project && project.GetSetting("timelineFrameRate"));
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) fps = n;
  } catch {}
  let drop = false;
  try {
    drop = String(timeline.GetSetting("timelineDropFrameTimecode")) === "1";
  } catch {}
  return { fps, drop };
}

// ── Actualización automática del puente ───────────────────────────────────────
// Descarga los .js de la versión nueva a la carpeta del usuario. NO toca la carpeta instalada
// (necesitaría administrador) ni el .node de Blackmagic.
//
// Qué se acepta y qué no:
//   · Solo HTTPS y solo el origen del panel. Nada de redirecciones a otro sitio.
//   · Cada archivo se compara contra el sha256 que anunció el manifiesto: si no cuadra, se
//     descarta TODO y no se toca el estado. Un archivo a medias o alterado nunca se estrena.
//   · Solo nombres de archivo simples y .js (ni rutas, ni «..», ni binarios).
const ARCHIVOS_PERMITIDOS = /^[a-z0-9._-]+\.js$/i;
const MAX_ARCHIVO = 2 * 1024 * 1024; // 2 MB por archivo: el puente entero son ~40 KB

function bajar(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    // Fuera de casa, solo HTTPS. En desarrollo el panel corre en http://localhost, y ahí se
    // permite — pero hay que pedirlo con el módulo `http`: la excepción existía y aun así se
    // llamaba a https.get, que en un servidor de desarrollo sin TLS falla siempre.
    const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
    if (u.protocol !== "https:" && !local) {
      return reject(new Error("Solo se descarga por HTTPS."));
    }
    const cliente = u.protocol === "https:" ? https : http;
    const req = cliente.get(u, { timeout: 25000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("El servidor respondió " + res.statusCode));
      }
      const trozos = [];
      let total = 0;
      res.on("data", (d) => {
        total += d.length;
        if (total > MAX_ARCHIVO) {
          req.destroy();
          return reject(new Error("Archivo demasiado grande."));
        }
        trozos.push(d);
      });
      res.on("end", () => resolve(Buffer.concat(trozos)));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("Se agotó el tiempo de espera.")); });
    req.on("error", reject);
  });
}

async function descargarActualizacion() {
  const base = new URL(PANEL_URL).origin;
  const manifiesto = JSON.parse((await bajar(base + "/api/resolve-plugin/version")).toString("utf8"));
  if (!manifiesto || !manifiesto.ok || !manifiesto.version) throw new Error("El servidor no anuncia ninguna versión.");
  if (comparaVersion(manifiesto.version, VERSION) <= 0) return { ok: true, state: "al-dia", version: VERSION };

  // Memoria de lo que ya pasó con ESTA misma versión. Sin esto, cada llamada volvía a bajarla
  // entera y reescribía el estado con intentos:0 — el panel llama solo, así que una versión que
  // no arranca se redescargaba en bucle y el contador nunca llegaba a tres.
  const estadoPrevio = leerJson(path.join(dirDescargas(), "estado.json"), {});
  if (estadoPrevio.version === manifiesto.version) {
    if (estadoPrevio.mala) return { ok: false, error: "Esa versión ya se descartó porque no arranca." };
    if ((estadoPrevio.intentos || 0) >= 3) return { ok: false, error: "Esa versión no arrancó tras varios intentos." };
    // Ya está en disco esperando el reinicio: no hay nada que volver a bajar.
    if (fs.existsSync(path.join(dirDescargas(), manifiesto.version, "main.js"))) {
      return { ok: true, state: "descargada", version: manifiesto.version };
    }
  }
  const archivos = Array.isArray(manifiesto.files) ? manifiesto.files : [];
  if (archivos.length === 0) throw new Error("La versión anunciada no trae archivos.");

  // Se descarga TODO en memoria y se verifica ANTES de escribir nada: así no puede quedar una
  // versión a medias en disco si se cae la red a mitad.
  const verificados = [];
  for (const f of archivos) {
    const nombre = String(f && f.name);
    if (!ARCHIVOS_PERMITIDOS.test(nombre)) throw new Error("Nombre de archivo no permitido: " + nombre);
    const datos = await bajar(base + "/plugin/" + encodeURIComponent(manifiesto.version) + "/" + nombre);
    const hash = crypto.createHash("sha256").update(datos).digest("hex");
    if (hash !== String(f.sha256).toLowerCase()) throw new Error("La firma de " + nombre + " no coincide.");
    verificados.push({ nombre, datos });
  }

  const destino = path.join(dirDescargas(), manifiesto.version);
  fs.mkdirSync(destino, { recursive: true });
  for (const v of verificados) fs.writeFileSync(path.join(destino, v.nombre), v.datos);
  fs.writeFileSync(
    path.join(dirDescargas(), "estado.json"),
    JSON.stringify({ version: manifiesto.version, intentos: 0, descargadaEl: new Date().toISOString() }),
  );
  return { ok: true, state: "descargada", version: manifiesto.version };
}

ipcMain.handle("ls:update", async () => {
  try {
    return await descargarActualizacion();
  } catch (e) {
    return { ok: false, error: (e && e.message) || "No se pudo actualizar." };
  }
});

// ── Handlers IPC (validan sus datos: vienen del renderer, que carga una página remota) ──

ipcMain.handle("ls:jump", (_e, args) => {
  try {
    const seconds = Number(args && args.seconds);
    const offset = Number(args && args.offsetSeconds) || 0;
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60 * 60 * 24) {
      return { ok: false, error: "Timecode inválido." };
    }
    const { project, timeline } = getTimeline();
    const { fps, drop } = timelineRate(project, timeline);
    const frame = Math.trunc(timeline.GetStartFrame()) + secondsToOffsetFrames(seconds, fps) + secondsToOffsetFrames(offset, fps);
    const tc = framesToTimecode(Math.max(0, frame), fps, drop);
    const ok = Boolean(timeline.SetCurrentTimecode(tc));
    return ok ? { ok, timecode: tc } : { ok, error: `Resolve no aceptó el salto a ${tc}. ¿Estás en Edit o Color?` };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle("ls:markers", (_e, args) => {
  try {
    const items = Array.isArray(args && args.items) ? args.items : [];
    const opts = (args && args.opts) || {};
    const offset = Number(opts.offsetSeconds) || 0;
    const includeResolved = opts.includeResolved !== false;
    const { project, timeline } = timelineAndRateForMarkers();

    const wanted = new Map();
    for (const it of items.slice(0, 500)) {
      if (!it || typeof it.id !== "string" || !/^[A-Za-z0-9_-]{10,40}$/.test(it.id)) continue;
      if (it.seconds == null || !Number.isFinite(Number(it.seconds))) continue;
      if (it.resolved && !includeResolved) continue;
      wanted.set(MARKER_PREFIX + it.id, it);
    }

    const { fps, drop: _drop } = timelineRate(project, timeline);
    const start = Math.trunc(timeline.GetStartFrame());
    const end = Math.trunc(timeline.GetEndFrame());
    const span = Math.max(0, end - start - 1);

    // 1) Retira TODOS los marcadores nuestros (posición/color frescos y limpieza de los
    //    que ya no aplican). Los marcadores del editor no se tocan.
    let removed = 0;
    const existing = timeline.GetMarkers() || {};
    for (const frameId of Object.keys(existing)) {
      let cd = (existing[frameId] && existing[frameId].customData) || "";
      if (!cd) {
        try {
          cd = timeline.GetMarkerCustomData(Number(frameId)) || "";
        } catch {}
      }
      if (typeof cd === "string" && cd.startsWith(MARKER_PREFIX)) {
        timeline.DeleteMarkerByCustomData(cd);
        removed += 1;
      }
    }

    // 2) Frames ocupados por marcadores AJENOS (Resolve permite un marcador por frame).
    const used = new Set();
    const after = timeline.GetMarkers() || {};
    for (const frameId of Object.keys(after)) used.add(Number(frameId));

    // 3) Pinta los nuestros, corriéndose hasta 5 frames si el sitio está tomado.
    let created = 0;
    let failed = 0;
    const sorted = [...wanted.entries()].sort((a, b) => Number(a[1].seconds) - Number(b[1].seconds));
    for (const [cd, it] of sorted) {
      const base = secondsToOffsetFrames(Number(it.seconds), fps) + secondsToOffsetFrames(offset, fps);
      const frame = Math.min(Math.max(0, base), span);
      let placed = false;
      for (let probe = 0; probe <= 5 && !placed; probe++) {
        const f = frame + probe;
        if (f > span || used.has(f)) continue;
        const body = String(it.body || "").slice(0, 4000);
        const state = it.resolved ? "HECHA" : it.priority === "SUGERENCIA" ? "Sugerencia" : "Obligatoria";
        // author/version también se acotan: vienen del renderer (página remota) igual que body.
        const author = String(it.author || "").slice(0, 120);
        const ver = Number.isFinite(Number(it.version)) && it.version != null ? Number(it.version) : "?";
        let note = `${body}\n— ${author} · ${state} · v${ver}`;
        if (it.hasDrawing) note += "\n(Tiene captura del cliente: mírala en el panel)";
        const name = "LS · " + (body.slice(0, 58) || "corrección");
        if (timeline.AddMarker(f, markerColor(it), name, note, 1, cd)) {
          used.add(f);
          created += 1;
          placed = true;
        }
      }
      if (!placed) failed += 1;
    }
    return { ok: true, created, removed, failed };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

function timelineAndRateForMarkers() {
  return getTimeline();
}

ipcMain.handle("ls:info", () => {
  try {
    const { project, timeline } = getTimeline();
    const { fps, drop } = timelineRate(project, timeline);
    return { ok: true, timeline: String(timeline.GetName()), fps, dropFrame: drop };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

// ── Ventana ──

// Solo se navega dentro del dominio del estudio (app + SSO). Cualquier otro enlace se abre
// en el navegador por defecto, nunca dentro del panel.
function allowedUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const panel = new URL(PANEL_URL);
    if (u.origin === panel.origin) return true;
    return u.protocol === "https:" && (u.hostname === "labstreamsas.com" || u.hostname.endsWith(".labstreamsas.com"));
  } catch {
    return false;
  }
}

// Resolve no permite acoplar ventanas de terceros a sus paneles, así que el panel se comporta
// como PALETA: siempre visible sobre Resolve (no se esconde al hacer clic en el timeline; F2 lo
// alterna), recuerda posición/tamaño entre sesiones y, la primera vez, se pega al borde derecho
// de la pantalla como una barra lateral.
function stateFile() {
  return path.join(app.getPath("userData"), "labstream-panel-window.json");
}

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    return s && typeof s === "object" ? s : {};
  } catch {
    return {};
  }
}

function saveWindowState() {
  if (!mainWindow) return;
  try {
    fs.writeFileSync(
      stateFile(),
      JSON.stringify({ bounds: mainWindow.getNormalBounds(), alwaysOnTop: mainWindow.isAlwaysOnTop() }),
    );
  } catch {}
}

// Solo se restauran coordenadas que sigan cayendo en un monitor conectado (si el editor
// desenchufó la segunda pantalla, el panel no puede renacer fuera del escritorio).
function sanitizeBounds(b) {
  if (!b || typeof b.x !== "number" || typeof b.y !== "number" || !(b.width > 200) || !(b.height > 200)) return null;
  const a = screen.getDisplayMatching(b).workArea;
  const visible = b.x < a.x + a.width - 60 && b.x + b.width > a.x + 60 && b.y >= a.y - 20 && b.y < a.y + a.height - 60;
  return visible ? b : null;
}

function createWindow() {
  const state = loadWindowState();
  const saved = sanitizeBounds(state.bounds);
  // Primera vez: barra lateral pegada al borde derecho del monitor principal, a toda altura.
  const wa = screen.getPrimaryDisplay().workArea;
  const fallback = { width: 440, height: wa.height, x: wa.x + wa.width - 440, y: wa.y };
  const bounds = saved ?? fallback;
  const alwaysOnTop = state.alwaysOnTop !== false; // por defecto, encima (como paleta acoplada)

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 360,
    minHeight: 520,
    alwaysOnTop,
    autoHideMenuBar: true,
    backgroundColor: "#0b0b0e",
    title: "Labstream · Correcciones",
    // El icono de Labstream en la barra de tareas / dock. En Windows manda el .ico (trae los
    // tamaños pequeños ya dibujados); en Mac y Linux, el PNG. Si faltara, Electron usa el suyo.
    icon: path.join(DIR_INSTALADO, process.platform === "win32" ? "icon.ico" : "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // La cookie de sesión sobrevive a reinicios: el editor inicia sesión UNA vez.
      partition: "persist:labstream",
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  // Nivel "floating": flota sobre la ventana normal de Resolve sin pelearse con menús/diálogos.
  if (alwaysOnTop) mainWindow.setAlwaysOnTop(true, "floating");

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!allowedUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // F5 / Cmd+R recargan el panel; F2 alterna «siempre encima» (modo paleta ↔ ventana normal).
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const reload = input.key === "F5" || ((input.control || input.meta) && input.key.toLowerCase() === "r");
    if (reload) {
      event.preventDefault();
      mainWindow.webContents.loadURL(PANEL_URL);
      return;
    }
    if (input.key === "F2") {
      event.preventDefault();
      const next = !mainWindow.isAlwaysOnTop();
      mainWindow.setAlwaysOnTop(next, "floating");
      saveWindowState();
    }
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 /* aborted por otra navegación: no es un fallo */) {
      // DIR_INSTALADO y no __dirname: offline.html NO viaja en la autoactualización (solo .js),
      // así que la copia descargada tiene que ir a buscarlo a la carpeta instalada. Cargando
      // un archivo inexistente, la ventana de «sin conexión» no aparecía nunca.
      mainWindow.loadFile(path.join(DIR_INSTALADO, "offline.html"), { query: { url: PANEL_URL, desc: String(desc || code) } });
    }
  });

  mainWindow.on("close", saveWindowState);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadURL(PANEL_URL);
  // Llegar hasta aquí es la prueba de que esta versión arranca bien: se pone a cero el contador
  // de intentos fallidos (ver buscarDescargada).
  marcarArranqueBueno();
}

// CleanUp EXACTAMENTE una vez, pase lo que pase: cerrar la ventana emite window-all-closed,
// pero cerrar RESOLVE dispara ResolveQuit → app.quit(), camino en el que window-all-closed
// NO se emite (Electron); will-quit es la red de seguridad común a ambos.
let cleaned = false;
let watchdog = null;
function cleanupOnce() {
  if (cleaned) return;
  cleaned = true;
  if (watchdog) { clearInterval(watchdog); watchdog = null; }
  try {
    if (WorkflowIntegration && initialized) WorkflowIntegration.CleanUp();
  } catch {}
}

// Aviso OFICIAL de cierre de Resolve (ResolveQuit): cuando el editor cierra DaVinci, cerramos el
// panel con él. Idempotente y llamado tanto al arrancar como cuando la conexión se logra más tarde
// (getResolve perezoso). ANTES solo se registraba al arrancar; si Resolve aún no estaba listo, el
// panel quedaba huérfano al cerrarlo — ese era el bug de "sigue corriendo tras cerrar Resolve".
let quitRegistered = false;
function registerQuitCallback() {
  if (quitRegistered || !WorkflowIntegration || !initialized) return;
  try {
    WorkflowIntegration.RegisterCallback("ResolveQuit", () => {
      cleanupOnce();
      app.quit();
    });
    quitRegistered = true;
  } catch {}
}

// RESPALDO a prueba de balas: cierra el panel cuando el proceso que lo lanzó (DaVinci Resolve)
// desaparece, aunque ResolveQuit no llegue (p. ej. el editor nunca usó el panel, así que el
// puente jamás se inicializó). Coste nulo: consulta la existencia de un PID cada 5 s.
// process.kill(pid, 0) NO mata — solo comprueba (lanza ESRCH si el proceso ya no existe).
function startLauncherWatchdog() {
  const launcherPid = process.ppid; // el proceso que lanzó el panel = DaVinci Resolve
  if (!launcherPid || launcherPid <= 1) return; // sin padre claro (arranque suelto): no vigilar
  try {
    process.kill(launcherPid, 0); // ¿existe? (signal 0 NO mata, solo consulta)
  } catch {
    return; // el padre ya no existía al arrancar: no vigilar (evita un autocierre inmediato)
  }
  watchdog = setInterval(() => {
    try {
      process.kill(launcherPid, 0); // sigue vivo → nada que hacer
    } catch (e) {
      if (e && e.code === "ESRCH") { // el lanzador (Resolve) se cerró → cerramos el panel con él
        cleanupOnce();
        app.quit();
      }
    }
  }, 5000);
  if (watchdog.unref) watchdog.unref(); // el timer por sí solo no mantiene vivo el proceso
}

app.whenReady().then(() => {
  // Conexión con Resolve al arrancar (si falla, el panel sigue como checklist web).
  try {
    if (WorkflowIntegration) {
      initialized = Boolean(WorkflowIntegration.Initialize(PLUGIN_ID));
      registerQuitCallback();
    }
  } catch (err) {
    console.warn("No se pudo inicializar WorkflowIntegration:", err);
  }
  startLauncherWatchdog();
  // createWindow dentro del try: un fallo al crear la ventana no debe quedar como
  // unhandled rejection (aunque sea un proceso aparte y nunca puede tumbar Resolve).
  try {
    createWindow();
  } catch (err) {
    console.error("No se pudo crear la ventana del panel:", err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  cleanupOnce();
  app.quit();
});
app.on("will-quit", () => cleanupOnce());
