"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Folder, FolderPlus, HardDrive, Loader2, X } from "lucide-react";
import { opsCreateFolder } from "@/app/(app)/operaciones/actions";
import { fijarCarpetaOpsSet } from "./set-actions";

type Dir = { name: string; rel: string };

// ── Elegir la carpeta de Operaciones_LAB donde VIVEN las fotos del set ──
// Mismo mini-explorador que el selector del proyecto (ops-folder-picker): en vivo, solo
// carpetas, con creación rápida. Arranca en la carpeta del PROYECTO si está vinculada —
// el flujo típico es Clientes/<cliente>/<proyecto>/Fotos — para no navegar desde la raíz.
export function SetOpsPicker({
  setId,
  actual,
  inicio,
  onClose,
}: {
  setId: string;
  actual: string | null;
  // Punto de partida sugerido (la carpeta del proyecto en el disco, si existe).
  inicio: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [path, setPath] = React.useState(() => {
    if (actual) return actual.includes("/") ? actual.slice(0, actual.lastIndexOf("/")) : "";
    return inicio ?? "";
  });
  const [dirs, setDirs] = React.useState<Dir[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState<string | null>(null);

  // «Cargando» DERIVADO de qué clave se leyó por última vez (patrón del selector de la galería):
  // sin setState sincrónico dentro del efecto (regla del repo) y sin listados desparejados si
  // una respuesta lenta llega después de cambiar de carpeta. `tick` fuerza la relectura tras
  // crear una carpeta sin mover el path.
  const [tick, setTick] = React.useState(0);
  const clave = `${path}#${tick}`;
  const [leida, setLeida] = React.useState<string | null>(null);
  const loading = leida !== clave;

  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/ops/list?path=${encodeURIComponent(path)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        setDirs((j?.dirs as Dir[]) || []);
        setLeida(clave);
      })
      .catch(() => {
        if (!vivo) return;
        setDirs([]);
        setLeida(clave);
      });
    return () => {
      vivo = false;
    };
  }, [path, clave]);

  const crumbs = path ? path.split("/") : [];

  async function vincular(rel: string | null) {
    setBusy(true);
    setError(null);
    const r = await fijarCarpetaOpsSet(setId, rel);
    setBusy(false);
    if (!r.ok) setError(r.message ?? "No se pudo vincular.");
    else {
      onClose();
      router.refresh();
    }
  }

  async function crearAqui() {
    const name = (newName || "").trim();
    if (!name) return;
    setBusy(true);
    const r = await opsCreateFolder(path, name);
    setBusy(false);
    if ("error" in r) setError(r.error);
    else {
      setNewName(null);
      setTick((t) => t + 1); // relee la carpeta actual para que aparezca la recién creada
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[75vh] w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">¿En qué carpeta del disco viven las fotos?</p>
            <p className="text-xs text-muted-foreground">
              Las subidas del set caerán ahí (cada sección, en su subcarpeta) y podrás importar las fotos que la carpeta ya tenga.
            </p>
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
            <p className="px-3 py-4 text-sm text-muted-foreground">Sin subcarpetas aquí. Puedes crear una abajo.</p>
          ) : (
            <ul className="divide-y divide-border">
              {dirs.map((d) => (
                <li key={d.rel} className="flex items-center">
                  <button onClick={() => setPath(d.rel)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                    <Folder className="size-4 shrink-0 text-[#F47A20]" /> <span className="truncate">{d.name}</span>
                    {actual === d.rel ? <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">actual</span> : null}
                    <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => void vincular(d.rel)}
                    disabled={busy}
                    title={`Que las fotos del set vivan en «${d.name}»`}
                    className="mr-2 shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Elegir
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
              void crearAqui();
            }}
            className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5"
          >
            <Folder className="size-4 shrink-0 text-[#F47A20]" />
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre de la carpeta nueva" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            <button type="submit" disabled={busy} aria-label="Crear" className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"><Check className="size-3.5" /></button>
            <button type="button" onClick={() => setNewName(null)} aria-label="Cancelar" className="rounded-md border border-border px-2 py-1 text-xs"><X className="size-3.5" /></button>
          </form>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setNewName(newName === null ? "" : null)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
            <FolderPlus className="size-3.5" /> Nueva carpeta aquí
          </button>
          <span className="ml-auto" />
          {actual ? (
            <button
              onClick={() => void vincular(null)}
              disabled={busy}
              title="Las próximas subidas vuelven al disco de la app"
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              Desvincular
            </button>
          ) : null}
          <button
            onClick={() => void vincular(path || "")}
            disabled={busy || !path}
            title={path ? `Elegir «${path}»` : "Navega a una carpeta para elegirla"}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Elegir esta carpeta
          </button>
        </div>
      </div>
    </div>
  );
}
