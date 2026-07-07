"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, ChevronDown, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string };

// Barra de filtros + agrupación para la lista de Proyectos. Los filtros viven en la URL
// (?q=&estado=&cliente=&grupo=) y el servidor filtra en memoria: el enlace es compartible. El
// patrón (búsqueda con debounce + desplegables multi) es el mismo de "Mis tareas" (task-filters).
export function ProjectFilters({
  statusOptions,
  clientOptions,
}: {
  statusOptions: Opt[];
  clientOptions: Opt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const estado = (sp.get("estado") ?? "").split(",").filter(Boolean);
  const cliente = (sp.get("cliente") ?? "").split(",").filter(Boolean);
  const grupo = sp.get("grupo") ?? "cliente";
  const q = sp.get("q") ?? "";
  const activeCount = estado.length + cliente.length + (q ? 1 : 0);

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

  const toggleMulti = (key: "estado" | "cliente", val: string) => {
    const cur = key === "estado" ? estado : cliente;
    const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
    pushParams({ [key]: next.join(",") });
  };

  const clearAll = () => pushParams({ estado: null, cliente: null, q: null });

  // Búsqueda con debounce para no navegar en cada tecla.
  const [qLocal, setQLocal] = React.useState(q);
  React.useEffect(() => setQLocal(q), [q]);
  React.useEffect(() => {
    const t = setTimeout(() => { if (qLocal !== q) pushParams({ q: qLocal || null }); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Buscar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={qLocal}
          onChange={(e) => setQLocal(e.target.value)}
          placeholder="Buscar proyecto o cliente"
          className="h-9 w-52 rounded-md border border-input bg-background py-1 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <MultiDropdown label="Estado" icon={<Filter className="size-3.5" />} options={statusOptions} selected={estado} onToggle={(v) => toggleMulti("estado", v)} />
      <MultiDropdown label="Cliente" options={clientOptions} selected={cliente} onToggle={(v) => toggleMulti("cliente", v)} />

      {/* Agrupar (solo afecta a la vista Lista) */}
      <label className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-sm">
        <span className="text-muted-foreground">Agrupar</span>
        <select value={grupo} onChange={(e) => pushParams({ grupo: e.target.value === "cliente" ? null : e.target.value })} className="cursor-pointer bg-transparent outline-none" title="Agrupar la vista Lista">
          <option value="cliente">Cliente</option>
          <option value="estado">Estado</option>
        </select>
      </label>

      {activeCount > 0 ? (
        <button type="button" onClick={clearAll} className="flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="size-3.5" /> Limpiar ({activeCount})
        </button>
      ) : null}
    </div>
  );
}

// Desplegable de selección múltiple con casillas. Usa <details> nativo; DetailsAutoClose (montado
// en el layout) lo cierra al hacer clic fuera o con Escape. Mismo patrón que task-filters.
function MultiDropdown({ label, icon, options, selected, onToggle }: { label: string; icon?: React.ReactNode; options: Opt[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <details data-autoclose className="relative">
      <summary className={cn("flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm hover:bg-accent", selected.length && "border-primary/50 text-foreground")}>
        {icon}
        {label}
        {selected.length ? <span className="rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">{selected.length}</span> : null}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </summary>
      <div className="absolute left-0 z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
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
