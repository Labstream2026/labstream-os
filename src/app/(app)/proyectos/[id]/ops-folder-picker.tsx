"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Folder, FolderPlus, HardDrive, Loader2, X } from "lucide-react";
import { setProjectOpsFolder } from "./ops-actions";
import { opsCreateFolder } from "@/app/(app)/operaciones/actions";

type Dir = { name: string; rel: string };

// Selector de carpeta de Operaciones_LAB para el proyecto: mini-explorador EN VIVO
// (solo carpetas) con creación rápida — típico flujo: Clientes/<cliente>/<proyecto>.
export function OpsFolderPicker({
  projectId,
  current,
  onClose,
}: {
  projectId: string;
  current: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [path, setPath] = React.useState(() => (current ? (current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : "") : ""));
  const [dirs, setDirs] = React.useState<Dir[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState<string | null>(null);

  const load = React.useCallback((p: string) => {
    setLoading(true);
    fetch(`/api/ops/list?path=${encodeURIComponent(p)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setDirs((j?.dirs as Dir[]) || []))
      .catch(() => setDirs([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load(path);
  }, [path, load]);

  const crumbs = path ? path.split("/") : [];

  async function link(rel: string | null) {
    setBusy(true);
    setError(null);
    const r = await setProjectOpsFolder(projectId, rel);
    setBusy(false);
    if ("error" in r) setError(r.error);
    else {
      onClose();
      router.refresh();
    }
  }

  async function createHere() {
    const name = (newName || "").trim();
    if (!name) return;
    setBusy(true);
    const r = await opsCreateFolder(path, name);
    setBusy(false);
    if ("error" in r) setError(r.error);
    else {
      setNewName(null);
      load(path);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[75vh] w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Carpeta del proyecto en Operaciones_LAB</p>
            <p className="text-xs text-muted-foreground">Las subidas de Archivos se guardarán ahí por defecto y la carpeta se verá en vivo.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </div>

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
            <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Leyendo el disco…</p>
          ) : dirs.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Sin subcarpetas aquí.</p>
          ) : (
            <ul className="divide-y divide-border">
              {dirs.map((d) => (
                <li key={d.rel} className="flex items-center">
                  <button onClick={() => setPath(d.rel)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                    <Folder className="size-4 text-[#F47A20]" /> <span className="truncate">{d.name}</span>
                    {current === d.rel ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">actual</span> : null}
                    <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => void link(d.rel)}
                    disabled={busy}
                    title="Vincular esta carpeta"
                    className="mr-2 shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Vincular
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {newName !== null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createHere();
            }}
            className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5"
          >
            <Folder className="size-4 text-[#F47A20]" />
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre de la carpeta nueva" className="flex-1 bg-transparent text-sm outline-none" />
            <button type="submit" disabled={busy} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"><Check className="size-3.5" /></button>
            <button type="button" onClick={() => setNewName(null)} className="rounded-md border border-border px-2 py-1 text-xs"><X className="size-3.5" /></button>
          </form>
        ) : null}

        {error ? <p className="text-xs text-red-500">{error}</p> : null}

        <div className="flex items-center gap-2">
          <button onClick={() => setNewName(newName === null ? "" : null)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
            <FolderPlus className="size-3.5" /> Nueva carpeta aquí
          </button>
          <span className="ml-auto" />
          {current ? (
            <button onClick={() => void link(null)} disabled={busy} className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">
              Desvincular
            </button>
          ) : null}
          <button
            onClick={() => void link(path || "")}
            disabled={busy || !path}
            title={path ? `Vincular «${path}»` : "Navega a una carpeta para vincularla"}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Vincular esta carpeta
          </button>
        </div>
      </div>
    </div>
  );
}
