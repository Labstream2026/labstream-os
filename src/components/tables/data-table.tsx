"use client";

import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Plus, Trash2, CalendarPlus, ArrowUpDown, ArrowUp, ArrowDown, Search, ExternalLink, Eye, EyeOff, Pencil } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import {
  addColumn,
  renameColumn,
  deleteColumn,
  deleteTable,
  addRow,
  deleteRow,
  addSelectOption,
  setCell,
  setEventCell,
  deleteEventCell,
  uploadCellImage,
  revealCell,
} from "@/app/(app)/tablas/actions";
import { PW_MASK } from "@/lib/table-cells";

type Option = { id: string; label: string; color: string };
type Column = { id: string; name: string; type: string; options: Option[] | null };
type Row = { id: string; cells: Record<string, unknown> };
type Member = { id: string; name: string; initials: string | null; color: string | null };

const COLOR: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
};

const TYPES = [
  { v: "TEXT", l: "Texto" },
  { v: "LONGTEXT", l: "Texto largo" },
  { v: "NUMBER", l: "Número" },
  { v: "SELECT", l: "Estado" },
  { v: "MULTISELECT", l: "Multi-selección" },
  { v: "DATE", l: "Fecha" },
  { v: "PERSON", l: "Persona" },
  { v: "CHECKBOX", l: "Casilla" },
  { v: "URL", l: "Enlace" },
  { v: "IMAGE", l: "Imagen" },
  { v: "PASSWORD", l: "Contraseña" },
  { v: "EVENT", l: "Cita calendario" },
];

// Texto para ordenar/filtrar según el tipo de columna.
function displayText(col: Column, value: unknown, team: Member[]): string {
  if (value == null || value === "") return "";
  switch (col.type) {
    case "SELECT":
      return col.options?.find((o) => o.id === value)?.label ?? "";
    case "PERSON":
      return team.find((m) => m.id === value)?.name ?? "";
    case "CHECKBOX":
      return value ? "sí" : "";
    case "MULTISELECT":
      return Array.isArray(value) ? (value as string[]).map((id) => col.options?.find((o) => o.id === id)?.label ?? "").join(" ") : "";
    case "EVENT":
      return (value as { start?: string }).start ?? "";
    case "PASSWORD":
      return ""; // nunca se indexa/busca en texto plano
    case "IMAGE":
      return "";
    default:
      return String(value);
  }
}

