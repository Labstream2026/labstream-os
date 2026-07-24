"use client";

import * as React from "react";
import Link from "next/link";
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
  MessageCircle,
  Search,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import { tone, TONES } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { addFile, addNasRoute, deleteFile, uploadProjectFiles, createFolder, updateFolder, deleteFolder } from "./actions";
import { OpsFolderPicker } from "./ops-folder-picker";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { EmojiSelect } from "@/components/emoji-select";

type FileAsset = { id: string; name: string; kind: string; url: string | null; path?: string | null; editable: boolean; viaClientLink?: boolean; task?: { id: string; title: string } | null; chat?: { channelId: string; messageId: string } | null; missing?: boolean };

// Carpeta viva de Operaciones_LAB vinculada al proyecto (solo equipo; el cliente no la ve).
type OpsLiveFile = { name: string; rel: string; size: number | null; mtimeMs: number; ext: string };
type OpsInfo = {
  folder: string; // ruta relativa dentro de Operaciones_LAB
  ok: boolean; // la carpeta existe/responde en el disco
  live: OpsLiveFile[]; // archivos EN el disco que no están registrados en el proyecto
  dirs: { name: string; rel: string }[];
  ooReady: boolean;
};

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

// A2 · Origen de un archivo (para filtrar): de dónde llegó al proyecto.
type Origin = "cliente" | "chat" | "tarea" | "enlace" | "nas";
function matchesOrigin(f: FileAsset, o: Origin): boolean {
  if (o === "cliente") return !!f.viaClientLink;
  if (o === "chat") return !!f.chat;
  if (o === "tarea") return !!f.task;
  if (o === "enlace") return f.kind === "LINK" || f.kind === "DRIVE";
  return f.kind === "NAS" || f.kind === "OPS";
}
const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

