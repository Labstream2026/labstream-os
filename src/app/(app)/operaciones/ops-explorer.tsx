"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  FolderInput,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Music,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { opsCreateFolder, opsRename, opsMove, opsTrash } from "./actions";

type Entry = { name: string; rel: string; dir: boolean; size: number | null; mtimeMs: number; ext: string };
type Listing = { path: string; dirs: Entry[]; files: Entry[]; truncated: boolean };

// Tipos que OnlyOffice abre/edita (mismo catálogo que la pestaña Archivos).
const OO_EXT = new Set(["doc", "docx", "odt", "rtf", "txt", "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp", "pdf"]);
const THUMB_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif"]);
const VIDEO_EXT = new Set(["mp4", "m4v", "mov", "mkv", "ogv", "webm"]);
const AUDIO_EXT = new Set(["mp3", "wav", "m4a", "ogg", "weba", "webm"]);

function fmtSize(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDate(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" });
}

function iconFor(ext: string) {
  if (THUMB_EXT.has(ext)) return ImageIcon;
  if (VIDEO_EXT.has(ext)) return Film;
  if (AUDIO_EXT.has(ext)) return Music;
  if (["xls", "xlsx", "ods", "csv"].includes(ext)) return FileSpreadsheet;
  if (OO_EXT.has(ext)) return FileText;
  return FileIcon;
}

function fileUrl(rel: string, download = false) {
  return `/api/ops/file?path=${encodeURIComponent(rel)}${download ? "&download=1" : ""}`;
}

// Explorador EN VIVO de Operaciones_LAB: cada navegación lee el disco real, así que lo que
// alguien suelte por el Finder/SMB aparece aquí al refrescar, sin sincronizar nada.
export function OpsExplorer({ initialPath, canWrite, ooReady }: { initialPath: string; canWrite: boolean; ooReady: boolean }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [path, setPath] = React.useState(initialPath);
  const [data, setData] = React.useState<Listing | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");
  const [newFolder, setNewFolder] = React.useState<string | null>(null); // null = cerrado; string = valor
  const [renaming, setRenaming] = React.useState<{ rel: string; value: string } | null>(null);
  const [moving, setMoving] = React.useState<Entry | null>(null);
  const [uploading, setUploading] = React.useState(0);
  const [notice, setNotice] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/list?path=${encodeURIComponent(p)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "No se pudo listar la carpeta");
      setData(json as Listing);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "No se pudo listar la carpeta");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(path);
  }, [path, load]);

  // La ruta viaja en la URL: se puede compartir un enlace directo a una carpeta.
  const go = (p: string) => {
    setPath(p);
    setFilter("");
    setNewFolder(null);
    setRenaming(null);
    router.replace(p ? `/operaciones?path=${encodeURIComponent(p)}` : "/operaciones", { scroll: false });
  };

  const refresh = () => void load(path);

  async function doUpload(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(files.length);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.set("path", path);
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch("/api/ops/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "No se pudo subir");
      const skipped: string[] = json?.skipped || [];
      if (skipped.length) setNotice(`No se subieron (muy grandes o tipo bloqueado): ${skipped.join(", ")}`);
      refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setUploading(0);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function doCreateFolder() {
    const name = (newFolder || "").trim();
    if (!name) return;
    const r = await opsCreateFolder(path, name);
    if ("error" in r) setNotice(r.error);
    else {
      setNewFolder(null);
      refresh();
    }
  }

  async function doRename() {
    if (!renaming) return;
    const r = await opsRename(renaming.rel, renaming.value);
    if ("error" in r) setNotice(r.error);
    else {
      setRenaming(null);
      refresh();
    }
  }

  async function doTrash(e: Entry) {
    const ok = await confirm({
      title: e.dir ? "Borrar carpeta" : "Borrar archivo",
      message: `«${e.name}» se moverá a la papelera de Operaciones_LAB (#recycle). Se puede recuperar desde File Station en el NAS.`,
      confirmLabel: "Mover a la papelera",
    });
    if (!ok) return;
    const r = await opsTrash(e.rel);
    if ("error" in r) setNotice(r.error);
    else refresh();
  }

  const crumbs = path ? path.split("/") : [];
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const match = (e: Entry) => !filter || norm(e.name).includes(norm(filter));
  const dirs = (data?.dirs || []).filter(match);
  const files = (data?.files || []).filter(match);

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera + miga de pan */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => go("")} className="inline-flex items-center gap-2 text-lg font-semibold hover:text-[#F47A20]">
          <HardDrive className="size-5 text-[#F47A20]" /> Operaciones_LAB
        </button>
        {crumbs.map((seg, i) => {
          const target = crumbs.slice(0, i + 1).join("/");
          const last = i === crumbs.length - 1;
          return (
            <span key={target} className="flex items-center gap-2 text-sm">
              <ChevronRight className="size-4 text-muted-foreground" />
              {last ? (
                <span className="font-medium">{seg}</span>
              ) : (
                <button onClick={() => go(target)} className="text-muted-foreground hover:text-foreground">{seg}</button>
              )}
            </span>
          );
        })}
        <span className="ml-auto text-xs text-muted-foreground">
          {data ? `${data.dirs.length} carpetas · ${data.files.length} archivos` : ""}
        </span>
      </div>

      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2">
        {canWrite ? (
          <>
            <button
              onClick={() => fileInput.current?.click()}
              disabled={uploading > 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {uploading > 0 ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {uploading > 0 ? `Subiendo ${uploading}…` : "Subir aquí"}
            </button>
            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => void doUpload(e.target.files)} />
            <button
              onClick={() => setNewFolder(newFolder === null ? "" : null)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <FolderPlus className="size-4" /> Nueva carpeta
            </button>
          </>
        ) : null}
        <button onClick={refresh} title="Actualizar (lee el disco en vivo)" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted">
          <RefreshCw className={`size-4${loading ? " animate-spin" : ""}`} /> Actualizar
        </button>
        <label className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar esta carpeta…"
            className="w-56 rounded-md border border-border bg-card py-1.5 pl-8 pr-3 text-sm outline-none focus:border-[#F47A20]"
          />
        </label>
      </div>

      {notice ? (
        <p className="flex items-start justify-between gap-2 rounded-md border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Cerrar aviso"><X className="size-4" /></button>
        </p>
      ) : null}
      {data?.truncated ? (
        <p className="text-xs text-muted-foreground">Esta carpeta tiene más de 2000 elementos: se muestran los primeros (organízala en subcarpetas).</p>
      ) : null}

      {/* Crear carpeta (fila inline) */}
      {newFolder !== null ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void doCreateFolder();
          }}
          className="flex items-center gap-2 rounded-md border border-dashed border-border bg-card px-3 py-2"
        >
          <Folder className="size-4 text-[#F47A20]" />
          <input
            autoFocus
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            placeholder="Nombre de la carpeta nueva"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button type="submit" className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">Crear</button>
          <button type="button" onClick={() => setNewFolder(null)} className="rounded-md border border-border px-2.5 py-1 text-xs">Cancelar</button>
        </form>
      ) : null}

      {/* Listado */}
      {error ? (
        <div className="rounded-md border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {error}
          {path ? (
            <div className="mt-2">
              <button onClick={() => go("")} className="text-[#F47A20] hover:underline">Volver a la raíz</button>
            </div>
          ) : null}
        </div>
      ) : loading && !data ? (
        <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Leyendo el disco…
        </div>
      ) : dirs.length === 0 && files.length === 0 ? (
        <div className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {filter ? "Nada coincide con el filtro." : "Carpeta vacía. Lo que agregues aquí (o por el Finder/SMB) aparece en ambos lados al instante."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <ul className="divide-y divide-border">
            {dirs.map((d) => (
              <li key={d.rel} className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/60">
                {renaming?.rel === d.rel ? (
                  <RenameRow icon={<Folder className="size-5 shrink-0 text-[#F47A20]" />} renaming={renaming} setRenaming={setRenaming} onSave={doRename} />
                ) : (
                  <>
                    <button onClick={() => go(d.rel)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <Folder className="size-5 shrink-0 text-[#F47A20]" />
                      <span className="truncate text-sm font-medium">{d.name}</span>
                    </button>
                    {canWrite ? (
                      <RowActions
                        onRename={() => setRenaming({ rel: d.rel, value: d.name })}
                        onMove={() => setMoving(d)}
                        onTrash={() => void doTrash(d)}
                      />
                    ) : null}
                  </>
                )}
              </li>
            ))}
            {files.map((f) => {
              const Icon = iconFor(f.ext);
              const editable = ooReady && OO_EXT.has(f.ext);
              return (
                <li key={f.rel} className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/60">
                  {renaming?.rel === f.rel ? (
                    <RenameRow icon={<Icon className="size-5 shrink-0 text-muted-foreground" />} renaming={renaming} setRenaming={setRenaming} onSave={doRename} />
                  ) : (
                    <>
                      <a href={fileUrl(f.rel)} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                        {THUMB_EXT.has(f.ext) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/ops/thumb?path=${encodeURIComponent(f.rel)}&v=${Math.round(f.mtimeMs)}`}
                            alt=""
                            loading="lazy"
                            className="size-9 shrink-0 rounded object-cover ring-1 ring-border"
                          />
                        ) : (
                          <Icon className="size-5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{f.name}</span>
                          <span className="block text-xs text-muted-foreground">{fmtSize(f.size)}{f.mtimeMs ? ` · ${fmtDate(f.mtimeMs)}` : ""}</span>
                        </span>
                      </a>
                      {editable ? (
                        <a
                          href={`/docs/ops?path=${encodeURIComponent(f.rel)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hidden rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted group-hover:inline-flex"
                        >
                          {canWrite ? "Editar" : "Abrir"}
                        </a>
                      ) : null}
                      <a
                        href={fileUrl(f.rel, true)}
                        className="hidden rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted group-hover:inline-flex"
                      >
                        Descargar
                      </a>
                      {canWrite ? (
                        <RowActions
                          onRename={() => setRenaming({ rel: f.rel, value: f.name })}
                          onMove={() => setMoving(f)}
                          onTrash={() => void doTrash(f)}
                        />
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Esta vista lee el disco en vivo: lo que el equipo agregue por el Finder o el Explorador (SMB) aparece aquí, y lo que subas aquí aparece allá. Borrar envía a la papelera de la carpeta compartida.
      </p>

      {moving ? (
        <MoveDialog
          entry={moving}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null);
            refresh();
          }}
          onError={(m) => setNotice(m)}
        />
      ) : null}
      {dialog}
    </div>
  );
}

function RowActions({ onRename, onMove, onTrash }: { onRename: () => void; onMove: () => void; onTrash: () => void }) {
  return (
    <span className="hidden items-center gap-1 group-hover:flex">
      <button onClick={onRename} title="Renombrar" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-4" /></button>
      <button onClick={onMove} title="Mover a otra carpeta" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><FolderInput className="size-4" /></button>
      <button onClick={onTrash} title="Mover a la papelera" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500"><Trash2 className="size-4" /></button>
    </span>
  );
}

function RenameRow({
  icon,
  renaming,
  setRenaming,
  onSave,
}: {
  icon: React.ReactNode;
  renaming: { rel: string; value: string };
  setRenaming: (r: { rel: string; value: string } | null) => void;
  onSave: () => void | Promise<void>;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave();
      }}
      className="flex min-w-0 flex-1 items-center gap-3"
    >
      {icon}
      <input
        autoFocus
        value={renaming.value}
        onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-[#F47A20]"
      />
      <button type="submit" title="Guardar" className="rounded-md p-1.5 text-green-600 hover:bg-muted"><Check className="size-4" /></button>
      <button type="button" title="Cancelar" onClick={() => setRenaming(null)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
    </form>
  );
}

// Selector de carpeta destino: mini-explorador solo de carpetas sobre la misma API en vivo.
function MoveDialog({
  entry,
  onClose,
  onMoved,
  onError,
}: {
  entry: Entry;
  onClose: () => void;
  onMoved: () => void;
  onError: (msg: string) => void;
}) {
  const [path, setPath] = React.useState("");
  const [dirs, setDirs] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/ops/list?path=${encodeURIComponent(path)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive) setDirs((j?.dirs as Entry[]) || []);
      })
      .catch(() => {
        if (alive) setDirs([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  const crumbs = path ? path.split("/") : [];
  // No ofrecer moverla dentro de sí misma.
  const selectable = !(entry.dir && (path === entry.rel || path.startsWith(entry.rel + "/")));
  const parentOfEntry = entry.rel.includes("/") ? entry.rel.slice(0, entry.rel.lastIndexOf("/")) : "";

  async function doMove() {
    setBusy(true);
    const r = await opsMove(entry.rel, path);
    setBusy(false);
    if ("error" in r) onError(r.error);
    else onMoved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[70vh] w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-xl">
        <p className="text-sm font-semibold">Mover «{entry.name}» a…</p>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <button onClick={() => setPath("")} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <HardDrive className="size-3.5" /> Operaciones_LAB
          </button>
          {crumbs.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <button onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))} className="hover:text-foreground">{seg}</button>
            </span>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
          {loading ? (
            <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Leyendo…</p>
          ) : dirs.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Sin subcarpetas aquí.</p>
          ) : (
            <ul className="divide-y divide-border">
              {dirs
                .filter((d) => d.rel !== entry.rel)
                .map((d) => (
                  <li key={d.rel}>
                    <button onClick={() => setPath(d.rel)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                      <Folder className="size-4 text-[#F47A20]" /> <span className="truncate">{d.name}</span>
                      <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm">Cancelar</button>
          <button
            onClick={() => void doMove()}
            disabled={busy || !selectable || path === parentOfEntry}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FolderInput className="size-4" />} Mover aquí
          </button>
        </div>
      </div>
    </div>
  );
}
