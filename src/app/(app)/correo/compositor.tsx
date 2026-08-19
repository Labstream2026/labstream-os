"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlignCenter, AlignLeft, Bold, Eraser, Heading2, ImagePlus, Italic, LayoutTemplate, Link2, List, ListOrdered, Loader2, Minus, Paintbrush, Paperclip, PenLine, Send, Smile, Sparkles, Trash2, Underline, Upload, X } from "lucide-react";
import { enviarCorreoForm, guardarBorrador, subirGif, guardarPlantillaCorreo, eliminarPlantillaCorreo } from "./acciones";
import { bloqueBoton, bloqueCaja, bloqueSeparador, bloqueTarjeta, PLANTILLAS_BASE } from "@/lib/correo/bloques";
import { PALETA_CORREO } from "@/lib/correo/redactar";

// ── El compositor flotante (estilo Gmail), ahora CON FORMATO ────────────────
// Redactor contenteditable con barra mínima (negrita, cursiva, listas, enlaces, imágenes y
// los GIFs del estudio). El cuerpo viaja como HTML y el servidor lo sanea, convierte las
// imágenes en partes incrustadas (CID) y anexa la firma — la vista previa de abajo muestra
// exactamente la que saldrá.

export type PrefillCompositor = {
  modo: "nuevo" | "responder" | "todos" | "reenviar" | "borrador";
  para?: string;
  cc?: string;
  asunto?: string;
  texto?: string; // texto plano o HTML (borradores nuevos): el editor distingue solo
  responderAId?: string;
  reenviarDeId?: string;
  /** Si se abre desde un borrador guardado, su id: editarlo actualiza en vez de duplicar. */
  borradorId?: string;
  /** Proyecto al que se cuelga el enviado («Escribir al cliente» desde el proyecto). */
  proyectoId?: string;
};

export type GifVM = { id: string; nombre: string };
export type PlantillaVM = { id: string; nombre: string; html: string };

type Ctx = { abrir: (p: PrefillCompositor) => void };
const CompositorCtx = React.createContext<Ctx | null>(null);
export function useCompositor(): Ctx {
  const ctx = React.useContext(CompositorCtx);
  if (!ctx) throw new Error("useCompositor fuera del proveedor");
  return ctx;
}

const escapa = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** El prefill puede ser texto plano (respuestas, borradores viejos) o HTML (borradores nuevos). */
const comoHtml = (s: string) => (/<[a-z!][^>]*>/i.test(s) ? s : escapa(s).replace(/\n/g, "<br>"));

