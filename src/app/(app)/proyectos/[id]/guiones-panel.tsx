"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, UploadCloud, Eye, Pencil, Copy, Check, Download, Trash2, Loader2, FilePlus2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { uploadGuiones, createGuion, copyGuionText, deleteFile } from "./actions";

type Guion = { id: string; name: string; editable: boolean };

export function GuionesPanel({
  projectId,
  files,
  canWrite,
  onlyoffice,
}: {
  projectId: string;
  files: Guion[];
  canWrite: boolean;
  onlyoffice: boolean;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [copyingId, setCopyingId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("name", newName.trim());
      const r = await createGuion(projectId, fd);
      if (r.ok && r.id) {
        setNewName("");
        setCreating(false);
        // Si OnlyOffice está activo, abrimos el editor para empezar a escribir; si no,
        // refrescamos la lista (el documento queda creado para descargar).
        if (onlyoffice) router.push(`/docs/file/${r.id}`);
        else router.refresh();
      } else {
        setErr(r.error ?? "No se pudo crear el documento.");
      }
    } catch {
      setErr("No se pudo crear el documento.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    const all = Array.from(list);
    const words = all.filter((f) => /\.(docx?|odt|rtf|txt)$/i.test(f.name));
    if (words.length === 0) {
      setErr("Solo se aceptan documentos de Word (.doc, .docx, .odt, .rtf, .txt).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      words.forEach((f) => fd.append("files", f));
      await uploadGuiones(projectId, fd);
      router.refresh();
      if (words.length < all.length) setErr("Algunos archivos se omitieron (no son documentos de Word).");
    } catch {
      setErr("No se pudieron subir los guiones. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function copy(id: string) {
    setCopyingId(id);
    setErr(null);
    try {
      const r = await copyGuionText(id);
      if (r.ok && typeof r.text === "string") {
        await navigator.clipboard.writeText(r.text);
        setCopiedId(id);
        setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
      } else {
        setErr(r.error ?? "No se pudo copiar el texto.");
      }
    } catch {
      setErr("No se pudo copiar al portapapeles.");
    } finally {
      setCopyingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Guiones del proyecto en Word: previsualízalos y edítalos en OnlyOffice, y copia su texto con un clic.
      </p>

      {/* Crear un documento nuevo en blanco (se abre en OnlyOffice para editar). */}
      {canWrite ? (
        creating ? (
          <form
            onSubmit={(e) => { e.preventDefault(); void create(); }}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5"
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre del guion (ej. Guion reel Q3)"
              className="min-w-48 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="submit" disabled={busy} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />}
              Crear y editar
            </button>
            <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
              Cancelar
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <FilePlus2 className="size-4" /> Nuevo documento
          </button>
        )
      ) : null}

      {/* Zona amigable para adjuntar varios documentos (arrastrar y soltar o elegir). */}
      {canWrite ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40",
          )}
        >
          {busy ? <Loader2 className="size-6 animate-spin text-primary" /> : <UploadCloud className="size-6 text-muted-foreground" />}
          <p className="text-sm font-medium">
            {busy ? "Subiendo…" : "Arrastra tus guiones aquí o haz clic para elegir"}
          </p>
          <p className="text-xs text-muted-foreground">Word (.doc, .docx, .odt, .rtf, .txt) · varios a la vez</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".doc,.docx,.odt,.rtf,.txt"
            className="hidden"
            onChange={(e) => void upload(e.target.files)}
          />
        </div>
      ) : null}

      {err ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p> : null}

      {!onlyoffice ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          OnlyOffice no está configurado: la edición y la copia de texto no están disponibles hasta activarlo.
        </p>
      ) : null}

      {/* Lista de guiones */}
      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Aún no hay guiones. {canWrite ? "Sube el primero arriba." : ""}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {files.map((f) => (
            <li key={f.id} className="group flex items-center gap-3 px-4 py-3">
              <FileText className="size-5 shrink-0 text-sky-600 dark:text-sky-400" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={f.name}>{f.name}</span>

              <div className="flex shrink-0 items-center gap-1">
                {onlyoffice && f.editable ? (
                  <IconLink href={`/docs/file/${f.id}`} title="Previsualizar y editar en OnlyOffice"><Pencil className="size-4" /></IconLink>
                ) : (
                  <IconLink href={`/api/files-asset/${f.id}`} title="Ver"><Eye className="size-4" /></IconLink>
                )}

                {onlyoffice && f.editable ? (
                  <button
                    type="button"
                    onClick={() => copy(f.id)}
                    disabled={copyingId === f.id}
                    title="Copiar el texto del guion"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
                  >
                    {copyingId === f.id ? <Loader2 className="size-4 animate-spin" /> : copiedId === f.id ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                  </button>
                ) : null}

                <IconLink href={`/api/files-asset/${f.id}?download=1`} title="Descargar"><Download className="size-4" /></IconLink>

                {canWrite ? (
                  <form action={deleteFile.bind(null, f.id, projectId)}>
                    <ConfirmSubmit message={`¿Eliminar el guion «${f.name}»?`} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="size-4" />
                    </ConfirmSubmit>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IconLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </a>
  );
}
