"use client";

import * as React from "react";
import { Bold, Italic, Heading, List, ListChecks, Quote, Code, Link2, Table, Image as ImageIcon, Paperclip, Eye, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";
import { uploadWikiFile } from "../actions";

// Editor de Markdown con barra de herramientas, subida de imágenes/archivos y vista
// previa. Guarda Markdown (campo name="content") — el mismo formato que se renderiza
// en modo lectura, sin depender de un editor pesado.
export function MarkdownEditor({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = React.useState(defaultValue);
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const imgInput = React.useRef<HTMLInputElement>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const restore = (start: number, end: number) => requestAnimationFrame(() => { const ta = ref.current; if (ta) { ta.focus(); ta.setSelectionRange(start, end); } });

  // Envuelve la selección (negrita, cursiva, código…) o inserta plantilla.
  const surround = (pre: string, post = pre) => {
    const ta = ref.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const next = value.slice(0, s) + pre + value.slice(s, e) + post + value.slice(e);
    setValue(next);
    restore(s + pre.length, e + pre.length);
  };
  const insertAt = (text: string) => {
    const ta = ref.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const next = value.slice(0, s) + text + value.slice(e);
    setValue(next);
    restore(s + text.length, s + text.length);
  };
  // Antepone un prefijo al inicio de la línea actual (títulos, listas, citas).
  const prefixLine = (prefix: string) => {
    const ta = ref.current; if (!ta) return;
    const s = ta.selectionStart;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    setValue(next);
    restore(s + prefix.length, s + prefix.length);
  };

  const upload = async (file: File, asImage: boolean) => {
    setErr(null); setBusy(true);
    try {
      const fd = new FormData(); fd.set("file", file);
      const r = await uploadWikiFile(fd);
      insertAt(r.isImage && asImage ? `\n![${r.name}](${r.url})\n` : `[📎 ${r.name}](${r.url})`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo subir el archivo.");
    } finally {
      setBusy(false);
    }
  };

  const Btn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} title={title} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">{children}</button>
  );

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
        <Btn onClick={() => surround("**")} title="Negrita"><Bold className="size-4" /></Btn>
        <Btn onClick={() => surround("*")} title="Cursiva"><Italic className="size-4" /></Btn>
        <Btn onClick={() => prefixLine("## ")} title="Título"><Heading className="size-4" /></Btn>
        <Btn onClick={() => prefixLine("- ")} title="Lista"><List className="size-4" /></Btn>
        <Btn onClick={() => prefixLine("- [ ] ")} title="Lista de tareas"><ListChecks className="size-4" /></Btn>
        <Btn onClick={() => prefixLine("> ")} title="Cita"><Quote className="size-4" /></Btn>
        <Btn onClick={() => surround("`")} title="Código"><Code className="size-4" /></Btn>
        <Btn onClick={() => surround("[", "](https://)")} title="Enlace"><Link2 className="size-4" /></Btn>
        <Btn onClick={() => insertAt("\n| Columna | Columna |\n| --- | --- |\n| · | · |\n")} title="Tabla"><Table className="size-4" /></Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn onClick={() => imgInput.current?.click()} title="Insertar imagen"><ImageIcon className="size-4" /></Btn>
        <Btn onClick={() => fileInput.current?.click()} title="Adjuntar archivo"><Paperclip className="size-4" /></Btn>
        {busy ? <span className="ml-1 text-xs text-muted-foreground">Subiendo…</span> : null}
        <button
          type="button"
          onClick={() => setMode((m) => (m === "edit" ? "preview" : "edit"))}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
        >
          {mode === "edit" ? <><Eye className="size-3.5" /> Vista previa</> : <><Pencil className="size-3.5" /> Editar</>}
        </button>
      </div>

      {/* Área de edición (oculta en vista previa, pero presente para que el form la envíe) */}
      <textarea
        ref={ref}
        name="content"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={18}
        placeholder="Escribe aquí… Markdown: # títulos, - listas, - [ ] tareas, **negrita**, tablas | |, enlaces y ![imágenes]()."
        className={cn("w-full resize-y bg-transparent px-4 py-3 font-mono text-sm outline-none", mode === "preview" && "hidden")}
      />

      {/* Vista previa */}
      {mode === "preview" ? (
        value.trim()
          ? <div className="px-4 py-3 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />
          : <p className="px-4 py-6 text-sm text-muted-foreground">Nada que previsualizar todavía.</p>
      ) : null}

      {err ? <p className="border-t border-border px-4 py-2 text-xs text-destructive">{err}</p> : null}

      <input ref={imgInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f, true); }} />
      <input ref={fileInput} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f, false); }} />
    </div>
  );
}