export function CompositorProvider({ contactos, firmaHtml, gifs, plantillas, autoAbrir, children }: {
  contactos: string[];
  /** Vista previa de la firma que el servidor anexará (ya saneada allá). */
  firmaHtml: string;
  gifs: GifVM[];
  /** Plantillas guardadas del estudio (las de fábrica se suman en el menú). */
  plantillas: PlantillaVM[];
  /** Abre el compositor al montar («Escribir al cliente» llega con esto desde el proyecto). */
  autoAbrir?: PrefillCompositor | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [prefill, setPrefill] = React.useState<PrefillCompositor | null>(null);
  const [conCc, setConCc] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nombres, setNombres] = React.useState<string[]>([]);
  const [pendiente, arranca] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);
  const editorRef = React.useRef<HTMLDivElement>(null);

  // ── Autoguardado de borrador (ahora guarda el HTML del redactor) ──
  const [borradorId, setBorradorId] = React.useState<string | null>(null);
  const [guardadoTxt, setGuardadoTxt] = React.useState<string | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const borradorRef = React.useRef<string | null>(null);
  borradorRef.current = borradorId;

  const autoguardar = React.useCallback((p: PrefillCompositor | null) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const form = formRef.current;
      const editor = editorRef.current;
      if (!form || !p || !editor) return;
      const fd = new FormData(form);
      const texto = editor.innerHTML;
      const para = String(fd.get("para") ?? "");
      const asunto = String(fd.get("asunto") ?? "");
      if (!editor.innerText.trim() && !para.trim() && !asunto.trim()) return; // vacío: nada que guardar
      const r = await guardarBorrador({
        id: borradorRef.current,
        para, cc: String(fd.get("cc") ?? ""), asunto, texto,
        responderAId: p.responderAId ?? null,
        reenviarDeId: p.reenviarDeId ?? null,
      });
      if (r) {
        setBorradorId(r.id);
        setGuardadoTxt(new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
      }
    }, 1500);
  }, []);

  const abrir = React.useCallback((p: PrefillCompositor) => {
    setError(null);
    setConCc(!!p.cc);
    setNombres([]);
    setBorradorId(p.borradorId ?? null);
    setGuardadoTxt(null);
    setPrefill(p);
  }, []);

  // El contenido inicial se pinta al abrir (el editor es DOM libre, no estado de React).
  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !prefill) return;
    editor.innerHTML = prefill.texto ? comoHtml(prefill.texto) : "";
    editor.focus();
  }, [prefill]);

  // «Escribir al cliente» desde un proyecto: llega con ?para=…&proy=… y se abre solo (una vez).
  const autoAbierto = React.useRef(false);
  React.useEffect(() => {
    if (autoAbrir && !autoAbierto.current) {
      autoAbierto.current = true;
      abrir(autoAbrir);
    }
  }, [autoAbrir, abrir]);

  // Atajo `c` de Gmail: redactar desde cualquier parte de la bandeja.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (e.key === "c" && !e.metaKey && !e.ctrlKey) abrir({ modo: "nuevo" });
      if (e.key === "Escape") setPrefill(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abrir]);

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const editor = editorRef.current;
    if (!editor) return;
    if (!editor.innerText.trim() && !editor.querySelector("img")) { setError("El mensaje está vacío."); return; }
    const fd = new FormData(e.currentTarget);
    fd.set("html", editor.innerHTML);
    setError(null);
    arranca(async () => {
      const r = await enviarCorreoForm(fd);
      if (!r.ok) { setError(r.error ?? "No se pudo enviar."); return; }
      setPrefill(null);
      router.refresh();
    });
  };

  const titulo =
    prefill?.modo === "responder" ? "Responder" : prefill?.modo === "todos" ? "Responder a todos" : prefill?.modo === "reenviar" ? "Reenviar" : "Mensaje nuevo";

  return (
    <CompositorCtx.Provider value={{ abrir }}>
      {children}
      {prefill ? (
        <div className="fixed bottom-0 right-4 z-40 flex max-h-[86vh] w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center bg-foreground px-4 py-2.5 text-[13px] font-semibold text-background">
            {titulo}
            <button type="button" onClick={() => setPrefill(null)} aria-label="Cerrar" className="ml-auto rounded p-0.5 hover:opacity-70"><X className="size-4" /></button>
          </div>
          <form ref={formRef} onSubmit={enviar} onChange={() => autoguardar(prefill)} className="flex min-h-0 flex-col overflow-y-auto">
            <input type="hidden" name="responderAId" value={prefill.responderAId ?? ""} />
            <input type="hidden" name="reenviarDeId" value={prefill.reenviarDeId ?? ""} />
            <input type="hidden" name="borradorId" value={borradorId ?? ""} />
            <input type="hidden" name="proyectoId" value={prefill.proyectoId ?? ""} />
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-[13px]">
              <span className="text-muted-foreground">Para</span>
              <input
                name="para" required defaultValue={prefill.para ?? ""} list="correo-contactos" autoComplete="off"
                placeholder="cliente@ejemplo.com — separa varios con coma"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
              {!conCc ? (
                <button type="button" onClick={() => setConCc(true)} className="text-[12px] font-medium text-primary hover:underline">CC</button>
              ) : null}
            </div>
            {conCc ? (
              <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-[13px]">
                <span className="text-muted-foreground">CC</span>
                <input name="cc" defaultValue={prefill.cc ?? ""} list="correo-contactos" autoComplete="off" className="min-w-0 flex-1 bg-transparent outline-none" />
              </div>
            ) : (
              <input type="hidden" name="cc" value="" />
            )}
            <div className="border-b border-border px-4 py-2 text-[13px]">
              <input name="asunto" defaultValue={prefill.asunto ?? ""} placeholder="Asunto" className="w-full bg-transparent outline-none" />
            </div>

            <BarraFormato editorRef={editorRef} gifs={gifs} plantillas={plantillas} alCambiar={() => autoguardar(prefill)} />

            <div
              ref={editorRef}
              contentEditable
              role="textbox"
              aria-multiline="true"
              aria-label="Cuerpo del mensaje"
              onInput={() => autoguardar(prefill)}
              data-placeholder={prefill.modo === "reenviar" ? "Escribe algo antes del mensaje reenviado (se cita solo)…" : "Escribe el mensaje…"}
              className="min-h-40 px-4 py-3 text-[13.5px] leading-relaxed outline-none [overflow-wrap:anywhere] empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h2]:my-2 [&_h2]:text-[17px] [&_h2]:font-bold [&_h3]:my-1.5 [&_h3]:text-[15px] [&_h3]:font-bold [&_hr]:my-3 [&_img]:my-1 [&_img]:max-w-full [&_img]:rounded-md [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            />

            {/* La firma que el servidor anexará, tal cual (la imagen incluida, en nítido). */}
            <div className="mx-4 rounded-lg border border-dashed border-border/70 px-3 py-2 opacity-75">
              <div className="text-[12px] [&_img]:max-w-[200px]" dangerouslySetInnerHTML={{ __html: firmaHtml }} />
              <p className="mt-1 text-[10px] text-muted-foreground">firma automática — se añade al enviar · cámbiala en «Firma y GIFs»</p>
            </div>

            {nombres.length ? (
              <p className="flex flex-wrap gap-1.5 px-4 pb-1 pt-2">
                {nombres.map((n) => (
                  <span key={n} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"><Paperclip className="size-3" /> {n}</span>
                ))}
              </p>
            ) : null}
            {error ? <p className="px-4 pb-1 pt-2 text-[12px] font-medium text-destructive">{error}</p> : null}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button type="submit" disabled={pendiente}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-[13px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar
              </button>
              <label className="cursor-pointer rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Adjuntar archivos (máx. 15 MB en total)">
                <Paperclip className="size-4" />
                <input
                  type="file" name="archivos" multiple className="hidden"
                  onChange={(e) => setNombres([...(e.target.files ?? [])].map((f) => f.name))}
                />
              </label>
              <span className="ml-auto text-[10.5px] text-muted-foreground">{guardadoTxt ? `borrador guardado ${guardadoTxt}` : ""}</span>
            </div>
          </form>
        </div>
      ) : null}
      {/* Autocompletar: los contactos de tus clientes y del equipo, del CRM — no una libreta aparte. */}
      <datalist id="correo-contactos">
        {contactos.map((c) => (<option key={c} value={c} />))}
      </datalist>
    </CompositorCtx.Provider>
  );
}

