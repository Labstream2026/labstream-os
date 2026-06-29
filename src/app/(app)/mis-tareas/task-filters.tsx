"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, ChevronDown, X, Bookmark, Plus, Trash2, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { setSavedViews } from "@/app/(app)/perfil/preference-actions";

type Opt = { value: string; label: string };
type Proj = { id: string; name: string; emoji: string | null };
type SavedView = { id: string; name: string; query: string };

const FILTER_KEYS = ["estado", "prioridad", "proyecto", "q", "grupo"] as const;

// Barra de filtros + agrupación + vistas guardadas para "Mis tareas". Los filtros viven en la
// URL (?estado=&prioridad=&proyecto=&q=&grupo=) y el servidor filtra; así el enlace es
// compartible y las vistas guardadas son solo una cadena de query con nombre. Las vistas se
// guardan en BD (sincronizan entre dispositivos): llegan en `initialViews` y se persisten con
// setSavedViews.
export function TaskFilters({
  statusOptions,
  priorityOptions,
  projectOptions,
  hasPersonal,
  initialViews,
}: {
  statusOptions: Opt[];
  priorityOptions: Opt[];
  projectOptions: Proj[];
  hasPersonal: boolean;
  initialViews: SavedView[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const estado = (sp.get("estado") ?? "").split(",").filter(Boolean);
  const prioridad = (sp.get("prioridad") ?? "").split(",").filter(Boolean);
  const proyecto = sp.get("proyecto") ?? "";
  const grupo = sp.get("grupo") ?? "urgencia";
  const q = sp.get("q") ?? "";
  const activeCount = estado.length + prioridad.length + (proyecto ? 1 : 0) + (q ? 1 : 0);

  const pushParams = React.useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v == null || v === "") params.delete(k);
        else params.set(k, v);
      }
      const s = params.toString();
      router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [sp, pathname, router],
  );

  const toggleMulti = (key: "estado" | "prioridad", val: string) => {
    const cur = key === "estado" ? estado : prioridad;
    const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
    pushParams({ [key]: next.join(",") });
  };

  const clearAll = () => pushParams({ estado: null, prioridad: null, proyecto: null, q: null });

  // Búsqueda con debounce para no navegar en cada tecla.
  const [qLocal, setQLocal] = React.useState(q);
  React.useEffect(() => setQLocal(q), [q]);
  React.useEffect(() => {
    const t = setTimeout(() => { if (qLocal !== q) pushParams({ q: qLocal || null }); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal]);

  // Vistas guardadas (en BD; sincronizan entre dispositivos).
  const [views, setViews] = React.useState<SavedView[]>(initialViews);
  const [, startSave] = React.useTransition();
  React.useEffect(() => { setViews(initialViews); }, [initialViews]);
  const persist = (v: SavedView[]) => { setViews(v); startSave(() => { void setSavedViews("mis-tareas", v); }); };
  const currentQuery = () => {
    const params = new URLSearchParams();
    for (const k of FILTER_KEYS) { const val = sp.get(k); if (val) params.set(k, val); }
    return params.toString();
  };
  const saveCurrent = () => {
    const name = window.prompt("Nombre de la vista guardada:");
    if (!name?.trim()) return;
    persist([...views, { id: `${Date.now()}`, name: name.trim(), query: currentQuery() }]);
  };
  const applyView = (v: SavedView) => router.push(v.query ? `${pathname}?${v.query}` : pathname, { scroll: false });
  const deleteView = (id: string) => persist(views.filter((v) => v.id !== id));

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Buscar */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
            placeholder="Buscar tarea"
            className="h-9 w-44 rounded-md border border-input bg-background py-1 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <MultiDropdown label="Estado" icon={<Filter className="size-3.5" />} options={statusOptions} selected={estado} onToggle={(v) => toggleMulti("estado", v)} />
        <MultiDropdown label="Prioridad" options={priorityOptions} selected={prioridad} onToggle={(v) => toggleMulti("prioridad", v)} />

        {/* Proyecto */}
        <select
          value={proyecto}
          onChange={(e) => pushParams({ proyecto: e.target.value || null })}
          className="h-9 cursor-pointer rounded-md border border-input bg-background px-2 text-sm outline-none hover:bg-accent focus:ring-2 focus:ring-ring"
          title="Filtrar por proyecto"
        >
          <option value="">Todos los proyectos</option>
          {hasPersonal ? <option value="personal">🔒 Personales (sin proyecto)</option> : null}
          {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.emoji ? `${p.emoji} ` : ""}{p.name}</option>)}
        </select>

        {/* Agrupar */}
        <label className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-sm">
          <span className="text-muted-foreground">Agrupar</span>
          <select value={grupo} onChange={(e) => pushParams({ grupo: e.target.value === "urgencia" ? null : e.target.value })} className="cursor-pointer bg-transparent outline-none">
            <option value="urgencia">Urgencia</option>
            <option value="proyecto">Proyecto</option>
            <option value="prioridad">Prioridad</option>
          </select>
        </label>

        {activeCount > 0 ? (
          <button type="button" onClick={clearAll} className="flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="size-3.5" /> Limpiar ({activeCount})
          </button>
        ) : null}

        <button type="button" onClick={saveCurrent} title="Guardar los filtros actuales como vista" className="ml-auto flex h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
          <Plus className="size-3.5" /> Guardar vista
        </button>
      </div>

      {/* Vistas guardadas */}
      {views.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Bookmark className="size-3.5 text-muted-foreground" />
          {views.map((v) => (
            <span key={v.id} className="group inline-flex items-center overflow-hidden rounded-full border border-border text-xs">
              <button type="button" onClick={() => applyView(v)} className="py-1 pl-2.5 pr-1.5 font-medium hover:bg-accent">{v.name}</button>
              <button type="button" onClick={() => deleteView(v.id)} aria-label={`Borrar vista ${v.name}`} className="flex size-5 items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Desplegable de selección múltiple (estado/prioridad) con casillas. Usa <details> nativo;
// DetailsAutoClose (montado en el layout) lo cierra al hacer clic fuera o con Escape.
function MultiDropdown({ label, icon, options, selected, onToggle }: { label: string; icon?: React.ReactNode; options: Opt[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <details data-autoclose className="relative">
      <summary className={cn("flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm hover:bg-accent", selected.length && "border-primary/50 text-foreground")}>
        {icon}
        {label}
        {selected.length ? <span className="rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">{selected.length}</span> : null}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </summary>
      <div className="absolute left-0 z-30 mt-1 max-h-72 w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Sin opciones</p>
        ) : options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button key={o.value} type="button" onClick={() => onToggle(o.value)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
              <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                {on ? <span className="text-[10px] leading-none">✓</span> : null}
              </span>
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
    </details>
  );
}
