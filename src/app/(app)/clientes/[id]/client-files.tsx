"use client";

import * as React from "react";
import { Link2, HardDrive, Copy, Check, Trash2, FolderOpen, ExternalLink, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { addClientLink, addClientNasRoute, deleteClientFile } from "@/app/(app)/clientes/actions";

type ClientFile = { id: string; name: string; kind: string; url: string | null; path: string | null };

// Botón "Copiar ruta" para rutas SMB (el navegador no abre \\servidor\carpeta).
function CopyPathButton({ path }: { path: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(path); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* sin portapapeles */ }
      }}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      title={`Copiar ruta: ${path}`}
    >
      {done ? <><Check className="size-3.5" /> Copiada</> : <><Copy className="size-3.5" /> Copiar ruta</>}
    </button>
  );
}

// Archivos a nivel de CLIENTE, con el mismo lenguaje visual que Archivos del proyecto: dónde vive
// su material de marca (enlaces de Drive/web) y sus rutas de red del NAS, agrupados y con iconos por
// tipo. Los archivos PESADOS (subidas, guiones, material del cliente) viven en cada PROYECTO — allí
// está también el enlace público de subida para que el cliente mande su material.
export function ClientFilesPanel({ clientId, files, canEdit }: { clientId: string; files: ClientFile[]; canEdit: boolean }) {
  const [tool, setTool] = React.useState<null | "link" | "nas">(null);
  const flip = (t: "link" | "nas") => setTool((cur) => (cur === t ? null : t));

  const inputCls = "min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
  const links = files.filter((f) => f.kind !== "NAS");
  const routes = files.filter((f) => f.kind === "NAS");

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        El material de marca del cliente: enlaces (Drive, web) y rutas de red (SMB) del NAS.
      </p>
      {/* Guía: el material pesado y el enlace de subida del cliente viven en cada proyecto. */}
      <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-2 text-xs text-muted-foreground">
        <Send className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <span>
          ¿El cliente debe <b className="text-foreground">enviarte material</b> (fotos, video)? Compárte­le el <b className="text-foreground">link de subida</b> desde la pestaña
          Archivos de su proyecto: sube sin cuenta y queda directo en el proyecto.
        </span>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <ToolBtn active={tool === "link"} onClick={() => flip("link")} icon={Link2}>Añadir enlace</ToolBtn>
          <ToolBtn active={tool === "nas"} onClick={() => flip("nas")} icon={HardDrive}>Ruta de red (SMB)</ToolBtn>
        </div>
      ) : null}

      {tool === "link" && canEdit ? (
        <form action={addClientLink.bind(null, clientId)} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <input name="name" required placeholder="Nombre (ej. Brand kit)" className={inputCls} />
          <input name="url" type="url" required placeholder="https:// (Drive, web…)" className={inputCls} />
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Añadir</button>
        </form>
      ) : null}
      {tool === "nas" && canEdit ? (
        <form action={addClientNasRoute.bind(null, clientId)} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <input name="name" required placeholder="Nombre (ej. Marca / brand kit)" className={inputCls} />
          <input name="path" required placeholder="\\NAS\Labstream\cliente…" className={cn(inputCls, "flex-[2] font-mono")} />
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Añadir ruta</button>
        </form>
      ) : null}

      {files.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          <FolderOpen className="mx-auto mb-2 size-6 opacity-50" />
          Sin archivos del cliente todavía.{canEdit ? " Añade un enlace o una ruta de red." : ""}
        </div>
      ) : (
        <div className="space-y-4">
          {links.length ? (
            <FileGroup title="Enlaces" count={links.length}>
              {links.map((file) => (
                <FileRow key={file.id} file={file} clientId={clientId} canEdit={canEdit} />
              ))}
            </FileGroup>
          ) : null}
          {routes.length ? (
            <FileGroup title="Rutas de red (SMB)" count={routes.length}>
              {routes.map((file) => (
                <FileRow key={file.id} file={file} clientId={clientId} canEdit={canEdit} />
              ))}
            </FileGroup>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FileGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {title} <span>· {count}</span>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{children}</ul>
    </section>
  );
}

function FileRow({ file, clientId, canEdit }: { file: ClientFile; clientId: string; canEdit: boolean }) {
  const isNas = file.kind === "NAS";
  const Icon = isNas ? HardDrive : Link2;
  return (
    <li className="group/file flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/40">
      <Icon className={cn("size-4 shrink-0", isNas ? "text-amber-600" : file.kind === "DRIVE" ? "text-emerald-600" : "text-muted-foreground")} />
      <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
      {isNas && file.path ? (
        <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:block sm:max-w-[20rem]">{file.path}</span>
      ) : null}
      <div className="flex items-center gap-2.5">
        {isNas && file.path ? (
          <CopyPathButton path={file.path} />
        ) : file.url ? (
          <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="size-3.5" /> Abrir
          </a>
        ) : null}
        {canEdit ? (
          <form action={deleteClientFile.bind(null, file.id, clientId)}>
            <ConfirmSubmit message={`¿Eliminar «${file.name}»?`} confirmLabel="Eliminar" className="text-muted-foreground hover:text-destructive opacity-100 md:opacity-0 md:group-hover/file:opacity-100" title="Eliminar">
              <Trash2 className="size-3.5" />
            </ConfirmSubmit>
          </form>
        ) : null}
      </div>
    </li>
  );
}

function ToolBtn({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4" /> {children}
    </button>
  );
}