export function DataTableView({ table, team }: { table: { id: string; name: string; columns: Column[]; rows: Row[] }; team: Member[] }) {
  const [, start] = React.useTransition();
  const [adding, setAdding] = React.useState(false);
  const [newCol, setNewCol] = React.useState("");
  const [newType, setNewType] = React.useState("TEXT");
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [filter, setFilter] = React.useState("");
  const run = (fn: () => Promise<unknown>) => start(() => void fn());

  const columnDefs = React.useMemo<ColumnDef<Row>[]>(
    () =>
      table.columns.map((c) => ({
        id: c.id,
        accessorFn: (row) => displayText(c, row.cells[c.id], team),
        enableSorting: true,
        sortingFn: "alphanumeric",
      })),
    [table.columns, team],
  );

  const rt = useReactTable({
    data: table.rows,
    columns: columnDefs,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const sortedRows = rt.getRowModel().rows;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold">📊 {table.name}</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
            <Search className="size-3.5 text-muted-foreground" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar…" className="w-32 bg-transparent text-xs outline-none" />
          </div>
          <button
            onClick={() => { if (confirm(`¿Eliminar la tabla «${table.name}»? Esto no se puede deshacer.`)) run(() => deleteTable(table.id)); }}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Eliminar tabla"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              {table.columns.map((c) => {
                const tc = rt.getColumn(c.id);
                const sorted = tc?.getIsSorted();
                return (
                  <th key={c.id} className="group min-w-36 px-3 py-2 text-left font-medium text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <input
                        defaultValue={c.name}
                        onBlur={(e) => e.target.value !== c.name && run(() => renameColumn(c.id, e.target.value))}
                        className="w-full bg-transparent outline-none focus:text-foreground"
                      />
                      <button onClick={() => tc?.toggleSorting()} className="text-muted-foreground hover:text-foreground" title="Ordenar">
                        {sorted === "asc" ? <ArrowUp className="size-3.5" /> : sorted === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-40 group-hover:opacity-100" />}
                      </button>
                      <button onClick={() => run(() => deleteColumn(c.id))} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" title="Eliminar columna">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </th>
                );
              })}
              <th className="w-10 px-2">
                {adding ? (
                  <form onSubmit={(e) => { e.preventDefault(); run(() => addColumn(table.id, newCol, newType)); setNewCol(""); setAdding(false); }} className="flex items-center gap-1">
                    <input autoFocus value={newCol} onChange={(e) => setNewCol(e.target.value)} placeholder="Nombre" className="w-24 rounded border border-input bg-background px-1.5 py-1 text-xs outline-none" />
                    <select value={newType} onChange={(e) => setNewType(e.target.value)} className="rounded border border-input bg-background px-1 py-1 text-xs">
                      {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                    </select>
                    <button className="rounded bg-primary px-1.5 py-1 text-xs text-primary-foreground">OK</button>
                  </form>
                ) : (
                  <button onClick={() => setAdding(true)} className="text-muted-foreground hover:text-foreground" title="Añadir columna"><Plus className="size-4" /></button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const row = r.original;
              return (
                <tr key={row.id} className="group border-b border-border last:border-0">
                  {table.columns.map((c) => (
                    <td key={c.id} className="border-r border-border/50 px-2 py-1 align-top last:border-0">
                      <Cell column={c} row={row} team={team} run={run} />
                    </td>
                  ))}
                  <td className="px-2 text-center">
                    <button onClick={() => run(() => deleteRow(row.id))} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" title="Eliminar fila"><Trash2 className="size-3.5" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={() => run(() => addRow(table.id))} className="flex w-full items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:bg-accent">
        <Plus className="size-4" /> Nueva fila
      </button>
    </div>
  );
}

function Cell({ column, row, team, run }: { column: Column; row: Row; team: Member[]; run: (fn: () => Promise<unknown>) => void }) {
  const value = row.cells[column.id];

  if (column.type === "TEXT" || column.type === "NUMBER") {
    return (
      <input
        type={column.type === "NUMBER" ? "number" : "text"}
        defaultValue={(value as string | number | undefined) ?? ""}
        onBlur={(e) => run(() => setCell(row.id, column.id, column.type === "NUMBER" ? Number(e.target.value) : e.target.value))}
        className="w-full bg-transparent px-1 py-0.5 outline-none focus:ring-1 focus:ring-ring rounded"
      />
    );
  }

  if (column.type === "LONGTEXT") {
    return (
      <textarea
        defaultValue={(value as string) ?? ""}
        rows={2}
        onBlur={(e) => run(() => setCell(row.id, column.id, e.target.value))}
        className="w-full min-w-48 resize-y bg-transparent px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring rounded"
      />
    );
  }

  if (column.type === "PASSWORD") {
    return <PasswordCell value={(value as string) ?? ""} rowId={row.id} columnId={column.id} onSave={(v) => run(() => setCell(row.id, column.id, v))} />;
  }

  if (column.type === "MULTISELECT") {
    return <MultiSelectCell column={column} value={Array.isArray(value) ? (value as string[]) : []} onSave={(v) => run(() => setCell(row.id, column.id, v))} />;
  }

  if (column.type === "IMAGE") {
    return <ImageCell url={(value as string) ?? ""} rowId={row.id} columnId={column.id} onClear={() => run(() => setCell(row.id, column.id, ""))} />;
  }

  if (column.type === "URL") {
    return (
      <div className="flex items-center gap-1">
        <input
          type="url"
          defaultValue={(value as string) ?? ""}
          placeholder="https://"
          onBlur={(e) => run(() => setCell(row.id, column.id, e.target.value))}
          className="w-full bg-transparent px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring rounded"
        />
        {value ? <a href={String(value)} target="_blank" rel="noreferrer" className="text-primary"><ExternalLink className="size-3.5" /></a> : null}
      </div>
    );
  }

  if (column.type === "CHECKBOX") {
    return <input type="checkbox" defaultChecked={Boolean(value)} onChange={(e) => run(() => setCell(row.id, column.id, e.target.checked))} className="size-4" />;
  }

  if (column.type === "DATE") {
    return <input type="date" defaultValue={(value as string) ?? ""} onChange={(e) => run(() => setCell(row.id, column.id, e.target.value))} className="bg-transparent px-1 py-0.5 text-xs outline-none" />;
  }

  if (column.type === "SELECT") {
    const opts = column.options ?? [];
    const sel = opts.find((o) => o.id === value);
    return (
      <select
        value={(value as string) ?? ""}
        onChange={(e) => { if (e.target.value === "__add") { const l = prompt("Nueva opción"); if (l) run(() => addSelectOption(column.id, l)); return; } run(() => setCell(row.id, column.id, e.target.value)); }}
        className={cn("cursor-pointer rounded-full border-0 px-2 py-0.5 text-xs font-medium outline-none", sel ? COLOR[sel.color] : "bg-muted text-muted-foreground")}
      >
        <option value="">—</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        <option value="__add">+ Nueva opción…</option>
      </select>
    );
  }

  if (column.type === "PERSON") {
    return (
      <select value={(value as string) ?? ""} onChange={(e) => run(() => setCell(row.id, column.id, e.target.value))} className="cursor-pointer rounded-md border border-border bg-card px-1.5 py-0.5 text-xs outline-none">
        <option value="">Sin asignar</option>
        {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    );
  }

  if (column.type === "EVENT") {
    return <EventCell column={column} row={row} value={value as { start?: string; attendeeId?: string } | undefined} team={team} run={run} />;
  }

  return null;
}

// Convierte un ISO a formato datetime-local "YYYY-MM-DDTHH:mm" (hora local).
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventCell({ column, row, value, team, run }: { column: Column; row: Row; value: { start?: string; attendeeId?: string } | undefined; team: Member[]; run: (fn: () => Promise<unknown>) => void }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [startAt, setStartAt] = React.useState("");
  const [att, setAtt] = React.useState("");

  // Abre el formulario precargando los datos de la cita existente (editar, no duplicar).
  const edit = () => {
    setStartAt(toLocalInput(value?.start));
    setAtt(value?.attendeeId ?? "");
    setOpen(true);
  };

  if (value?.start && !open) {
    const u = team.find((m) => m.id === value.attendeeId);
    return (
      <button onClick={edit} className="flex flex-col items-start text-xs">
        <span className="font-medium text-primary">📅 {new Date(value.start).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</span>
        {u ? <span className="text-muted-foreground">→ {u.name}</span> : null}
      </button>
    );
  }
  if (!open) {
    return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><CalendarPlus className="size-3.5" /> Cita</button>;
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!startAt) return; run(() => setEventCell(row.id, column.id, { title, start: startAt, attendeeId: att })); setOpen(false); }} className="flex flex-col gap-1">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)" className="rounded border border-input bg-background px-1.5 py-1 text-xs" />
      <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="rounded border border-input bg-background px-1.5 py-1 text-xs" />
      <select value={att} onChange={(e) => setAtt(e.target.value)} className="rounded border border-input bg-background px-1.5 py-1 text-xs">
        <option value="">Invitar a…</option>
        {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <div className="flex flex-wrap gap-1">
        <button className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">{value?.start ? "Guardar" : "Crear y enviar"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground">Cancelar</button>
        {value?.start ? (
          <button type="button" onClick={() => { run(() => deleteEventCell(row.id, column.id)); setOpen(false); }} className="ml-auto text-xs text-destructive">Eliminar</button>
        ) : null}
      </div>
    </form>
  );
}

// Celda contraseña: el valor real NO viaja al cliente (se guarda cifrado en BD).
// Se revela bajo demanda con revealCell y se edita escribiendo uno nuevo.
function PasswordCell({ value, rowId, columnId, onSave }: { value: string; rowId: string; columnId: string; onSave: (v: string) => void }) {
  const has = value === PW_MASK;
  const [revealed, setRevealed] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft) onSave(draft); setEditing(false); setRevealed(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(false); }}
        placeholder="Nueva contraseña"
        className="w-full rounded bg-transparent px-1 py-0.5 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
      />
    );
  }
  return (
    <div className="flex items-center gap-1">
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{revealed != null ? revealed : has ? "••••••••" : "—"}</span>
      {has ? (
        <button
          type="button"
          title={revealed != null ? "Ocultar" : "Mostrar"}
          onClick={async () => {
            if (revealed != null) { setRevealed(null); return; }
            setLoading(true);
            try { setRevealed(await revealCell(rowId, columnId)); } finally { setLoading(false); }
          }}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          disabled={loading}
        >
          {revealed != null ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      ) : null}
      <button type="button" title="Editar" onClick={() => { setDraft(""); setEditing(true); }} className="text-muted-foreground hover:text-foreground">
        <Pencil className="size-3.5" />
      </button>
    </div>
  );
}

