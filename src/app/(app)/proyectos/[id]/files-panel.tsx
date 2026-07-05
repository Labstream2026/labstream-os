"use client";

import * as React from "react";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileType,
  File as FileIcon,
  Link2,
  Upload,
  FolderPlus,
  MoreHorizontal,
  Trash2,
  Download,
  Eye,
  Pencil,
  HardDrive,
  Copy,
  Check,
  CheckSquare,
} from "lucide-react";
import { tone, TONES } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { addFile, addNasRoute, deleteFile, uploadProjectFiles, createFolder, updateFolder, deleteFolder } from "./actions";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { EmojiSelect } from "@/components/emoji-select";

type FileAsset = { id: string; name: string; kind: string; url: string | null; path?: string | null; editable: boolean; task?: { id: string; title: string } | null };

// Botón "Copiar ruta" para rutas de red SMB: el navegador no abre \\servidor\carpeta,
// así que la copiamos al portapapeles para pegarla en el explorador de archivos.
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
type FolderItem = { id: string; name: string; icon: string | null; color: string | null; files: FileAsset[] };

export function FilesPanel({
  projectId,
  folders,
  looseFiles,
}: {
  projectId: string;
  folders: FolderItem[];
  looseFiles: FileAsset[];
}) {
  const [tool, setTool] = React.useState<null | "upload" | "link" | "nas" | "folder">(null);
  const [open, setOpen] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(folders.filter((f) => f.files.length).map((f) => [f.id, true])),
  );
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const flip = (t: "upload" | "link" | "nas" | "folder") => setTool((cur) => (cur === t ? null : t));

  const empty = folders.length === 0 && looseFiles.length === 0;

  return (
    <div className="space-y-3">
      {/* Barra de acciones (estilo Finder: limpia, las opciones se despliegan al pulsar) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolBtn active={tool === "upload"} onClick={() => flip("upload")} icon={Upload}>Subir archivos</ToolBtn>
        <ToolBtn active={tool === "link"} onClick={() => flip("link")} icon={Link2}>Añadir enlace</ToolBtn>
        <ToolBtn active={tool === "nas"} onClick={() => flip("nas")} icon={HardDrive}>Ruta de red (SMB)</ToolBtn>
        <ToolBtn active={tool === "folder"} onClick={() => flip("folder")} icon={FolderPlus}>Nueva carpeta</ToolBtn>
      </div>

      {/* Formulario activo */}
      {tool === "upload" ? (
        <form action={uploadProjectFiles.bind(null, projectId)} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <input type="file" name="files" multiple required className="min-w-44 flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium" />
          <FolderSelect folders={folders} />
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Subir</button>
        </form>
      ) : null}
      {tool === "link" ? (
        <form action={addFile.bind(null, projectId)} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <input name="name" required placeholder="Nombre" className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input name="url" type="url" required placeholder="https:// (Drive, web…)" className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <FolderSelect folders={folders} />
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Añadir</button>
        </form>
      ) : null}
      {tool === "nas" ? (
        <form action={addNasRoute.bind(null, projectId)} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <input name="name" required placeholder="Nombre (ej. Material rodaje)" className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input name="path" required placeholder="\\NAS\Labstream\proyecto…" className="min-w-48 flex-[2] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring" />
          <FolderSelect folders={folders} />
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Añadir ruta</button>
        </form>
      ) : null}
      {tool === "folder" ? (
        <form action={createFolder.bind(null, projectId)} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <input name="name" required placeholder="Nombre de la carpeta" className="min-w-44 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <EmojiSelect name="icon" fallback="📁" />
          <ColorSelect />
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Crear</button>
        </form>
      ) : null}

      {/* Lista tipo Finder: carpetas (expandibles) + archivos, en una sola lista limpia */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {empty ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            Aún no hay archivos. Sube uno, añade un enlace o crea una carpeta.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {folders.map((folder) => {
              const t = tone(folder.color);
              const isOpen = !!open[folder.id];
              return (
                <li key={folder.id}>
                  <div className="group/row flex items-center gap-1 px-2 py-1.5 hover:bg-muted/40">
                    <button
                      type="button"
                      onClick={() => toggle(folder.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
                    >
                      <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                      {folder.icon ? (
                        <span className="text-base leading-none">{folder.icon}</span>
                      ) : isOpen ? (
                        <FolderOpen className="size-4 shrink-0" style={folder.color ? { color: t.hex } : undefined} />
                      ) : (
                        <Folder className="size-4 shrink-0" style={folder.color ? { color: t.hex } : undefined} />
                      )}
                      <span className="truncate text-sm font-medium">{folder.name}</span>
                      <span className="text-xs text-muted-foreground">{folder.files.length}</span>
                    </button>
                    <FolderMenu folder={folder} projectId={projectId} />
                  </div>
                  {isOpen ? (
                    folder.files.length > 0 ? (
                      <ul>
                        {folder.files.map((file) => (
                          <FileRow key={file.id} file={file} projectId={projectId} indent />
                        ))}
                      </ul>
                    ) : (
                      <p className="py-2 pl-12 text-xs text-muted-foreground">Carpeta vacía</p>
                    )
                  ) : null}
                </li>
              );
            })}
            {looseFiles.map((file) => (
              <li key={file.id}>
                <FileRow file={file} projectId={projectId} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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

function FolderSelect({ folders }: { folders: FolderItem[] }) {
  return (
    <select name="folderId" defaultValue="" className="rounded-md border border-input bg-background px-2 py-2 text-sm">
      <option value="">Sin carpeta</option>
      {folders.map((f) => (<option key={f.id} value={f.id}>{f.name}</option>))}
    </select>
  );
}

function ColorSelect({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <select name="color" defaultValue={defaultValue} className="rounded-md border border-input bg-background px-2 py-2 text-sm">
      <option value="">Sin color</option>
      {TONES.map((t) => (<option key={t.key} value={t.key}>{t.label}</option>))}
    </select>
  );
}

function FolderMenu({ folder, projectId }: { folder: FolderItem; projectId: string }) {
  return (
    <details data-autoclose className="relative shrink-0">
      <summary className="flex size-7 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/row:opacity-100">
        <MoreHorizontal className="size-4" />
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-border bg-popover p-3 shadow-lg">
        <form action={updateFolder.bind(null, folder.id, projectId)} className="space-y-2">
          <input name="name" defaultValue={folder.name} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
          <div className="flex gap-2">
            <EmojiSelect name="icon" defaultValue={folder.icon} fallback="📁" />
            <ColorSelect defaultValue={folder.color ?? ""} />
          </div>
          <button className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Guardar</button>
        </form>
        <form action={deleteFolder.bind(null, folder.id, projectId)} className="mt-2 border-t border-border pt-2">
          <ConfirmSubmit
            message={`¿Eliminar la carpeta «${folder.name}»? Sus archivos quedan sin carpeta.`}
            confirmLabel="Eliminar carpeta"
            className="text-xs text-destructive hover:underline"
          >
            Eliminar carpeta
          </ConfirmSubmit>
        </form>
      </div>
    </details>
  );
}

function fileIcon(name: string, kind: string) {
  if (kind === "NAS") return { Icon: HardDrive, color: "text-amber-600" };
  if (kind === "DRIVE") return { Icon: Link2, color: "text-emerald-600" };
  if (kind === "LINK") return { Icon: Link2, color: "text-muted-foreground" };
  if (/\.(docx?|odt|rtf)$/i.test(name)) return { Icon: FileText, color: "text-blue-600" };
  if (/\.(xlsx?|csv|ods)$/i.test(name)) return { Icon: FileSpreadsheet, color: "text-emerald-600" };
  if (/\.(pptx?|odp)$/i.test(name)) return { Icon: Presentation, color: "text-orange-600" };
  if (/\.pdf$/i.test(name)) return { Icon: FileType, color: "text-red-600" };
  return { Icon: FileIcon, color: "text-muted-foreground" };
}

function FileRow({ file, projectId, indent }: { file: FileAsset; projectId: string; indent?: boolean }) {
  const { Icon, color } = fileIcon(file.name, file.kind);
  return (
    <div className={cn("group/file flex items-center gap-2.5 py-2 pr-2 hover:bg-muted/40", indent ? "pl-12" : "pl-3")}>
      <Icon className={cn("size-4 shrink-0", color)} />
      <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
      {/* Chip de la tarea a la que pertenece este archivo/enlace (si se añadió desde una tarea). */}
      {file.task ? (
        <a href={`/proyectos/${projectId}?tab=tareas`} title={`Tarea: ${file.task.title}`} className="hidden shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 sm:inline-flex">
          <CheckSquare className="size-3" />
          <span className="max-w-[8rem] truncate">{file.task.title}</span>
        </a>
      ) : null}
      {file.kind === "NAS" && file.path ? (
        <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:block sm:max-w-[16rem]">{file.path}</span>
      ) : null}
      <div className="flex items-center gap-2.5 opacity-100 md:opacity-0 md:group-hover/file:opacity-100">
        {file.kind === "NAS" && file.path ? (
          <CopyPathButton path={file.path} />
        ) : file.kind === "LOCAL" ? (
          <>
            <a href={`/api/files-asset/${file.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title="Ver"><Eye className="size-3.5" /></a>
            {file.editable ? (
              <a href={`/docs/file/${file.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" title="Editar"><Pencil className="size-3.5" /></a>
            ) : null}
            <a href={`/api/files-asset/${file.id}?download=1`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title="Descargar"><Download className="size-3.5" /></a>
          </>
        ) : file.url ? (
          <a href={file.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Abrir</a>
        ) : null}
        <form action={deleteFile.bind(null, file.id, projectId)}>
          <ConfirmSubmit
            message={`¿Eliminar «${file.name}»?`}
            confirmLabel="Eliminar"
            className="text-muted-foreground hover:text-destructive"
            title="Eliminar"
          >
            <Trash2 className="size-3.5" />
          </ConfirmSubmit>
        </form>
      </div>
    </div>
  );
}
