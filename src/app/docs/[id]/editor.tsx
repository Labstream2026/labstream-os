"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Check, Loader2, MessageSquare, Eye, PenLine, RefreshCw, Download } from "lucide-react";
import type { EditorConfig } from "@/lib/onlyoffice";
import { forceSaveDoc } from "../save-action";

// La instancia del editor: la necesitamos para contestarle (la lista de gente a mencionar).
type DocEditorInstance = { setUsers?: (data: { c: string; users: MentionUser[] }) => void; destroyEditor?: () => void };

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (el: string, config: unknown) => DocEditorInstance };
  }
}

// Gente a la que se puede mencionar con «+» dentro de un comentario.
export type MentionUser = { id: string; name: string; email: string };

// Eventos que el editor de OnlyOffice nos devuelve. No están tipados por la librería (se carga
// por <script> desde el Document Server), así que se declara aquí lo justo para usarlos.
type DocsEvents = {
  onDocumentReady?: () => void;
  onError?: (e: { data?: { errorCode?: number; errorDescription?: string } }) => void;
  onWarning?: (e: { data?: { warningCode?: number; warningDescription?: string } }) => void;
  onDocumentStateChange?: (e: { data?: boolean }) => void;
  onRequestClose?: () => void;
  // El editor pide la lista de gente para el desplegable del «+».
  onRequestUsers?: (e: { data?: { c?: string } }) => void;
  // Alguien mencionó a alguien: trae el comentario y el ancla del punto exacto.
  onRequestSendNotify?: (e: { data?: { actionLink?: unknown; comment?: string; emails?: string[] } }) => void;
};

// Cuánto se espera a que el editor dé señales de vida antes de dar el aviso de fallo. Si el
// Document Server no es alcanzable desde esta máquina, el <script> puede tardar mucho en fallar
// (o no fallar nunca): sin este tope, la pantalla se quedaba en blanco para siempre.
const ARRANQUE_MS = 20_000;
// Cada cuánto se fuerza el guardado mientras hay cambios sin escribir.
const AUTOGUARDADO_MS = 120_000;

type Estado = "cargando" | "listo" | "fallo";

