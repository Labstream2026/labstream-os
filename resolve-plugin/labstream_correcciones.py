#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Labstream Correcciones — panel para DaVinci Resolve (Windows y Mac).

Trae las correcciones de un entregable de os.labstreamsas.com al timeline abierto:
  - Lista el checklist (prioridad, autor, timecode, estado) dentro de Resolve.
  - «Ir» salta el cabezal al timecode exacto de la corrección seleccionada.
  - «Marcar hecha / Reabrir» sincroniza el estado con la web (avisa al equipo).
  - «Sincronizar marcadores» pinta cada corrección como marcador del timeline:
      rojo = obligatoria pendiente · amarillo = sugerencia pendiente · verde = hecha.

Instalación: copiar este archivo a la carpeta de scripts de Resolve (ver README) y abrirlo
desde Workspace ▸ Scripts ▸ labstream_correcciones. Requiere Python 3 instalado; funciona
en Resolve 18+ (gratis y Studio). Autorización = el mismo enlace de revisión /review/<token>
que el equipo ya comparte: se pega una vez y queda recordado por proyecto de Resolve.

Uso fuera de Resolve:  python3 labstream_correcciones.py --selftest  (pruebas de la
conversión de timecode y del parseo de enlaces, sin tocar Resolve ni la red).
"""

import json
import os
import re
import ssl
import sys

try:
    from urllib import request as _rq
    from urllib.parse import quote as _urlquote
    from urllib.error import URLError, HTTPError
except ImportError:  # Python 2 (Resolve viejo): no soportado
    raise RuntimeError("Este script necesita Python 3 (Resolve 18 o superior).")

DEFAULT_BASE = "https://os.labstreamsas.com"
CONFIG_PATH = os.path.expanduser("~/.labstream-resolve.json")
MARKER_PREFIX = "lsos:"
USER_AGENT = "LabstreamResolve/1.0 (+os.labstreamsas.com)"

# ──────────────────────────── utilidades puras (testeables) ────────────────────────────

def parse_review_link(raw):
    """Devuelve (base_url, token) a partir del enlace /review/<token> o de un token pelado."""
    raw = (raw or "").strip()
    if not raw:
        return None, None
    m = re.match(r"^(https?://[^/]+)/review/([^/?#\s]+)", raw)
    if m:
        return m.group(1), m.group(2)
    # token pelado (base64url.exp.firma)
    if re.match(r"^[A-Za-z0-9_-]+\.\d+\.[A-Za-z0-9_-]+$", raw):
        return DEFAULT_BASE, raw
    return None, None


def seconds_to_offset_frames(seconds, fps):
    """Segundos del video exportado → frames de OFFSET desde el inicio del timeline."""
    return int(round(float(seconds) * float(fps)))


def frames_to_timecode(total_frames, fps, drop_frame=False):
    """Frames ABSOLUTOS → timecode 'HH:MM:SS:FF' (o con ';' final si es drop-frame).

    fps es la tasa real (23.976, 29.97…); el conteo de frames del TC usa la nominal
    redondeada (24, 30…). El algoritmo drop-frame descarta 2 frames por minuto (4 en
    59.94) salvo cada décimo minuto — el estándar SMPTE.
    """
    fps = float(fps)
    nominal = int(round(fps))
    frames = int(total_frames)
    if drop_frame and nominal in (30, 60):
        drop = 2 if nominal == 30 else 4
        fpm = nominal * 60 - drop  # frames por minuto CON descarte (minutos 1-9)
        fp10 = fpm * 10 + drop     # frames por bloque de 10 min (el minuto 0 va completo)
        tens, rem = divmod(frames, fp10)
        if rem < nominal * 60:
            # dentro del minuto 0 del bloque: sin descarte
            total_min = tens * 10
            fim = rem
        else:
            m2 = rem - nominal * 60
            total_min = tens * 10 + 1 + m2 // fpm
            fim = m2 % fpm + drop  # re-inserta los frames descartados para el desglose ss;ff
        hh = total_min // 60
        mm = total_min % 60
        ss = fim // nominal
        ff = fim % nominal
        return "%02d:%02d:%02d;%02d" % (hh, mm, ss, ff)
    hh = frames // (3600 * nominal)
    rem = frames % (3600 * nominal)
    mm = rem // (60 * nominal)
    rem = rem % (60 * nominal)
    ss = rem // nominal
    ff = rem % nominal
    return "%02d:%02d:%02d:%02d" % (hh, mm, ss, ff)


def format_video_seconds(seconds):
    """Segundos → 'm:ss' (o 'h:mm:ss'), como se ve en el portal de revisión."""
    if seconds is None:
        return "—"
    s = int(round(float(seconds)))
    if s >= 3600:
        return "%d:%02d:%02d" % (s // 3600, (s % 3600) // 60, s % 60)
    return "%d:%02d" % (s // 60, s % 60)


def marker_color(comment):
    if comment.get("resolved"):
        return "Green"
    return "Yellow" if comment.get("priority") == "SUGERENCIA" else "Red"


def is_checklist_item(c):
    """Punto accionable del checklist: ni nota suelta, ni respuesta de hilo."""
    return not c.get("isNote") and not c.get("parentId")


def sort_key(c):
    tc = c.get("timecode")
    return (tc is None, tc if tc is not None else 0.0, c.get("createdAt") or "")


# ──────────────────────────── configuración persistente ────────────────────────────

def load_config():
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            return cfg if isinstance(cfg, dict) else {}
    except Exception:
        return {}


def save_config(cfg):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    except Exception:
        pass  # la config es comodidad, nunca debe romper el panel


# ──────────────────────────── HTTP hacia Labstream OS ────────────────────────────

def _do_request(url, payload, insecure):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = _rq.Request(url, data=data, headers={
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        "Accept": "application/json",
    })
    ctx = ssl._create_unverified_context() if insecure else None
    return _rq.urlopen(req, timeout=25, context=ctx)


def http_json(url, payload=None):
    """GET (payload=None) o POST JSON. Devuelve (dict, error_str). Si el sistema no tiene
    certificados raíz (típico del Python de python.org en Mac sin ejecutar «Install
    Certificates.command»), reintenta sin verificación TLS y lo deja anotado en la config."""
    cfg = load_config()
    insecure = bool(cfg.get("insecureTLS"))
    try:
        resp = _do_request(url, payload, insecure)
    except HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8"))
            return None, body.get("error") or ("Error HTTP %d" % e.code)
        except Exception:
            return None, "Error HTTP %d" % e.code
    except URLError as e:
        if isinstance(getattr(e, "reason", None), ssl.SSLError) and not insecure:
            try:
                resp = _do_request(url, payload, True)
                cfg["insecureTLS"] = True
                save_config(cfg)
            except Exception:
                return None, "Error de certificados TLS: en Mac ejecuta «Install Certificates.command» de tu Python."
        else:
            return None, "Sin conexión con el servidor (%s)" % getattr(e, "reason", e)
    except Exception as e:
        return None, "Error de red: %s" % e
    try:
        return json.loads(resp.read().decode("utf-8")), None
    except Exception:
        return None, "Respuesta inesperada del servidor."


def fetch_review(base, token):
    return http_json("%s/api/resolve-plugin?t=%s" % (base, _urlquote(token, safe="")))


def post_resolved(base, token, comment_id, resolved, editor_name):
    return http_json("%s/api/resolve-plugin" % base, {
        "t": token,
        "commentId": comment_id,
        "resolved": bool(resolved),
        "editorName": editor_name or "",
    })


# ──────────────────────────── acceso a Resolve ────────────────────────────

def get_resolve_env():
    """Devuelve (resolve, fusion, bmd_mod) tanto dentro de Resolve como fuera (Studio)."""
    g = globals()
    rsv = g.get("resolve")
    fus = g.get("fusion")
    bmd_mod = g.get("bmd")
    if rsv is None:
        try:
            import DaVinciResolveScript as dvr  # ejecución EXTERNA (requiere Studio)
            rsv = dvr.scriptapp("Resolve")
        except ImportError:
            rsv = None
    if rsv is not None and fus is None:
        fus = rsv.Fusion()
    if bmd_mod is None:
        try:
            import fusionscript as bmd_mod
        except ImportError:
            bmd_mod = None
    return rsv, fus, bmd_mod


def current_timeline(rsv):
    pm = rsv.GetProjectManager()
    proj = pm.GetCurrentProject() if pm else None
    tl = proj.GetCurrentTimeline() if proj else None
    return proj, tl


def timeline_rate(proj, tl):
    """(fps real, drop_frame) del timeline abierto (cae al ajuste del proyecto)."""
    raw = None
    try:
        raw = tl.GetSetting("timelineFrameRate")
    except Exception:
        pass
    if not raw and proj:
        raw = proj.GetSetting("timelineFrameRate")
    try:
        fps = float(raw)
    except (TypeError, ValueError):
        fps = 24.0
    df = False
    try:
        df = str(tl.GetSetting("timelineDropFrameTimecode")) == "1"
    except Exception:
        pass
    return fps, df


# ──────────────────────────── marcadores ────────────────────────────

def sync_markers(tl, proj, comments, offset_seconds, include_resolved):
    """Reescribe los marcadores lsos:* del timeline según el checklist actual.
    Devuelve (creados, fallidos, borrados)."""
    fps, _df = timeline_rate(proj, tl)
    start = int(tl.GetStartFrame())
    end = int(tl.GetEndFrame())
    span = max(0, end - start - 1)

    wanted = {}
    for c in comments:
        if not is_checklist_item(c) or c.get("timecode") is None:
            continue
        if c.get("resolved") and not include_resolved:
            continue
        wanted[MARKER_PREFIX + c["id"]] = c

    # Limpia marcadores nuestros que ya no aplican (correcciones borradas, filtro de
    # versión, «sin hechas»…) y TODOS los que vamos a re-pintar (posición/color frescos).
    removed = 0
    markers = tl.GetMarkers() or {}
    for frame_id in list(markers.keys()):
        info = markers.get(frame_id) or {}
        cd = info.get("customData") or ""
        if not cd:
            try:
                cd = tl.GetMarkerCustomData(frame_id) or ""
            except Exception:
                cd = ""
        if cd.startswith(MARKER_PREFIX):
            tl.DeleteMarkerByCustomData(cd)
            removed += 1

    # Frames ocupados por marcadores AJENOS (Resolve permite un marcador por frame).
    used = set()
    for frame_id, info in (tl.GetMarkers() or {}).items():
        used.add(int(frame_id))

    created, failed = 0, 0
    for cd, c in sorted(wanted.items(), key=lambda kv: kv[1].get("timecode") or 0):
        frame = seconds_to_offset_frames(c["timecode"], fps) + seconds_to_offset_frames(offset_seconds, fps)
        frame = max(0, min(frame, span))
        # Si el frame está tomado, corre hasta 5 frames a la derecha.
        placed = False
        for probe in range(6):
            f = frame + probe
            if f > span or f in used:
                continue
            note_state = "HECHA" if c.get("resolved") else ("Sugerencia" if c.get("priority") == "SUGERENCIA" else "Obligatoria")
            note = "%s\n— %s · %s · v%s" % (
                c.get("body") or "",
                c.get("authorName") or "",
                note_state,
                c.get("versionNumber") or "?",
            )
            if c.get("hasDrawing"):
                note += "\n(Tiene dibujo del cliente: míralo en la web)"
            name = "LS · " + ((c.get("body") or "")[:58] or "corrección")
            if tl.AddMarker(f, marker_color(c), name, note, 1, cd):
                used.add(f)
                created += 1
                placed = True
                break
        if not placed:
            failed += 1
    return created, failed, removed


# ──────────────────────────── panel (UI Manager) ────────────────────────────

WIN_ID = "LabstreamCorrecciones"

COL_STATE, COL_TC, COL_PRIO, COL_AUTHOR, COL_BODY, COL_ID = range(6)


def run_panel():
    rsv, fus, bmd_mod = get_resolve_env()
    if rsv is None or fus is None or bmd_mod is None:
        print("Este script debe ejecutarse DENTRO de DaVinci Resolve (Workspace ▸ Scripts).")
        print("Ejecución externa: requiere Resolve Studio abierto y las rutas de scripting configuradas.")
        return

    ui = fus.UIManager
    disp = bmd_mod.UIDispatcher(ui)

    cfg = load_config()
    proj, _tl = current_timeline(rsv)
    proj_name = proj.GetName() if proj else ""
    remembered = (cfg.get("projects") or {}).get(proj_name) or cfg.get("lastLink") or ""

    win = disp.AddWindow(
        {
            "ID": WIN_ID,
            "WindowTitle": "Labstream · Correcciones",
            "Geometry": [200, 200, 860, 560],
        },
        ui.VGroup([
            ui.HGroup({"Weight": 0}, [
                ui.LineEdit({"ID": "Link", "PlaceholderText": "Pega el enlace de revisión (https://os.labstreamsas.com/review/…)", "Text": remembered, "Weight": 1}),
                ui.Button({"ID": "Load", "Text": "Cargar", "Weight": 0}),
            ]),
            ui.HGroup({"Weight": 0}, [
                ui.Label({"ID": "Head", "Text": "Pega el enlace de revisión del entregable y pulsa Cargar.", "WordWrap": True, "Weight": 1}),
            ]),
            ui.HGroup({"Weight": 0}, [
                ui.Label({"Text": "Versión:", "Weight": 0}),
                ui.ComboBox({"ID": "Version", "Weight": 0, "Events": {"CurrentIndexChanged": True}}),
                ui.CheckBox({"ID": "OnlyPending", "Text": "Solo pendientes", "Checked": False, "Weight": 0, "Events": {"Clicked": True}}),
                ui.Label({"Text": "   Tu nombre:", "Weight": 0}),
                ui.LineEdit({"ID": "Editor", "Text": cfg.get("editorName") or "", "PlaceholderText": "para el aviso al equipo", "Weight": 0, "MinimumSize": [140, 0]}),
                ui.Label({"Text": "   Offset (s):", "Weight": 0}),
                ui.LineEdit({"ID": "Offset", "Text": str(cfg.get("offsetSeconds") or 0), "Weight": 0, "MinimumSize": [50, 0]}),
                ui.Label({"Text": "", "Weight": 1}),
            ]),
            ui.Tree({
                "ID": "List",
                "SortingEnabled": False,
                "RootIsDecorated": True,
                "AlternatingRowColors": True,
                "Events": {"ItemDoubleClicked": True},
                "Weight": 1,
            }),
            ui.HGroup({"Weight": 0}, [
                ui.Button({"ID": "Go", "Text": "Ir al timecode", "Weight": 0}),
                ui.Button({"ID": "Toggle", "Text": "Marcar hecha / Reabrir", "Weight": 0}),
                ui.Button({"ID": "Markers", "Text": "Sincronizar marcadores", "Weight": 0}),
                ui.CheckBox({"ID": "InclResolved", "Text": "Marcar también las hechas (verde)", "Checked": True, "Weight": 0}),
                ui.Label({"Text": "", "Weight": 1}),
                ui.Button({"ID": "Refresh", "Text": "Refrescar", "Weight": 0}),
            ]),
            ui.HGroup({"Weight": 0}, [
                ui.Label({"ID": "Status", "Text": "Doble clic en una corrección = ir a su timecode.", "WordWrap": True, "Weight": 1}),
            ]),
        ]),
    )

    items = win.GetItems()
    tree = items["List"]
    hdr = tree.NewItem()
    for idx, title in ((COL_STATE, "Estado"), (COL_TC, "TC"), (COL_PRIO, "Prioridad"), (COL_AUTHOR, "Autor"), (COL_BODY, "Corrección"), (COL_ID, "")):
        hdr.Text[idx] = title
    tree.SetHeaderItem(hdr)
    tree.ColumnCount = 6
    tree.ColumnWidth[COL_STATE] = 66
    tree.ColumnWidth[COL_TC] = 56
    tree.ColumnWidth[COL_PRIO] = 82
    tree.ColumnWidth[COL_AUTHOR] = 110
    tree.ColumnWidth[COL_BODY] = 470
    tree.ColumnWidth[COL_ID] = 0

    state = {"base": None, "token": None, "data": None, "byId": {}}

    def status(msg):
        items["Status"].Text = msg

    def editor_name():
        return (items["Editor"].Text or "").strip()

    def offset_seconds():
        try:
            return float((items["Offset"].Text or "0").replace(",", "."))
        except ValueError:
            return 0.0

    def persist():
        cfg = load_config()
        cfg["lastLink"] = items["Link"].Text.strip()
        cfg["editorName"] = editor_name()
        cfg["offsetSeconds"] = offset_seconds()
        p, _t = current_timeline(rsv)
        if p:
            cfg.setdefault("projects", {})[p.GetName()] = cfg["lastLink"]
        save_config(cfg)

    def selected_versions():
        """None = todas; int = una versión concreta."""
        idx = int(items["Version"].CurrentIndex)
        if idx <= 0 or not state["data"]:
            return None
        try:
            return int(items["Version"].CurrentText.lstrip("v"))
        except ValueError:
            return None

    def visible_comments():
        if not state["data"]:
            return []
        ver = selected_versions()
        only_pending = bool(items["OnlyPending"].Checked)
        out = []
        for c in state["data"]["comments"]:
            if not is_checklist_item(c):
                continue
            if ver is not None and c.get("versionNumber") not in (ver, None):
                continue
            if only_pending and c.get("resolved"):
                continue
            out.append(c)
        return sorted(out, key=sort_key)

    def replies_of(parent_id):
        if not state["data"]:
            return []
        return [c for c in state["data"]["comments"] if c.get("parentId") == parent_id]

    def repaint_list():
        tree.Clear()
        for c in visible_comments():
            it = tree.NewItem()
            it.Text[COL_STATE] = "✔ Hecha" if c.get("resolved") else "○ Pendiente"
            it.Text[COL_TC] = format_video_seconds(c.get("timecode"))
            it.Text[COL_PRIO] = "Sugerencia" if c.get("priority") == "SUGERENCIA" else "Obligatoria"
            it.Text[COL_AUTHOR] = c.get("authorName") or ""
            body = c.get("body") or ""
            if c.get("hasDrawing"):
                body = "✏️ " + body
            it.Text[COL_BODY] = body
            it.Text[COL_ID] = c["id"]
            tree.AddTopLevelItem(it)
            for r in replies_of(c["id"]):
                ch = tree.NewItem()
                ch.Text[COL_STATE] = "↳"
                ch.Text[COL_AUTHOR] = r.get("authorName") or ""
                ch.Text[COL_BODY] = r.get("body") or ""
                ch.Text[COL_ID] = ""
                it.AddChild(ch)
        # Notas sueltas (sin timecode): contexto útil, no accionable.
        notes = [c for c in (state["data"]["comments"] if state["data"] else []) if c.get("isNote") and not c.get("parentId")]
        for n in notes:
            it = tree.NewItem()
            it.Text[COL_STATE] = "Nota"
            it.Text[COL_TC] = "—"
            it.Text[COL_AUTHOR] = n.get("authorName") or ""
            it.Text[COL_BODY] = n.get("body") or ""
            it.Text[COL_ID] = ""
            tree.AddTopLevelItem(it)

    def repaint_header():
        d = (state["data"] or {}).get("deliverable")
        if not d:
            return
        pending = sum(1 for c in state["data"]["comments"] if is_checklist_item(c) and not c.get("resolved"))
        total = sum(1 for c in state["data"]["comments"] if is_checklist_item(c))
        items["Head"].Text = "«%s» · %s · %s — %d de %d correcciones pendientes" % (
            d.get("name") or "", d.get("projectName") or "", d.get("status") or "", pending, total,
        )

    def fill_versions():
        combo = items["Version"]
        try:
            combo.Clear()
        except Exception:
            pass  # Resolve muy viejo sin Clear(): duplicaría entradas al refrescar, no rompe
        combo.AddItem("Todas las versiones")
        if state["data"]:
            for v in state["data"]["versions"]:
                combo.AddItem("v%d" % v["number"])
        combo.CurrentIndex = 0

    def do_load(ev=None):
        base, token = parse_review_link(items["Link"].Text)
        if not token:
            status("Ese enlace no parece un enlace de revisión (/review/…). Revísalo.")
            return
        status("Cargando correcciones…")
        data, err = fetch_review(base, token)
        if err or not data or not data.get("ok"):
            status("No se pudo cargar: %s" % (err or (data or {}).get("error") or "error desconocido"))
            return
        state.update({"base": base, "token": token, "data": data})
        state["byId"] = {c["id"]: c for c in data["comments"]}
        fill_versions()
        repaint_header()
        repaint_list()
        persist()
        status("Correcciones cargadas. Doble clic para ir al timecode; «Sincronizar marcadores» las pinta en el timeline.")

    def current_comment():
        it = tree.CurrentItem()
        if not it:
            return None
        cid = it.Text[COL_ID]
        return state["byId"].get(cid) if cid else None

    def do_go(ev=None):
        c = current_comment()
        if not c:
            status("Selecciona una corrección de la lista.")
            return
        if c.get("timecode") is None:
            status("Esa entrada no tiene timecode (es una nota general).")
            return
        p, tl = current_timeline(rsv)
        if not tl:
            status("Abre un timeline en la página Edit primero.")
            return
        fps, df = timeline_rate(p, tl)
        frame = int(tl.GetStartFrame()) + seconds_to_offset_frames(c["timecode"], fps) + seconds_to_offset_frames(offset_seconds(), fps)
        tc = frames_to_timecode(frame, fps, df)
        if tl.SetCurrentTimecode(tc):
            status("Cabezal en %s (%s del video)." % (tc, format_video_seconds(c["timecode"])))
        else:
            status("Resolve no aceptó el salto a %s. ¿Estás en la página Edit o Color?" % tc)

    def do_toggle(ev=None):
        c = current_comment()
        if not c:
            status("Selecciona una corrección de la lista.")
            return
        if not state["token"]:
            status("Primero carga un enlace de revisión.")
            return
        target = not c.get("resolved")
        data, err = post_resolved(state["base"], state["token"], c["id"], target, editor_name())
        if err or not data or not data.get("ok"):
            status("No se pudo actualizar: %s" % (err or (data or {}).get("error") or "error desconocido"))
            return
        c["resolved"] = target
        c["resolvedAt"] = None
        repaint_list()
        repaint_header()
        persist()
        status("Corrección %s.%s" % ("marcada como hecha (el equipo queda avisado)" if target else "reabierta",
                                     "" if editor_name() else " Tip: escribe tu nombre para que el aviso diga quién fue."))

    def do_markers(ev=None):
        if not state["data"]:
            status("Primero carga un enlace de revisión.")
            return
        p, tl = current_timeline(rsv)
        if not tl:
            status("Abre un timeline en la página Edit primero.")
            return
        created, failed, removed = sync_markers(tl, p, visible_comments(), offset_seconds(), bool(items["InclResolved"].Checked))
        extra = " · %d sin sitio libre (frame ocupado)" % failed if failed else ""
        status("Marcadores: %d pintados, %d anteriores retirados%s." % (created, removed, extra))
        persist()

    def do_refresh(ev=None):
        if state["token"]:
            do_load()
        else:
            status("Primero carga un enlace de revisión.")

    def on_double(ev):
        do_go()

    def on_filter_change(ev=None):
        if state["data"]:
            repaint_list()

    def on_close(ev):
        persist()
        disp.ExitLoop()

    win.On[WIN_ID].Close = on_close
    win.On["Load"].Clicked = do_load
    win.On["Go"].Clicked = do_go
    win.On["Toggle"].Clicked = do_toggle
    win.On["Markers"].Clicked = do_markers
    win.On["Refresh"].Clicked = do_refresh
    win.On["List"].ItemDoubleClicked = on_double
    win.On["Version"].CurrentIndexChanged = on_filter_change
    win.On["OnlyPending"].Clicked = on_filter_change

    win.Show()
    if remembered:
        do_load()
    disp.RunLoop()
    win.Hide()


# ──────────────────────────── selftest (sin Resolve) ────────────────────────────

def _selftest():
    ok = True

    def check(name, got, want):
        nonlocal ok
        if got != want:
            ok = False
            print("FALLA %s: %r != %r" % (name, got, want))
        else:
            print("ok    %s: %r" % (name, got))

    # parseo de enlaces
    check("link completo", parse_review_link("https://os.labstreamsas.com/review/abc.123.def?x=1"),
          ("https://os.labstreamsas.com", "abc.123.def"))
    check("link http otro host", parse_review_link("http://localhost:3200/review/tok.1.sig"),
          ("http://localhost:3200", "tok.1.sig"))
    check("token pelado", parse_review_link("dGVzdA.1784.firma_-X"), (DEFAULT_BASE, "dGVzdA.1784.firma_-X"))
    check("basura", parse_review_link("hola mundo"), (None, None))

    # segundos → frames de offset
    check("offset 24fps", seconds_to_offset_frames(10, 24), 240)
    check("offset 23.976", seconds_to_offset_frames(10, 23.976), 240)
    check("offset 29.97", seconds_to_offset_frames(60, 29.97), 1798)

    # frames → timecode no-drop
    check("tc 24 arranque 01h", frames_to_timecode(86400, 24, False), "01:00:00:00")
    check("tc 24 +10s", frames_to_timecode(86400 + 240, 24, False), "01:00:10:00")
    check("tc 25 90000", frames_to_timecode(90000, 25, False), "01:00:00:00")
    check("tc 30 medio", frames_to_timecode(30 * 61 + 5, 30, False), "00:01:01:05")

    # drop-frame 29.97: valores canónicos SMPTE
    check("df 1 min", frames_to_timecode(1800, 29.97, True), "00:01:00;02")
    check("df 10 min", frames_to_timecode(17982, 29.97, True), "00:10:00;00")
    check("df 1 h", frames_to_timecode(107892, 29.97, True), "01:00:00;00")
    check("df justo antes", frames_to_timecode(1799, 29.97, True), "00:00:59;29")

    # portal mm:ss
    check("fmt 65s", format_video_seconds(65), "1:05")
    check("fmt 3661s", format_video_seconds(3661), "1:01:01")
    check("fmt none", format_video_seconds(None), "—")

    # colores
    check("color obligatoria", marker_color({"priority": "OBLIGATORIA", "resolved": False}), "Red")
    check("color sugerencia", marker_color({"priority": "SUGERENCIA", "resolved": False}), "Yellow")
    check("color hecha", marker_color({"priority": "OBLIGATORIA", "resolved": True}), "Green")

    print("\nSELFTEST %s" % ("OK" if ok else "CON FALLAS"))
    return 0 if ok else 1


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(_selftest())
    run_panel()