// ── La barra de formato del redactor ────────────────────────────────────────
// execCommand está «deprecado» desde hace una década y sigue siendo lo que usan los editores
// ligeros: cero dependencias y hace exactamente esto. onMouseDown con preventDefault para no
// robarle la selección al editor.
function BarraFormato({ editorRef, gifs, plantillas, alCambiar }: {
  editorRef: React.RefObject<HTMLDivElement | null>;
  gifs: GifVM[];
  plantillas: PlantillaVM[];
  alCambiar: () => void;
}) {
  // Un solo menú abierto a la vez: gifs, colores, bloques o plantillas.
  const [menu, setMenu] = React.useState<null | "gifs" | "color" | "bloques" | "plantillas">(null);
  const alterna = (m: NonNullable<typeof menu>) => setMenu((v) => (v === m ? null : m));

  const manda = (cmd: string, valor?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, valor);
    alCambiar();
  };
  const enlace = () => {
    const url = window.prompt("Dirección del enlace (https://…)");
    if (url && /^https?:\/\//i.test(url)) manda("createLink", url);
  };
  const insertaImagen = async (f: File) => {
    if (!/^image\//.test(f.type)) return;
    if (f.size > 4 * 1024 * 1024) { window.alert("Máximo 4 MB por imagen dentro del cuerpo. Más pesado, va como adjunto."); return; }
    const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
    manda("insertHTML", `<img src="${url}" style="max-width:100%">`);
  };

  const B = ({ title, activo, onMouseDown, children }: { title: string; activo?: boolean; onMouseDown: () => void; children: React.ReactNode }) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); onMouseDown(); }}
      className={cnBarra(activo)}>
      {children}
    </button>
  );

  return (
    <div className="relative flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
      <B title="Título de sección" onMouseDown={() => manda("formatBlock", "<h2>")}><Heading2 className="size-3.5" /></B>
      <B title="Texto normal" onMouseDown={() => manda("formatBlock", "<p>")}><span className="px-0.5 text-[11px] font-bold">P</span></B>
      <span className="mx-1 h-4 w-px bg-border" />
      <B title="Negrita (Ctrl+B)" onMouseDown={() => manda("bold")}><Bold className="size-3.5" /></B>
      <B title="Cursiva (Ctrl+I)" onMouseDown={() => manda("italic")}><Italic className="size-3.5" /></B>
      <B title="Subrayado (Ctrl+U)" onMouseDown={() => manda("underline")}><Underline className="size-3.5" /></B>
      <B title="Color del texto" activo={menu === "color"} onMouseDown={() => alterna("color")}><Paintbrush className="size-3.5" /></B>
      <span className="mx-1 h-4 w-px bg-border" />
      <B title="Alinear a la izquierda" onMouseDown={() => manda("justifyLeft")}><AlignLeft className="size-3.5" /></B>
      <B title="Centrar" onMouseDown={() => manda("justifyCenter")}><AlignCenter className="size-3.5" /></B>
      <B title="Lista" onMouseDown={() => manda("insertUnorderedList")}><List className="size-3.5" /></B>
      <B title="Lista numerada" onMouseDown={() => manda("insertOrderedList")}><ListOrdered className="size-3.5" /></B>
      <B title="Enlace" onMouseDown={enlace}><Link2 className="size-3.5" /></B>
      <span className="mx-1 h-4 w-px bg-border" />
      <label className="cursor-pointer rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Insertar imagen en el cuerpo">
        <ImagePlus className="size-3.5" />
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void insertaImagen(f); e.target.value = ""; }} />
      </label>
      <B title="GIFs del estudio" activo={menu === "gifs"} onMouseDown={() => alterna("gifs")}><Smile className="size-3.5" /></B>
      <B title="Bloques listos: botón, tarjeta, caja, separador" activo={menu === "bloques"} onMouseDown={() => alterna("bloques")}>
        <span className="inline-flex items-center gap-1 px-0.5 text-[11px] font-semibold"><Sparkles className="size-3.5" /> Bloques</span>
      </B>
      <B title="Plantillas del estudio" activo={menu === "plantillas"} onMouseDown={() => alterna("plantillas")}>
        <span className="inline-flex items-center gap-1 px-0.5 text-[11px] font-semibold"><LayoutTemplate className="size-3.5" /> Plantillas</span>
      </B>
      <span className="mx-1 h-4 w-px bg-border" />
      <B title="Quitar formato" onMouseDown={() => manda("removeFormat")}><Eraser className="size-3.5" /></B>

      {menu === "gifs" ? <PanelGifs gifs={gifs} insertar={(id) => { manda("insertHTML", `<img src="/api/correo/gif/${id}" style="max-width:240px">`); setMenu(null); }} /> : null}
      {menu === "color" ? (
        <div className="absolute left-2 top-9 z-30 flex gap-1.5 rounded-lg border border-border bg-card p-2 shadow-xl">
          {PALETA_CORREO.map((hex) => (
            <button key={hex} type="button" aria-label={`Color ${hex}`}
              onMouseDown={(e) => { e.preventDefault(); manda("foreColor", hex); setMenu(null); }}
              className="size-6 rounded-full border border-border hover:ring-2 hover:ring-ring" style={{ background: hex }} />
          ))}
        </div>
      ) : null}
      {menu === "bloques" ? <PanelBloques insertar={(html) => { manda("insertHTML", html); setMenu(null); }} /> : null}
      {menu === "plantillas" ? <PanelPlantillas plantillas={plantillas} editorRef={editorRef} cerrar={() => setMenu(null)} alCambiar={alCambiar} /> : null}
    </div>
  );
}