// Los mensajes del Document Server vienen con HTML dentro («…incorrecto.<br>Por favor…»).
// Se limpia para no enseñar etiquetas crudas al usuario.
function limpiar(msg: string): string {
  return msg.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function OnlyOfficeEditor({
  docsUrl,
  config,
  title,
  backHref,
  downloadHref,
  extra,
  mentions,
  onMention,
  presentes,
}: {
  docsUrl: string;
  config: EditorConfig;
  title: string;
  backHref: string;
  downloadHref?: string;
  // Botones propios de cada superficie (p. ej. el «Historial» de los archivos de proyecto).
  extra?: React.ReactNode;
  // Gente mencionable con «+» y a quién avisar cuando ocurra. Si no se pasan, el «+» no ofrece
  // a nadie (es el caso de los adjuntos del chat, que no cuelgan de un proyecto).
  mentions?: MentionUser[];
  onMention?: (emails: string[], comment: string, actionLink: unknown) => void;
  // Quién más tiene el documento abierto (según el Document Server, al abrir la página).
  presentes?: string[];
}) {
  const [estado, setEstado] = React.useState<Estado>("cargando");
  const [motivo, setMotivo] = React.useState<string | null>(null);
  // Estado de guardado: "limpio" = todo escrito en el archivo; "sucio" = hay cambios que solo
  // están en el servidor de documentos; "guardando" = forzando la escritura.
  const [guardado, setGuardado] = React.useState<"limpio" | "sucio" | "guardando">("limpio");
  const [hora, setHora] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const sucio = React.useRef(false);
  const listo = React.useRef(false);
  // Caja que React crea VACÍA y no vuelve a tocar: dentro de ella se monta a mano el nodo del
  // editor. OnlyOffice REEMPLAZA ese nodo por su iframe, así que si React lo tuviera en su árbol
  // (o intentara insertar algo antes) reventaría con «insertBefore … is not a child of this node».
  const host = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<DocEditorInstance | null>(null);

  const soloMira = config.editorConfig.mode === "view";
  const sugiere = !soloMira && !config.document.permissions.edit && config.document.permissions.review;
  const soloComenta = !soloMira && !config.document.permissions.edit && !sugiere;
  const puedeForzar = !soloMira;

  // Las callbacks de mención viven en refs: el efecto que monta el editor NO debe volver a
  // ejecutarse porque cambie una función (remontar el editor perdería lo que se esté escribiendo).
  const mentionsRef = React.useRef(mentions);
  const onMentionRef = React.useRef(onMention);
  React.useEffect(() => {
    mentionsRef.current = mentions;
    onMentionRef.current = onMention;
  }, [mentions, onMention]);

  // Guardar ahora: le pide al Document Server que escriba el archivo en disco, sin esperar a
  // que el último editor cierre el documento.
  const guardarAhora = React.useCallback(async () => {
    if (!puedeForzar) return;
    setGuardado("guardando");
    setAviso(null);
    const r = await forceSaveDoc(config.document.key);
    if (r.ok) {
      sucio.current = false;
      setGuardado("limpio");
      setHora(new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    } else {
      setGuardado(sucio.current ? "sucio" : "limpio");
      setAviso(r.error ?? "No se pudo guardar ahora.");
    }
  }, [config.document.key, puedeForzar]);

  // Carga del editor: script del Document Server + eventos. Si el script no llega o el editor no
  // arranca, se cuenta como FALLO y se explica — antes esto era una pantalla en blanco eterna.
  React.useEffect(() => {
    let vivo = true;
    // El nodo del editor se crea a mano dentro de la caja: es de OnlyOffice, no de React.
    const caja = host.current;
    if (!caja) return;
    caja.replaceChildren();
    const nodo = document.createElement("div");
    nodo.id = "oo-editor";
    nodo.style.height = "100%";
    caja.appendChild(nodo);

    const script = document.createElement("script");
    script.src = `${docsUrl}/web-apps/apps/api/documents/api.js`;
    script.async = true;

    const arranque = setTimeout(() => {
      if (!vivo || listo.current) return;
      setEstado("fallo");
      setMotivo(`El editor no respondió en ${Math.round(ARRANQUE_MS / 1000)} segundos.`);
    }, ARRANQUE_MS);

    script.onerror = () => {
      if (!vivo) return;
      clearTimeout(arranque);
      setEstado("fallo");
      setMotivo("Este equipo no pudo contactar al servidor de documentos.");
    };

    script.onload = () => {
      if (!vivo) return;
      if (!window.DocsAPI) {
        clearTimeout(arranque);
        setEstado("fallo");
        setMotivo("El servidor de documentos respondió, pero no entregó el editor.");
        return;
      }
      const events: DocsEvents = {
        onDocumentReady: () => {
          listo.current = true;
          clearTimeout(arranque);
          setEstado("listo");
        },
        onError: (e) => {
          const d = e?.data;
          clearTimeout(arranque);
          setEstado("fallo");
          setMotivo(
            d?.errorDescription
              ? `${limpiar(d.errorDescription)}${d.errorCode ? ` (código ${d.errorCode})` : ""}`
              : `El editor devolvió un error${d?.errorCode ? ` (código ${d.errorCode})` : ""}.`,
          );
        },
        onWarning: (e) => setAviso(e?.data?.warningDescription ? limpiar(e.data.warningDescription) : null),
        // true = hay cambios que todavía no están escritos en el archivo.
        onDocumentStateChange: (e) => {
          const mod = Boolean(e?.data);
          sucio.current = mod;
          setGuardado(mod ? "sucio" : "limpio");
        },
        onRequestClose: () => { window.location.href = backHref; },
        // «+» dentro de un comentario: el editor pide a quién puede mencionar.
        onRequestUsers: (e) => {
          const lista = mentionsRef.current ?? [];
          editorRef.current?.setUsers?.({ c: e?.data?.c ?? "mention", users: lista });
        },
        // Ya mencionó a alguien: el aviso lo manda la app (el editor no sabe de campanas).
        onRequestSendNotify: (e) => {
          const d = e?.data;
          if (!d?.emails?.length) return;
          onMentionRef.current?.(d.emails, d.comment ?? "", d.actionLink);
        },
      };
      try {
        editorRef.current = new window.DocsAPI.DocEditor("oo-editor", { ...config, events });
      } catch (err) {
        clearTimeout(arranque);
        setEstado("fallo");
        setMotivo(err instanceof Error ? err.message : "No se pudo iniciar el editor.");
      }
    };

    document.body.appendChild(script);
    return () => {
      vivo = false;
      clearTimeout(arranque);
      script.remove();
      editorRef.current = null;
      caja.replaceChildren(); // se lleva por delante lo que OnlyOffice haya montado dentro
    };
  }, [docsUrl, config, backHref]);

  // Guardado automático mientras haya cambios pendientes: el trabajo llega al disco aunque
  // nadie cierre el documento.
  React.useEffect(() => {
    if (!puedeForzar) return;
    const t = setInterval(() => { if (sucio.current) void guardarAhora(); }, AUTOGUARDADO_MS);
    return () => clearInterval(t);
  }, [puedeForzar, guardarAhora]);

  // Ctrl/Cmd+S guarda de verdad (dentro del editor ya funciona; esto cubre el foco fuera).
  React.useEffect(() => {
    if (!puedeForzar) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void guardarAhora(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [puedeForzar, guardarAhora]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 px-4 border-b border-border">
        <Link href={backHref} className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Volver
        </Link>
        <span className="truncate text-sm font-medium">{title}</span>

        {/* Qué puedes hacer aquí: se dice, no se descubre probando. */}
        {soloMira ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><Eye className="size-3" /> Solo lectura</span>
        ) : sugiere ? (
          <span
            title="Lo que escribas queda marcado como sugerencia: el equipo lo acepta o lo rechaza."
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400"
          >
            <PenLine className="size-3" /> Modo sugerencias
          </span>
        ) : soloComenta ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"><MessageSquare className="size-3" /> Puedes comentar</span>
        ) : null}

        {/* Quién más está aquí: se ve ANTES de empezar a escribir, no cuando ya se pisaron. */}
        {presentes?.length ? (
          <span
            title={`${presentes.join(", ")} ${presentes.length === 1 ? "tiene" : "tienen"} este documento abierto`}
            className="hidden shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 sm:inline-flex dark:text-emerald-400"
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {presentes.length === 1 ? `${presentes[0]} está dentro` : `${presentes.length} personas dentro`}
          </span>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {extra}
          {estado === "listo" && puedeForzar ? (
            <>
              <span className="inline-flex items-center gap-1" title={hora ? `Último guardado a las ${hora}` : undefined}>
                {guardado === "guardando" ? (<><Loader2 className="size-3.5 animate-spin" /> Guardando…</>)
                  : guardado === "sucio" ? (<><span className="size-1.5 rounded-full bg-amber-500" /> Sin guardar</>)
                  : (<><Check className="size-3.5 text-emerald-500" /> Guardado{hora ? ` ${hora}` : ""}</>)}
              </span>
              <button
                type="button"
                onClick={() => void guardarAhora()}
                disabled={guardado === "guardando"}
                className="rounded-md border border-border px-2 py-1 font-medium hover:bg-accent disabled:opacity-60"
              >
                Guardar ahora
              </button>
            </>
          ) : estado === "cargando" ? (
            <span className="inline-flex items-center gap-1"><Loader2 className="size-3.5 animate-spin" /> Abriendo el editor…</span>
          ) : null}
        </div>
      </header>

      {/* La caja del editor va SIEMPRE primero y no cambia nunca. El aviso y la pantalla de
          fallo se pintan ENCIMA (después en el DOM), nunca antes: si React tuviera que insertar
          algo delante del nodo que OnlyOffice reemplaza por su iframe, reventaría con
          «insertBefore … is not a child of this node». */}
      <div className="relative min-h-0 flex-1">
        <div ref={host} className="absolute inset-0" />

        {aviso ? (
          <p className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-700 backdrop-blur dark:text-amber-300">
            <AlertTriangle className="size-3.5 shrink-0" /> {aviso}
            <button type="button" onClick={() => setAviso(null)} aria-label="Ocultar aviso" className="ml-auto rounded px-1 hover:bg-amber-500/20">×</button>
          </p>
        ) : null}

        {/* Fallo: en vez de una pantalla en blanco, qué pasó y qué se puede hacer. */}
        {estado === "fallo" ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
            <AlertTriangle className="size-9 text-amber-500" />
            <h1 className="text-lg font-semibold">No se pudo abrir el editor</h1>
            <p className="max-w-md text-sm text-muted-foreground">{motivo}</p>
            <p className="max-w-md text-xs text-muted-foreground/80">
              El editor vive en <span className="font-mono">{docsUrl}</span>. Si esta pantalla sale siempre, revisa esa
              dirección desde este mismo equipo (Configuración → Integraciones → Probar).
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                <RefreshCw className="size-4" /> Reintentar
              </button>
              {downloadHref ? (
                <a href={downloadHref} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">
                  <Download className="size-4" /> Descargar el archivo
                </a>
              ) : null}
              <Link href={backHref} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">
                Volver
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
