"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bold, Eraser, ImagePlus, Italic, Link2, List, ListOrdered, Loader2, Paperclip, PenLine, Send, Smile, Underline, Upload, X } from "lucide-react";
import { enviarCorreoForm, guardarBorrador, subirGif } from "./acciones";

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
};

export type GifVM = { id: string; nombre: string };

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

export function CompositorProvider({ contactos, firmaHtml, gifs, children }: {
  contactos: string[];
  /** Vista previa de la firma que el servidor anexará (ya saneada allá). */
  firmaHtml: string;
  gifs: GifVM[];
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

            <BarraFormato editorRef={editorRef} gifs={gifs} alCambiar={() => autoguardar(prefill)} />

            <div
              ref={editorRef}
              contentEditable
              role="textbox"
              aria-multiline="true"
              aria-label="Cuerpo del mensaje"
              onInput={() => autoguardar(prefill)}
              data-placeholder={prefill.modo === "reenviar" ? "Escribe algo antes del mensaje reenviado (se cita solo)…" : "Escribe el mensaje…"}
              className="min-h-40 px-4 py-3 text-[13.5px] leading-relaxed outline-none [overflow-wrap:anywhere] empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_img]:my-1 [&_img]:max-w-full [&_img]:rounded-md [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
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
function BarraFormato({ editorRef, gifs, alCambiar }: {
  editorRef: React.RefObject<HTMLDivElement | null>;
  gifs: GifVM[];
  alCambiar: () => void;
}) {
  const [conGifs, setConGifs] = React.useState(false);
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

  const B = ({ title, onMouseDown, children }: { title: string; onMouseDown: () => void; children: React.ReactNode }) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); onMouseDown(); }}
      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
      {children}
    </button>
  );

  return (
    <div className="relative flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
      <B title="Negrita (Ctrl+B)" onMouseDown={() => manda("bold")}><Bold className="size-3.5" /></B>
      <B title="Cursiva (Ctrl+I)" onMouseDown={() => manda("italic")}><Italic className="size-3.5" /></B>
      <B title="Subrayado (Ctrl+U)" onMouseDown={() => manda("underline")}><Underline className="size-3.5" /></B>
      <span className="mx-1 h-4 w-px bg-border" />
      <B title="Lista" onMouseDown={() => manda("insertUnorderedList")}><List className="size-3.5" /></B>
      <B title="Lista numerada" onMouseDown={() => manda("insertOrderedList")}><ListOrdered className="size-3.5" /></B>
      <B title="Enlace" onMouseDown={enlace}><Link2 className="size-3.5" /></B>
      <span className="mx-1 h-4 w-px bg-border" />
      <label className="cursor-pointer rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Insertar imagen en el cuerpo">
        <ImagePlus className="size-3.5" />
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void insertaImagen(f); e.target.value = ""; }} />
      </label>
      <B title="GIFs del estudio" onMouseDown={() => setConGifs((v) => !v)}><Smile className="size-3.5" /></B>
      <span className="mx-1 h-4 w-px bg-border" />
      <B title="Quitar formato" onMouseDown={() => manda("removeFormat")}><Eraser className="size-3.5" /></B>

      {conGifs ? <PanelGifs gifs={gifs} insertar={(id) => { manda("insertHTML", `<img src="/api/correo/gif/${id}" style="max-width:240px">`); setConGifs(false); }} /> : null}
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