const cnBarra = (activo?: boolean) =>
  `rounded p-1.5 ${activo ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;

// ── Bloques listos: el correo «óptimo» sin saber HTML ───────────────────────
// Cada opción pide lo mínimo (texto/URL) e inserta el HTML a prueba de Gmail: estilos en
// línea, tablas donde toca. Lo insertado se sigue editando como texto normal.
function PanelBloques({ insertar }: { insertar: (html: string) => void }) {
  const boton = () => {
    const texto = window.prompt("Texto del botón", "Ver video");
    if (!texto) return;
    const url = window.prompt("¿A dónde lleva? (https://…)");
    if (!url || !/^https?:\/\//i.test(url)) return;
    insertar(bloqueBoton(texto, url));
  };
  const tarjeta = () => {
    const titulo = window.prompt("Título de la tarjeta", "Reel Agosto — v2");
    if (!titulo) return;
    const url = window.prompt("Enlace (https://…)");
    if (!url || !/^https?:\/\//i.test(url)) return;
    const nota = window.prompt("Descripción corta (opcional)") ?? undefined;
    insertar(bloqueTarjeta(titulo, url, nota || undefined));
  };
  const It = ({ onPick, titulo, desc, icono }: { onPick: () => void; titulo: string; desc: string; icono: React.ReactNode }) => (
    <button type="button" onMouseDown={(e) => { e.preventDefault(); onPick(); }}
      className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-muted">
      <span className="mt-0.5 text-muted-foreground">{icono}</span>
      <span><b className="block text-[12.5px]">{titulo}</b><span className="text-[11px] text-muted-foreground">{desc}</span></span>
    </button>
  );
  return (
    <div className="absolute left-2 top-9 z-30 w-72 rounded-lg border border-border bg-card p-1.5 shadow-xl">
      <It onPick={boton} titulo="Botón" desc="«Ver video», «Aprobar aquí» — el clic que quieres que den" icono={<Send className="size-4" />} />
      <It onPick={tarjeta} titulo="Tarjeta con enlace" desc="Título + descripción + botón, en un marco limpio" icono={<LayoutTemplate className="size-4" />} />
      <It onPick={() => insertar(bloqueCaja())} titulo="Caja destacada" desc="Para lo que no se puede perder (fechas, condiciones)" icono={<Sparkles className="size-4" />} />
      <It onPick={() => insertar(bloqueSeparador())} titulo="Separador" desc="Una línea suave entre secciones" icono={<Minus className="size-4" />} />
    </div>
  );
}

// ── Plantillas: aplicar una (de fábrica o del estudio) o guardar lo escrito ──
function PanelPlantillas({ plantillas, editorRef, cerrar, alCambiar }: {
  plantillas: PlantillaVM[];
  editorRef: React.RefObject<HTMLDivElement | null>;
  cerrar: () => void;
  alCambiar: () => void;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = React.useState(false);

  const aplicar = (html: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerText.trim() && !window.confirm("¿Reemplazar lo que llevas escrito con la plantilla?")) return;
    editor.innerHTML = html;
    editor.focus();
    alCambiar();
    cerrar();
  };

  const guardarActual = async () => {
    const editor = editorRef.current;
    if (!editor || !editor.innerText.trim()) { window.alert("Escribe (o arma) el correo primero; luego lo guardas como plantilla."); return; }
    const nombre = window.prompt("Nombre de la plantilla (p. ej. «Entrega de fotos»)");
    if (!nombre) return;
    setGuardando(true);
    const r = await guardarPlantillaCorreo(nombre, editor.innerHTML);
    setGuardando(false);
    if (!r.ok) { window.alert(r.error ?? "No se pudo guardar."); return; }
    router.refresh();
    cerrar();
  };

  return (
    <div className="absolute left-2 top-9 z-30 w-80 rounded-lg border border-border bg-card py-1.5 shadow-xl">
      <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">De fábrica</p>
      {PLANTILLAS_BASE.map((p) => (
        <button key={p.key} type="button" onMouseDown={(e) => { e.preventDefault(); aplicar(p.html); }}
          className="block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-muted">{p.nombre}</button>
      ))}
      {plantillas.length ? (
        <>
          <p className="mt-1 border-t border-border px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Del estudio</p>
          {plantillas.map((p) => (
            <span key={p.id} className="group flex items-center">
              <button type="button" onMouseDown={(e) => { e.preventDefault(); aplicar(p.html); }}
                className="min-w-0 flex-1 truncate px-3 py-1.5 text-left text-[12.5px] hover:bg-muted">{p.nombre}</button>
              <button type="button" title="Eliminar plantilla" onMouseDown={(e) => {
                e.preventDefault();
                if (window.confirm(`¿Eliminar la plantilla «${p.nombre}» para todo el equipo?`)) {
                  void eliminarPlantillaCorreo(p.id).then(() => router.refresh());
                }
              }} className="mr-2 hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block">
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
        </>
      ) : null}
      <button type="button" disabled={guardando} onMouseDown={(e) => { e.preventDefault(); void guardarActual(); }}
        className="mt-1 flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-left text-[12px] font-medium text-primary hover:bg-muted disabled:opacity-50">
        {guardando ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Guardar lo escrito como plantilla…
      </button>
    </div>
  );
}

// El selector de GIFs del estudio: biblioteca compartida, se insertan al caret y viajan
// INCRUSTADOS (se mueven de verdad en la bandeja del cliente). Aquí mismo se suben nuevos.
function PanelGifs({ gifs, insertar }: { gifs: GifVM[]; insertar: (id: string) => void }) {
  const router = useRouter();
  const [subiendo, setSubiendo] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sube = async (f: File) => {
    setError(null);
    setSubiendo(true);
    const fd = new FormData();
    fd.set("gif", f);
    const r = await subirGif(fd);
    setSubiendo(false);
    if (!r.ok) { setError(r.error ?? "No se pudo subir."); return; }
    router.refresh();
  };

  return (
    <div className="absolute left-2 top-9 z-30 w-72 rounded-lg border border-border bg-card p-2 shadow-xl">
      <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto">
        {gifs.map((g) => (
          <button key={g.id} type="button" title={g.nombre} onMouseDown={(e) => { e.preventDefault(); insertar(g.id); }}
            className="overflow-hidden rounded-md border border-border hover:ring-2 hover:ring-ring">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/correo/gif/${g.id}`} alt={g.nombre} loading="lazy" className="aspect-square w-full object-cover" />
          </button>
        ))}
        {gifs.length === 0 ? <p className="col-span-3 px-2 py-6 text-center text-[11.5px] text-muted-foreground">La biblioteca está vacía: sube el primer GIF del estudio.</p> : null}
      </div>
      {error ? <p className="mt-1 px-1 text-[11px] font-medium text-destructive">{error}</p> : null}
      <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
        {subiendo ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Subir GIF (máx. 3 MB)
        <input type="file" accept="image/gif,image/webp,image/png,image/jpeg" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void sube(f); e.target.value = ""; }} />
      </label>
    </div>
  );
}

/** Abre el compositor con un borrador guardado (fila de la carpeta Borradores). */
export function AbrirBorrador({ borrador, children, className }: {
  borrador: { id: string; para: string; cc: string; asunto: string; texto: string; responderAId: string | null; reenviarDeId: string | null };
  children: React.ReactNode;
  className?: string;
}) {
  const { abrir } = useCompositor();
  return (
    <button
      type="button" className={className}
      onClick={() =>
        abrir({
          modo: "borrador",
          borradorId: borrador.id,
          para: borrador.para,
          cc: borrador.cc,
          asunto: borrador.asunto,
          texto: borrador.texto,
          responderAId: borrador.responderAId ?? undefined,
          reenviarDeId: borrador.reenviarDeId ?? undefined,
        })
      }
    >
      {children}
    </button>
  );
}

export function BotonRedactar() {
  const { abrir } = useCompositor();
  return (
    <button
      type="button" onClick={() => abrir({ modo: "nuevo" })}
      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground shadow-md hover:bg-primary/90"
    >
      <PenLine className="size-4" /> Redactar
    </button>
  );
}
