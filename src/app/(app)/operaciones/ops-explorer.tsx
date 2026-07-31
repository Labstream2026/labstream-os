"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  FolderInput,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  Music,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { cerrarMenu } from "@/components/ui/barra-menu";
import { usePreferenciaUsuario } from "@/components/ui/pref-usuario";
import { Miniatura, type TipoPieza } from "@/components/discos/miniatura";
import { cn } from "@/lib/utils";
import { tone } from "@/lib/colors";
import { opsCreateFolder, opsRename, opsMove, opsCopy, opsTrash } from "./actions";

type Entry = { name: string; rel: string; dir: boolean; size: number | null; mtimeMs: number; ext: string; miniatura?: boolean };
// El dueño de una carpeta, cuando su nombre delata al cliente (lo resuelve el servidor con
// las guardas de dueno-carpeta). Su color ordena la pantalla igual que en el disco de entregas.
type Dueno = { id: string; nombre: string; color: string | null };
type Listing = { path: string; dirs: Entry[]; files: Entry[]; truncated: boolean; duenos?: Record<string, Dueno> };

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

// Qué es la pieza, para la miniatura compartida (la misma que usan la Galería, la ficha del
// disco y el selector de entregables: una sola forma de pintar material en toda la app).
function tipoPieza(ext: string): TipoPieza {
  if (VIDEO_EXT.has(ext)) return "video";
  if (THUMB_EXT.has(ext)) return "foto";
  if (AUDIO_EXT.has(ext)) return "audio";
  return "doc";
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
export function OpsExplorer({
  initialPath,
  canWrite,
  canOrganizar,
  canBorrar,
  vistaInicial,
  ooReady,
}: {
  initialPath: string;
  // Tres llaves, no una: subir/crear (escribir_discos), mover/copiar/renombrar
  // (organizar_discos) y papelera (borrar_discos). Cada botón sale solo con su llave — y el
  // servidor vuelve a comprobarla, que los botones se pueden fabricar.
  canWrite: boolean;
  canOrganizar: boolean;
  canBorrar: boolean;
  // La vista que esta persona dejó elegida (de su perfil, no del navegador).
  vistaInicial?: "lista" | "cuadricula";
  ooReady: boolean;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [path, setPath] = React.useState(initialPath);
  const [data, setData] = React.useState<Listing | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");
  // La vista se guarda en el PERFIL de quien la elige: lo sigue a cualquier navegador.
  const [vista, setVista] = usePreferenciaUsuario<"lista" | "cuadricula">("discos.vista", vistaInicial, "lista");
  const [newFolder, setNewFolder] = React.useState<string | null>(null); // null = cerrado; string = valor
  const [renaming, setRenaming] = React.useState<{ rel: string; value: string } | null>(null);
  const [moving, setMoving] = React.useState<Entry | null>(null);
  const [uploading, setUploading] = React.useState(0);
  const [notice, setNotice] = React.useState<string | null>(null);
  // El portapapeles del disco: «Copiar» guarda la pieza aquí y «Pegar» la duplica donde
  // estés parado. Vive en la pantalla (no cruza discos ni pestañas), y se queda cargado
  // después de pegar: la misma pieza se puede soltar en varias carpetas seguidas.
  const [porta, setPorta] = React.useState<{ rel: string; name: string } | null>(null);
  const [pegando, setPegando] = React.useState(false);
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

  async function doPaste() {
    if (!porta || pegando) return;
    setPegando(true);
    setNotice(null);
    const r = await opsCopy(porta.rel, path);
    setPegando(false);
    if ("error" in r) setNotice(r.error);
    else refresh();
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

  const duenos = data?.duenos || {};

  return (
    <div className="flex flex-col gap-3">
      {/* Todo vive en UNA tarjeta —migas arriba, material en medio, el estado abajo—, el mismo
          lenguaje que la ficha del disco en la Biblioteca: un solo sitio donde mirar, no una
          pila de cajas sueltas. */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Migas + herramientas */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-xs">
            <button
              type="button"
              onClick={() => go("")}
              title="Raíz de Operaciones_LAB"
              className={cn(
                "inline-flex max-w-[13rem] items-center gap-1.5 truncate rounded px-1.5 py-0.5 hover:bg-accent",
                crumbs.length === 0 ? "font-semibold" : "text-muted-foreground",
              )}
            >
              <HardDrive className="size-3.5 shrink-0 text-[#F47A20]" />
              Todo el disco
            </button>
            {crumbs.map((seg, i) => {
              const target = crumbs.slice(0, i + 1).join("/");
              const last = i === crumbs.length - 1;
              return (
                <React.Fragment key={target}>
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
                  <button
                    type="button"
                    onClick={() => go(target)}
                    className={cn("max-w-[11rem] truncate rounded px-1.5 py-0.5 hover:bg-accent", last ? "font-semibold" : "text-muted-foreground")}
                  >
                    {seg}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
          <label className="relative shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar esta carpeta…"
              className="w-40 rounded-md border border-border bg-background py-1 pl-8 pr-2 text-xs outline-none focus:border-primary"
            />
          </label>
          {/* Lista para leer nombres, cuadrícula para reconocer material a ojo. La lista sigue
              siendo la de siempre —con sus acciones al pasar el ratón—; la cuadrícula se suma. */}
          <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border" role="group" aria-label="Vista">
            {([["lista", List, "Lista"], ["cuadricula", LayoutGrid, "Cuadrícula"]] as const).map(([k, Icono, etiqueta]) => (
              <button
                key={k}
                type="button"
                onClick={() => setVista(k)}
                title={etiqueta}
                aria-label={etiqueta}
                aria-pressed={vista === k}
                className={cn(
                  "flex size-7 items-center justify-center",
                  vista === k ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icono className="size-3.5" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={refresh}
            title="Actualizar (lee el disco en vivo)"
            className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </button>
          {/* El portapapeles cargado: pega en la carpeta donde estés parado. La ✕ lo vacía. */}
          {porta && canOrganizar ? (
            <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/5 pl-2 pr-1">
              <button
                type="button"
                onClick={() => void doPaste()}
                disabled={pegando}
                title={`Duplicar «${porta.name}» dentro de esta carpeta`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-60"
              >
                {pegando ? <Loader2 className="size-3.5 animate-spin" /> : <ClipboardPaste className="size-3.5" />}
                Pegar «{porta.name.length > 16 ? `${porta.name.slice(0, 15)}…` : porta.name}»
              </button>
              <button type="button" onClick={() => setPorta(null)} aria-label="Vaciar el portapapeles" className="rounded p-0.5 text-muted-foreground hover:bg-accent">
                <X className="size-3" />
              </button>
            </span>
          ) : null}
          {canWrite ? (
            <span className="relative shrink-0">
              <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => void doUpload(e.target.files)} />
              {uploading > 0 ? (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground opacity-60">
                  <Loader2 className="size-3.5 animate-spin" /> Subiendo {uploading}…
                </span>
              ) : (
                /* <details data-autoclose>: DetailsAutoClose (en el shell) lo cierra al pulsar
                   fuera y COLOCA la caja (fixed + volteo si no cabe abajo), como todos los menús. */
                <details data-autoclose className="group/add relative">
                  <summary className="inline-flex h-7 cursor-pointer list-none items-center gap-1 rounded-md bg-primary pl-2 pr-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 [&::-webkit-details-marker]:hidden">
                    <Plus className="size-3.5" /> Añadir
                    <ChevronDown className="size-3 opacity-70 transition-transform group-open/add:rotate-180" />
                  </summary>
                  <div className="absolute right-0 z-20 mt-1 flex w-48 flex-col rounded-lg border border-border bg-popover p-1 shadow-lg">
                    <button
                      onClick={(e) => {
                        cerrarMenu(e);
                        fileInput.current?.click();
                      }}
                      className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
                    >
                      <Upload className="size-4 text-muted-foreground" /> Subir archivos…
                    </button>
                    <button
                      onClick={(e) => {
                        cerrarMenu(e);
                        setNewFolder("");
                      }}
                      className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
                    >
                      <FolderPlus className="size-4 text-muted-foreground" /> Nueva carpeta
                    </button>
                  </div>
                </details>
              )}
            </span>
          ) : null}
        </div>

        {notice ? (
          <p className="flex items-start justify-between gap-2 border-b border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} aria-label="Cerrar aviso"><X className="size-4" /></button>
          </p>
        ) : null}

        {/* Crear carpeta (fila inline) */}
        {newFolder !== null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void doCreateFolder();
            }}
            className="flex items-center gap-2 border-b border-dashed border-border px-3 py-2"
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
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {error}
            {path ? (
              <div className="mt-2">
                <button onClick={() => go("")} className="text-[#F47A20] hover:underline">Volver a la raíz</button>
              </div>
            ) : null}
          </div>
        ) : loading && !data ? (
          <p className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Leyendo el disco…
          </p>
        ) : dirs.length === 0 && files.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {filter ? `Nada coincide con «${filter}».` : "Carpeta vacía. Lo que agregues aquí (o por el Finder/SMB) aparece en ambos lados al instante."}
          </p>
        ) : vista === "cuadricula" ? (
          // ── Cuadrícula ── Para reconocer material sin leer nombres. Las carpetas van arriba
          // y en tarjeta baja: son el escalón para llegar al material, no el destino. Las
          // acciones de cada pieza (renombrar, mover, papelera) siguen viviendo en la lista,
          // que es donde se trabaja fino; aquí se viene a encontrar.
          <div className="space-y-3 p-3">
            {dirs.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {dirs.map((d) => {
                  const dueno = duenos[d.rel];
                  return (
                    <button
                      key={d.rel}
                      type="button"
                      onClick={() => go(d.rel)}
                      title={dueno ? `Carpeta de ${dueno.nombre}` : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left",
                        dueno
                          ? cn(tone(dueno.color ?? "slate").chip, "font-medium hover:brightness-95 dark:hover:brightness-110")
                          : "border-border bg-muted/30 hover:bg-accent",
                      )}
                    >
                      <Folder className={cn("size-4 shrink-0", dueno ? "opacity-70" : "text-[#F47A20]")} />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{d.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {files.length > 0 ? (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {files.map((f) => (
                  <a
                    key={f.rel}
                    href={fileUrl(f.rel)}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-lg border border-border transition hover:border-[#F47A20]/50 hover:bg-muted/40"
                  >
                    <Miniatura
                      thumb={`/api/ops/thumb?path=${encodeURIComponent(f.rel)}&v=${Math.round(f.mtimeMs)}`}
                      tipo={tipoPieza(f.ext)}
                      alto="tarjeta"
                      // Lo dice el SERVIDOR, que miró el disco: una imagen se pinta sola, y un
                      // vídeo si tiene póster o si la app puede sacárselo. Los formatos de
                      // cámara propietarios (BRAW, R3D) no los abre nadie: esos se quedan con
                      // su icono y no se les promete «preparando», que sería mentir.
                      hay={f.miniatura ?? THUMB_EXT.has(f.ext)}
                      // Un vídeo que el servidor dio por bueno y aún no aparece es un fotograma
                      // en cola, no un fallo: se dice, y la pieza se recoloca sola al salir.
                      preparandoSiFalta={tipoPieza(f.ext) === "video" && (f.miniatura ?? false)}
                    />
                    <span className="block px-2 py-1.5">
                      <span className="block truncate text-xs font-medium">{f.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {fmtSize(f.size)}{f.mtimeMs ? ` · ${fmtDate(f.mtimeMs)}` : ""}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {dirs.map((d) => {
              const dueno = duenos[d.rel];
              return (
                <li key={d.rel} className="group flex items-center gap-3 px-4 py-2 hover:bg-muted/60">
                  {renaming?.rel === d.rel ? (
                    <RenameRow icon={<Folder className="size-4 shrink-0 text-[#F47A20]" />} renaming={renaming} setRenaming={setRenaming} onSave={doRename} />
                  ) : (
                    <>
                      <button onClick={() => go(d.rel)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <Folder className={cn("size-4 shrink-0", dueno ? "opacity-80" : "text-[#F47A20]")} />
                        <span className="min-w-0 truncate text-sm font-semibold">{d.name}</span>
                        {/* La carpeta de un cliente se reconoce por SU color —el mismo de su
                            ficha y sus proyectos—, sin leer un solo nombre. */}
                        {dueno ? (
                          <span className={cn("shrink-0 rounded px-1.5 py-px text-[10px] font-semibold", tone(dueno.color ?? "slate").chip)}>
                            {dueno.nombre}
                          </span>
                        ) : null}
                      </button>
                      {canOrganizar || canBorrar ? (
                        <RowActions
                          onRename={canOrganizar ? () => setRenaming({ rel: d.rel, value: d.name }) : undefined}
                          onMove={canOrganizar ? () => setMoving(d) : undefined}
                          onCopy={canOrganizar ? () => setPorta({ rel: d.rel, name: d.name }) : undefined}
                          onTrash={canBorrar ? () => void doTrash(d) : undefined}
                        />
                      ) : null}
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                    </>
                  )}
                </li>
              );
            })}
            {files.map((f) => {
              const Icon = iconFor(f.ext);
              const t = tipoPieza(f.ext);
              const editable = ooReady && OO_EXT.has(f.ext);
              return (
                <li key={f.rel} className="group flex items-center gap-3 px-4 py-2 hover:bg-muted/60">
                  {renaming?.rel === f.rel ? (
                    <RenameRow icon={<Icon className="size-4 shrink-0 text-muted-foreground" />} renaming={renaming} setRenaming={setRenaming} onSave={doRename} />
                  ) : (
                    <>
                      <a href={fileUrl(f.rel)} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                        {/* La misma miniatura de toda la app: fotograma para el vídeo y la
                            foto, icono por tipo para el resto. Antes la lista solo enseñaba
                            imágenes y un vídeo era una fila ciega. */}
                        {t === "foto" || t === "video" ? (
                          <Miniatura
                            thumb={`/api/ops/thumb?path=${encodeURIComponent(f.rel)}&v=${Math.round(f.mtimeMs)}`}
                            tipo={t}
                            hay={f.miniatura ?? THUMB_EXT.has(f.ext)}
                            preparandoSiFalta={t === "video" && (f.miniatura ?? false)}
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
                      {canOrganizar || canBorrar ? (
                        <RowActions
                          onRename={canOrganizar ? () => setRenaming({ rel: f.rel, value: f.name }) : undefined}
                          onMove={canOrganizar ? () => setMoving(f) : undefined}
                          onCopy={canOrganizar ? () => setPorta({ rel: f.rel, name: f.name }) : undefined}
                          onTrash={canBorrar ? () => void doTrash(f) : undefined}
                        />
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* El pie dice el estado del disco sin ocupar la pantalla. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span>
            {data ? `${data.dirs.length} ${data.dirs.length === 1 ? "carpeta" : "carpetas"} · ${data.files.length} ${data.files.length === 1 ? "archivo" : "archivos"} · ` : ""}
            {data?.truncated ? "esta carpeta pasa de 2000 elementos: se muestran los primeros" : "se lee el disco en vivo"}
          </span>
        </div>
      </div>

      {/* La explicación de siempre, plegada: quien ya la sabe no la vuelve a leer nunca. */}
      <details className="group/como text-xs text-muted-foreground">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3 transition-transform group-open/como:rotate-90" />
          ¿Cómo funciona este disco?
        </summary>
        <p className="mt-1.5 pl-4">
          Esta vista lee el disco en vivo: lo que el equipo agregue por el Finder o el Explorador (SMB) aparece aquí, y lo que subas aquí aparece allá. Borrar envía a la papelera de la carpeta compartida (#recycle), recuperable desde DSM.
        </p>
      </details>

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

// Cada botón sale solo si llega su handler: el llamador los pasa según las LLAVES de la
// persona (organizar_discos para renombrar/mover/copiar, borrar_discos para la papelera).
function RowActions({ onRename, onMove, onCopy, onTrash }: { onRename?: () => void; onMove?: () => void; onCopy?: () => void; onTrash?: () => void }) {
  return (
    <span className="hidden items-center gap-1 group-hover:flex">
      {onRename ? <button onClick={onRename} title="Renombrar" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-4" /></button> : null}
      {onMove ? <button onClick={onMove} title="Mover a otra carpeta" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><FolderInput className="size-4" /></button> : null}
      {onCopy ? <button onClick={onCopy} title="Copiar (después pegas donde quieras)" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Copy className="size-4" /></button> : null}
      {onTrash ? <button onClick={onTrash} title="Mover a la papelera" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500"><Trash2 className="size-4" /></button> : null}
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
