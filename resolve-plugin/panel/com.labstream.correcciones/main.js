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
const { secondsToOffsetFrames, framesToTimecode, markerColor } = require("./timecode");

const PLUGIN_ID = "com.labstream.correcciones";
const PANEL_URL = process.env.LABSTREAM_PANEL_URL || "https://os.labstreamsas.com/resolve";
const MARKER_PREFIX = "lsos:";

// El .node solo existe instalado (lo copia el instalador). Sin él, la ventana funciona como
// checklist (la página lo explica) y los handlers responden un error claro en vez de romper.
let WorkflowIntegration = null;
try {
  WorkflowIntegration = require("./WorkflowIntegration.node");
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
      mainWindow.loadFile(path.join(__dirname, "offline.html"), { query: { url: PANEL_URL, desc: String(desc || code) } });
    }
  });

  mainWindow.on("close", saveWindowState);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadURL(PANEL_URL);
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