// Celda multi-selección: varias etiquetas; menú con casillas + añadir opción.
function MultiSelectCell({ column, value, onSave }: { column: Column; value: string[]; onSave: (v: string[]) => void }) {
  const opts = column.options ?? [];
  const toggle = (id: string) => onSave(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none flex-wrap gap-1">
        {value.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : null}
        {value.map((id) => {
          const o = opts.find((x) => x.id === id);
          if (!o) return null;
          return <span key={id} className={cn("rounded-full px-2 py-0.5 text-[11px]", COLOR[o.color] ?? "bg-muted")}>{o.label}</span>;
        })}
      </summary>
      <div className="absolute z-10 mt-1 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg">
        {opts.map((o) => (
          <button key={o.id} type="button" onClick={() => toggle(o.id)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted">
            <input type="checkbox" readOnly checked={value.includes(o.id)} className="size-3" />
            <span className={cn("rounded-full px-1.5 text-[11px]", COLOR[o.color] ?? "bg-muted")}>{o.label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => { const l = prompt("Nueva opción"); if (l) addSelectOption(column.id, l); }}
          className="w-full rounded px-2 py-1 text-left text-xs text-primary hover:bg-muted"
        >
          + Nueva opción…
        </button>
      </div>
    </details>
  );
}

// Celda imagen: sube una foto (se guarda en el NAS) y la muestra como miniatura.
function ImageCell({ url, rowId, columnId, onClear }: { url: string; rowId: string; columnId: string; onClear: () => void }) {
  const [pending, start] = React.useTransition();
  return (
    <div className="flex items-center gap-2">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className="size-12 rounded object-cover" /></a>
      ) : null}
      <label className="cursor-pointer text-xs text-primary hover:underline">
        {pending ? "Subiendo…" : url ? "Cambiar" : "Subir foto"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.set("image", f);
            start(() => void uploadCellImage(rowId, columnId, fd));
          }}
        />
      </label>
      {url ? <button type="button" onClick={onClear} className="text-xs text-muted-foreground hover:text-destructive">Quitar</button> : null}
    </div>
  );
}
