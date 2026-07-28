"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, FileSpreadsheet, Presentation, Loader2, Pencil, Download, Archive, ArchiveRestore, Trash2, UploadCloud, FilePlus2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { uploadDocTemplate, createBlankDocTemplate, renameDocTemplate, setDocTemplateArchived, deleteDocTemplate } from "./actions";

export type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  ext: string;
  size: number;
  usedCount: number;
  archived: boolean;
  author: string | null;
  when: string;
};

const ICONO: Record<string, typeof FileText> = { docx: FileText, xlsx: FileSpreadsheet, pptx: Presentation };
const TIPOS = [
  { kind: "word", label: "Word", icon: FileText },
  { kind: "cell", label: "Excel", icon: FileSpreadsheet },
  { kind: "slide", label: "Power Point", icon: Presentation },
] as const;

export function TemplatesList({ rows, canManage, canDelete }: { rows: TemplateRow[]; canManage: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [modo, setModo] = React.useState<null | "subir" | "blanco">(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editando, setEditando] = React.useState<string | null>(null);
  const [verArchivadas, setVerArchivadas] = React.useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const activas = rows.filter((r) => !r.archived);
  const archivadas = rows.filter((r) => r.archived);
  const lista = verArchivadas ? archivadas : activas;

  async function correr(fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, abrir = false) {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (!r.ok) { setError(r.error ?? "No se pudo completar."); return; }
      setModo(null);
      setEditando(null);
      if (abrir && r.id) router.push(`/docs/plantilla/${r.id}`);
      else router.refresh();
    } catch {
      setError("No se pudo completar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {canManage ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Btn active={modo === "subir"} onClick={() => setModo((m) => (m === "subir" ? null : "subir"))} icon={UploadCloud}>
            Subir una plantilla
          </Btn>
          <Btn active={modo === "blanco"} onClick={() => setModo((m) => (m === "blanco" ? null : "blanco"))} icon={FilePlus2}>
            Crear una en blanco
          </Btn>
          {archivadas.length ? (
            <button
              type="button"
              onClick={() => setVerArchivadas((v) => !v)}
              className="ml-auto rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {verArchivadas ? `← Activas (${activas.length})` : `Archivadas (${archivadas.length})`}
            </button>
          ) : null}
        </div>
      ) : null}

      {modo === "subir" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void correr(() => uploadDocTemplate(fd));
          }}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5"
        >
          <input type="file" name="file" accept=".docx,.xlsx,.pptx" required className="min-w-44 flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium" />
          <input name="name" placeholder="Nombre (opcional)" className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input name="description" placeholder="¿Para qué sirve?" className="min-w-44 flex-[2] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Guardar
          </button>
        </form>
      ) : null}

      {modo === "blanco" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void correr(() => createBlankDocTemplate(fd), true);
          }}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5"
        >
          <select name="kind" defaultValue="word" className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
            {TIPOS.map((t) => <option key={t.kind} value={t.kind}>{t.label}</option>)}
          </select>
          <input name="name" required placeholder="Nombre de la plantilla" className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input name="description" placeholder="¿Para qué sirve?" className="min-w-44 flex-[2] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Crear y escribirla
          </button>
        </form>
      ) : null}

      {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}

      {lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {verArchivadas
            ? "No hay plantillas archivadas."
            : "Todavía no hay plantillas. Sube el guion técnico, el presupuesto o la propuesta con la marca y el equipo arrancará desde ahí."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {lista.map((t) => {
            const Icono = ICONO[t.ext] ?? FileText;
            return (
              <li key={t.id} className="group flex flex-wrap items-center gap-3 px-4 py-3">
                <Icono className="size-5 shrink-0 text-sky-600 dark:text-sky-400" />
                <div className="min-w-0 flex-1">
                  {editando === t.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        void correr(() => renameDocTemplate(t.id, String(fd.get("name") ?? ""), String(fd.get("description") ?? "")));
                      }}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input name="name" defaultValue={t.name} required className="min-w-36 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring" />
                      <input name="description" defaultValue={t.description ?? ""} placeholder="¿Para qué sirve?" className="min-w-40 flex-[2] rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring" />
                      <button disabled={busy} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60">Guardar</button>
                      <button type="button" onClick={() => setEditando(null)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent">Cancelar</button>
                    </form>
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium">{t.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.description ? `${t.description} · ` : ""}
                        {t.ext.toUpperCase()} · {Math.max(1, Math.round(t.size / 1024))} KB
                        {t.usedCount ? ` · usada ${t.usedCount} ${t.usedCount === 1 ? "vez" : "veces"}` : " · sin usar todavía"}
                        {t.author ? ` · ${t.author}` : ""} · {t.when}
                      </p>
                    </>
                  )}
                </div>

                {editando === t.id ? null : (
                  <div className="flex shrink-0 items-center gap-1">
                    {canManage && !t.archived ? (
                      <IconBtn href={`/docs/plantilla/${t.id}`} title="Abrir y editar la plantilla"><Pencil className="size-4" /></IconBtn>
                    ) : null}
                    <IconBtn href={`/api/doc-templates/${t.id}?download=1`} title="Descargar"><Download className="size-4" /></IconBtn>
                    {canManage ? (
                      <>
                        <button type="button" onClick={() => setEditando(t.id)} title="Renombrar" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void correr(() => setDocTemplateArchived(t.id, !t.archived))}
                          title={t.archived ? "Volver a ofrecerla" : "Dejar de ofrecerla al crear documentos"}
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
                        >
                          {t.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                        </button>
                      </>
                    ) : null}
                    {canDelete && t.archived ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          const sigue = await confirm({ message: `¿Borrar la plantilla «${t.name}»? Esto sí es definitivo.`, confirmLabel: "Borrar" });
                          if (sigue) void correr(() => deleteDocTemplate(t.id));
                        }}
                        title="Borrar definitivamente"
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-60"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
    </div>
  );
}

function Btn({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof FileText; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" /> {children}
    </button>
  );
}

function IconBtn({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <a href={href} title={title} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
      {children}
    </a>
  );
}