export function FilesPanel({
  projectId,
  folders,
  looseFiles,
  ops = null,
  canLinkOps = false,
}: {
  projectId: string;
  folders: FolderItem[];
  looseFiles: FileAsset[];
  // Carpeta viva de Operaciones_LAB (null = sin vincular o usuario sin acceso a rutas NAS).
  ops?: OpsInfo | null;
  // Puede vincular/cambiar la carpeta (equipo con escritura y NAS_OPS_DIR montado).
  canLinkOps?: boolean;
}) {
  const [tool, setTool] = React.useState<null | "upload" | "link" | "nas" | "folder">(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [open, setOpen] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(folders.filter((f) => f.files.length).map((f) => [f.id, true])),
  );
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const flip = (t: "upload" | "link" | "nas" | "folder") => setTool((cur) => (cur === t ? null : t));

  // A1 · Vista lista/cuadrícula (recordada por dispositivo) + A2 · buscador y filtro por origen.
  const [view, setView] = React.useState<"lista" | "cuadricula">("lista");
  React.useEffect(() => {
    const v = localStorage.getItem("files-view");
    if (v === "cuadricula" || v === "lista") setView(v);
  }, []);
  const changeView = (v: "lista" | "cuadricula") => { setView(v); localStorage.setItem("files-view", v); };
  const [q, setQ] = React.useState("");
  const [origin, setOrigin] = React.useState<Origin | null>(null);
  const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const match = (f: FileAsset) => (!q.trim() || norm(f.name).includes(norm(q))) && (!origin || matchesOrigin(f, origin));
  const filtering = q.trim().length > 0 || origin !== null;
  const shownFolders = folders
    .map((f) => ({ ...f, files: f.files.filter(match) }))
    .filter((f) => !filtering || f.files.length > 0);
  const shownLoose = looseFiles.filter(match);
  const allFiles = [...folders.flatMap((f) => f.files), ...looseFiles];
  const gridFiles = [...shownFolders.flatMap((f) => f.files), ...shownLoose];
  const originChips: { key: Origin; label: string }[] = [
    { key: "cliente", label: "Del cliente" },
    { key: "chat", label: "Del chat" },
    { key: "tarea", label: "De tareas" },
    { key: "enlace", label: "Enlaces" },
    { key: "nas", label: "Rutas NAS" },
  ];

  const empty = folders.length === 0 && looseFiles.length === 0;

  return (
    <div className="space-y-3">
      {/* Barra de acciones (estilo Finder: limpia, las opciones se despliegan al pulsar) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolBtn active={tool === "upload"} onClick={() => flip("upload")} icon={Upload}>Subir archivos</ToolBtn>
        <ToolBtn active={tool === "link"} onClick={() => flip("link")} icon={Link2}>Añadir enlace</ToolBtn>
        <ToolBtn active={tool === "nas"} onClick={() => flip("nas")} icon={HardDrive}>Ruta de red (SMB)</ToolBtn>
        <ToolBtn active={tool === "folder"} onClick={() => flip("folder")} icon={FolderPlus}>Nueva carpeta</ToolBtn>
        {canLinkOps && !ops ? (
          <ToolBtn active={pickerOpen} onClick={() => setPickerOpen(true)} icon={HardDrive}>Vincular carpeta del NAS</ToolBtn>
        ) : null}
      </div>

      {/* Formulario activo */}
      {tool === "upload" ? (
        <form action={uploadProjectFiles.bind(null, projectId)} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <input type="file" name="files" multiple required className="min-w-44 flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium" />
          <FolderSelect folders={folders} />
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Subir</button>
          {ops ? (
            // Con carpeta vinculada, el destino predeterminado es Operaciones_LAB; el checkbox
            // fuerza el almacenamiento interno de la app para casos puntuales.
            <label className="flex w-full items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="internal" className="accent-[#F47A20]" />
              Guardar en el almacenamiento interno (no en Operaciones_LAB/{ops.folder})
            </label>
          ) : null}
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

      {/* A2 · Buscador + filtro por origen + A1 · toggle lista/cuadrícula */}
      {!empty ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-44 flex-1 sm:max-w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar archivo…"
              className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {originChips.map((c) => {
            const n = allFiles.filter((f) => matchesOrigin(f, c.key)).length;
            if (!n) return null;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setOrigin(origin === c.key ? null : c.key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  origin === c.key ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {c.label} · {n}
              </button>
            );
          })}
          <div className="ml-auto inline-flex overflow-hidden rounded-md border border-border text-xs">
            {([["lista", ListIcon], ["cuadricula", LayoutGrid]] as const).map(([v, Icon]) => (
              <button
                key={v}
                type="button"
                title={v === "lista" ? "Lista" : "Cuadrícula (miniaturas)"}
                onClick={() => changeView(v)}
                className={cn("px-2.5 py-1.5", view === v ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Carpeta VIVA de Operaciones_LAB: lo que hay EN el disco del NAS ahora mismo (lo
          registrado en el proyecto sale en la lista de abajo; aquí, lo agregado por Finder/SMB). */}
      {ops ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
            <HardDrive className="size-4 text-[#F47A20]" />
            <span className="text-sm font-medium">Operaciones_LAB/{ops.folder}</span>
            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">en vivo</span>
            <span className="ml-auto flex items-center gap-2">
              <a href={`/operaciones?path=${encodeURIComponent(ops.folder)}`} className="text-xs text-primary hover:underline">Abrir en Operaciones</a>
              {canLinkOps ? (
                <button type="button" onClick={() => setPickerOpen(true)} className="text-xs text-muted-foreground hover:text-foreground">Cambiar</button>
              ) : null}
            </span>
          </div>
          {!ops.ok ? (
            <p className="px-3 py-3 text-sm text-amber-600 dark:text-amber-400">
              La carpeta no responde: ¿la movieron o renombraron desde el NAS? Vincula la nueva ubicación con «Cambiar».
            </p>
          ) : (
            <>
              {ops.dirs.length ? (
                <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                  {ops.dirs.map((d) => (
                    <a key={d.rel} href={`/operaciones?path=${encodeURIComponent(d.rel)}`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                      <Folder className="size-3.5 text-[#F47A20]" /> {d.name}
                    </a>
                  ))}
                </div>
              ) : null}
              {ops.live.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-muted-foreground">Nada suelto en la carpeta: todo lo que hay está registrado abajo. Lo que el equipo suelte por el Finder aparecerá aquí.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {ops.live.map((f) => {
                    const { Icon, color } = fileIcon(f.name, "OPS");
                    return (
                      <li key={f.rel} className="group/live flex items-center gap-2.5 py-2 pl-3 pr-2 hover:bg-muted/40">
                        {IMG_EXT.test(f.name) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/ops/thumb?path=${encodeURIComponent(f.rel)}&v=${Math.round(f.mtimeMs)}`} alt="" loading="lazy" className="size-8 shrink-0 rounded object-cover ring-1 ring-border" />
                        ) : (
                          <Icon className={cn("size-4 shrink-0", color)} />
                        )}
                        <a href={`/api/ops/file?path=${encodeURIComponent(f.rel)}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm hover:underline">{f.name}</a>
                        <span className="hidden shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 sm:inline-flex" title="Está en el disco pero llegó por fuera de la app (Finder/SMB)">desde el NAS</span>
                        <div className="flex items-center gap-2.5 opacity-100 md:opacity-0 md:group-hover/live:opacity-100">
                          {ops.ooReady && /\.(docx?|odt|rtf|txt|xlsx?|ods|csv|pptx?|odp|pdf)$/i.test(f.name) ? (
                            <a href={`/docs/ops?path=${encodeURIComponent(f.rel)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" title="Editar en OnlyOffice"><Pencil className="size-3.5" /></a>
                          ) : null}
                          <a href={`/api/ops/file?path=${encodeURIComponent(f.rel)}&download=1`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title="Descargar"><Download className="size-3.5" /></a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      ) : null}

      {/* A1 · Cuadrícula con miniaturas (imágenes reales; el resto, icono grande) */}
      {!empty && view === "cuadricula" ? (
        gridFiles.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Nada coincide con ese filtro.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
            {gridFiles.map((file) => (
              <GridCard key={file.id} file={file} />
            ))}
          </div>
        )
      ) : null}

      {/* Lista tipo Finder: carpetas (expandibles) + archivos, en una sola lista limpia */}
      <div className={cn("overflow-hidden rounded-xl border border-border bg-card", !empty && view === "cuadricula" && "hidden")}>
        {empty ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            Aún no hay archivos. Sube uno, añade un enlace o crea una carpeta.
          </p>
        ) : filtering && shownFolders.length === 0 && shownLoose.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nada coincide con ese filtro.</p>
        ) : (
          <ul className="divide-y divide-border">
            {shownFolders.map((folder) => {
              const t = tone(folder.color);
              const isOpen = !!open[folder.id] || filtering;
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
            {shownLoose.map((file) => (
              <li key={file.id}>
                <FileRow file={file} projectId={projectId} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {pickerOpen ? <OpsFolderPicker projectId={projectId} current={ops?.folder ?? null} onClose={() => setPickerOpen(false)} /> : null}
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
      {/* Chip «cliente»: material que subió el cliente por el enlace público de subida. */}
      {file.viaClientLink ? (
        <span className="hidden shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary sm:inline-flex">cliente</span>
      ) : null}
      {/* Chip «chat»: archivo compartido en el chat del proyecto; enlaza al mensaje original. */}
      {file.chat ? (
        <Link
          href={`/chat/${file.chat.channelId}?msg=${file.chat.messageId}`}
          title="Compartido en el chat — abrir el mensaje"
          className="hidden shrink-0 items-center gap-1 rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-600 hover:bg-orange-500/20 sm:inline-flex"
        >
          <MessageCircle className="size-3" /> chat
        </Link>
      ) : null}
      {/* Chip de la tarea a la que pertenece este archivo/enlace (si se añadió desde una tarea). */}
      {file.task ? (
        <a href={`/proyectos/${projectId}?tab=tareas`} title={`Tarea: ${file.task.title}`} className="hidden shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 sm:inline-flex">
          <CheckSquare className="size-3" />
          <span className="max-w-[8rem] truncate">{file.task.title}</span>
        </a>
      ) : null}
      {/* Chip «NAS»: archivo VIVO de Operaciones_LAB (kind OPS); el título muestra la ruta. */}
      {file.kind === "OPS" ? (
        <span
          title={file.path ? `Operaciones_LAB/${file.path}` : "Vive en Operaciones_LAB"}
          className="hidden shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 sm:inline-flex"
        >
          <HardDrive className="size-3" /> NAS
        </span>
      ) : null}
      {/* El archivo registrado ya no está en el disco (¿movido/renombrado desde el NAS?). */}
      {file.missing ? (
        <span className="hidden shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 sm:inline-flex" title="No se encontró en Operaciones_LAB: lo movieron o renombraron desde el NAS. Búscalo en el explorador de Operaciones.">
          ¿movido?
        </span>
      ) : null}
      {file.kind === "NAS" && file.path ? (
        <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:block sm:max-w-[16rem]">{file.path}</span>
      ) : null}
      <div className="flex items-center gap-2.5 opacity-100 md:opacity-0 md:group-hover/file:opacity-100">
        {file.kind === "NAS" && file.path ? (
          <CopyPathButton path={file.path} />
        ) : file.kind === "LOCAL" || file.kind === "OPS" ? (
          <>
            <a href={`/api/files-asset/${file.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title="Ver"><Eye className="size-3.5" /></a>
            {file.editable && !file.missing ? (
              <a href={`/docs/file/${file.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" title="Editar"><Pencil className="size-3.5" /></a>
            ) : null}
            <a href={`/api/files-asset/${file.id}?download=1`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title="Descargar"><Download className="size-3.5" /></a>
          </>
        ) : file.url ? (
          <a href={file.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Abrir</a>
        ) : null}
        <form action={deleteFile.bind(null, file.id, projectId)}>
          <ConfirmSubmit
            message={file.kind === "OPS" ? `¿Quitar «${file.name}» del proyecto? El archivo NO se borra: sigue en Operaciones_LAB (y aparecerá en la sección «en vivo»).` : `¿Eliminar «${file.name}»?`}
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

// A1 · Tarjeta de la cuadrícula: miniatura real para imágenes locales (la vista previa WebP
// que ya sirve /api/files-asset), icono grande para el resto. Clic = ver/abrir.
function GridCard({ file }: { file: FileAsset }) {
  const { Icon, color } = fileIcon(file.name, file.kind);
  const isImg = (file.kind === "LOCAL" || (file.kind === "OPS" && !file.missing)) && IMG_EXT.test(file.name);
  const href = file.kind === "LOCAL" || file.kind === "OPS" ? `/api/files-asset/${file.id}` : file.url || null;
  const body = (
    <>
      {isImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files-asset/${file.id}`} alt={file.name} loading="lazy" className="aspect-square w-full bg-muted/40 object-cover" />
      ) : (
        <div className="grid aspect-square w-full place-items-center bg-muted/40">
          <Icon className={cn("size-8", color)} />
        </div>
      )}
      <p className="truncate px-2 py-1.5 text-[11px] font-medium" title={file.name}>{file.name}</p>
    </>
  );
  const cls = "block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/40";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls} title={file.kind === "LOCAL" ? "Ver" : "Abrir enlace"}>
        {body}
      </a>
    );
  }
  return (
    <div className={cls} title={file.path ?? file.name}>
      {body}
      {file.path ? <div className="px-2 pb-1.5"><CopyPathButton path={file.path} /></div> : null}
    </div>
  );
}
