"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef,
  type SortingState,
  type Table as RTable,
} from "@tanstack/react-table";
import { Plus, Trash2, CalendarPlus, ArrowUpDown, ArrowUp, ArrowDown, Search, ExternalLink, Eye, EyeOff, Pencil, GripVertical, Rows3 } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { tone } from "@/lib/colors";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePromptDialog } from "@/components/ui/prompt-dialog";
import {
  addColumn,
  renameColumn,
  reorderColumns,
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
  const { confirm, dialog } = useConfirmDialog();

  // Orden local de columnas: permite reordenar arrastrando con respuesta inmediata, y se
  // re-sincroniza cuando llegan datos frescos del servidor (tras guardar).
  const [cols, setCols] = React.useState<Column[]>(table.columns);
  React.useEffect(() => { setCols(table.columns); }, [table.columns]);

  // PointerSensor para ratón/lápiz; TouchSensor con retardo para que arrastrar la columna
  // funcione con el dedo SIN bloquear el scroll vertical de la tabla (patrón de tasks-board).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = cols.findIndex((c) => c.id === active.id);
    const to = cols.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(cols, from, to);
    setCols(next); // optimista
    run(() => reorderColumns(table.id, next.map((c) => c.id)));
  };

  const columnDefs = React.useMemo<ColumnDef<Row>[]>(
    () =>
      cols.map((c) => ({
        id: c.id,
        accessorFn: (row) => displayText(c, row.cells[c.id], team),
        enableSorting: true,
        sortingFn: "alphanumeric",
      })),
    [cols, team],
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
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {dialog}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <span className="text-sm font-semibold">📊 {table.name}</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
            <Search className="size-3.5 text-muted-foreground" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar…" className="w-32 bg-transparent text-xs outline-none" />
          </div>
          <button
            onClick={async () => { if (await confirm({ title: "Eliminar tabla", message: `¿Eliminar la tabla «${table.name}»? Esto no se puede deshacer.`, confirmLabel: "Eliminar", danger: true })) run(() => deleteTable(table.id)); }}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Eliminar tabla"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      <div className="overflow-auto max-h-[75vh]">
        <DndContext id="data-table-cols" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-card">
              <tr className="border-b border-border">
                <SortableContext items={cols.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
                  {cols.map((c) => (
                    <SortableHeader key={c.id} col={c} rt={rt} run={run} />
                  ))}
                </SortableContext>
                <th className="w-10 bg-card px-2">
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
              {table.rows.length === 0 ? (
                <tr>
                  <td colSpan={cols.length + 1} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                      <Rows3 className="size-8 opacity-40" />
                      <span className="text-sm font-medium">Aún no hay filas</span>
                      <span className="text-xs text-muted-foreground/70">Añade la primera con «Nueva fila».</span>
                    </div>
                  </td>
                </tr>
              ) : null}
              {sortedRows.map((r) => {
                const row = r.original;
                return (
                  <tr key={row.id} className="group border-b border-border last:border-0">
                    {cols.map((c) => (
                      <td key={c.id} className="border-r border-border/50 px-2 py-1 align-top last:border-0">
                        <Cell column={c} row={row} team={team} run={run} />
                      </td>
                    ))}
                    <td className="px-2 text-center">
                      <button onClick={() => run(() => deleteRow(row.id))} className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-100 hover:bg-muted hover:text-destructive md:opacity-0 md:group-hover:opacity-100" title="Eliminar fila" aria-label="Eliminar fila"><Trash2 className="size-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DndContext>
      </div>
      <button onClick={() => run(() => addRow(table.id))} className="flex w-full items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:bg-accent">
        <Plus className="size-4" /> Nueva fila
      </button>
    </div>
  );
}

// Encabezado de columna arrastrable (dnd-kit). El asa (grip) lleva los listeners de
// arrastre; el resto (renombrar, ordenar, eliminar) sigue funcionando con clic normal.
function SortableHeader({ col, rt, run }: { col: Column; rt: RTable<Row>; run: (fn: () => Promise<unknown>) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const { confirm, dialog } = useConfirmDialog();
  const tc = rt.getColumn(col.id);
  const sorted = tc?.getIsSorted();
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <th ref={setNodeRef} style={style} className={cn("group min-w-28 bg-card px-3 py-2 text-left font-medium text-muted-foreground", isDragging && "z-10")}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex size-8 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground active:cursor-grabbing"
          title="Arrastra para mover la columna"
          aria-label="Arrastra para mover la columna"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <input
          defaultValue={col.name}
          onBlur={(e) => e.target.value !== col.name && run(() => renameColumn(col.id, e.target.value))}
          className="w-full bg-transparent outline-none focus:text-foreground"
        />
        <button onClick={() => tc?.toggleSorting()} className="text-muted-foreground hover:text-foreground" title="Ordenar">
          {sorted === "asc" ? <ArrowUp className="size-3.5" /> : sorted === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-100 md:opacity-40 md:group-hover:opacity-100" />}
        </button>
        <button onClick={async () => { if (await confirm({ title: "Eliminar columna", message: `¿Eliminar la columna «${col.name}»? Se borran sus datos en todas las filas.`, confirmLabel: "Eliminar", danger: true })) run(() => deleteColumn(col.id)); }} className="flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-100 hover:bg-muted hover:text-destructive md:opacity-0 md:group-hover:opacity-100" title="Eliminar columna" aria-label="Eliminar columna">
          <Trash2 className="size-4" />
        </button>
      </div>
      {dialog}
    </th>
  );
}

function Cell({ column, row, team, run }: { column: Column; row: Row; team: Member[]; run: (fn: () => Promise<unknown>) => void }) {
  const value = row.cells[column.id];
  const { prompt, dialog } = usePromptDialog();

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
      <>
      {dialog}
      <select
        value={(value as string) ?? ""}
        onChange={async (e) => {
          const v = e.currentTarget.value;
          if (v === "__add") {
            e.currentTarget.value = (value as string) ?? ""; // revertir el select (no dejar «+ Nueva opción» marcado)
            const l = await prompt({ title: "Nueva opción", placeholder: "Nombre de la opción", required: true });
            if (l) run(() => addSelectOption(column.id, l));
            return;
          }
          run(() => setCell(row.id, column.id, v));
        }}
        className={cn("cursor-pointer rounded-full border-0 px-2 py-0.5 text-xs font-medium outline-none", sel ? tone(sel.color).chip : "bg-muted text-muted-foreground")}
      >
        <option value="">—</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        <option value="__add">+ Nueva opción…</option>
      </select>
      </>
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
// Popover anclado al disparador y renderizado en un PORTAL (document.body) con
// posición fija, para que NO lo recorte el overflow de la tabla. Se voltea hacia
// arriba si no hay espacio abajo, y cierra al hacer clic fuera o con Escape.
type PopRect = { left: number; width: number; top?: number; bottom?: number };
function CellPopover({ summary, children }: { summary: React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [rect, setRect] = React.useState<PopRect | null>(null);

  const place = React.useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 192);
    const spaceBelow = window.innerHeight - r.bottom;
    const flipUp = spaceBelow < 260 && r.top > 260;
    setRect(flipUp ? { left: r.left, width, bottom: window.innerHeight - r.top + 4 } : { left: r.left, width, top: r.bottom + 4 });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!btnRef.current?.contains(t) && !t.closest("[data-cellpop]")) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer flex-wrap items-center gap-1 text-left">
        {summary}
      </button>
      {open && rect
        ? createPortal(
            <div
              data-cellpop
              style={{ position: "fixed", left: rect.left, width: rect.width, top: rect.top, bottom: rect.bottom, zIndex: 60 }}
              className="max-h-64 overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
            >
              {children(() => setOpen(false))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function MultiSelectCell({ column, value, onSave }: { column: Column; value: string[]; onSave: (v: string[]) => void }) {
  const opts = column.options ?? [];
  const { prompt, dialog } = usePromptDialog();
  const toggle = (id: string) => onSave(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <>
    {dialog}
    <CellPopover
      summary={
        <>
          {value.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : null}
          {value.map((id) => {
            const o = opts.find((x) => x.id === id);
            if (!o) return null;
            return <span key={id} className={cn("rounded-full px-2 py-0.5 text-[11px]", tone(o.color).chip)}>{o.label}</span>;
          })}
        </>
      }
    >
      {() => (
        <>
          {opts.map((o) => (
            <button key={o.id} type="button" onClick={() => toggle(o.id)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted">
              <input type="checkbox" readOnly checked={value.includes(o.id)} className="size-3" />
              <span className={cn("rounded-full px-1.5 text-[11px]", tone(o.color).chip)}>{o.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={async () => { const l = await prompt({ title: "Nueva opción", placeholder: "Nombre de la opción", required: true }); if (l) addSelectOption(column.id, l); }}
            className="w-full rounded px-2 py-1 text-left text-xs text-primary hover:bg-muted"
          >
            + Nueva opción…
          </button>
        </>
      )}
    </CellPopover>
    </>
  );
}

// Celda imagen: sube una foto (se guarda optimizada en el NAS) y la muestra como
// miniatura pequeña. Al subir muestra "Subiendo…" y, si falla, el motivo.
function ImageCell({ url, rowId, columnId, onClear }: { url: string; rowId: string; columnId: string; onClear: () => void }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <a href={url} data-lightbox rel="noreferrer" title="Ampliar imagen" className="cursor-zoom-in">
          <img src={url} alt="" className="size-14 rounded-md border border-border object-cover" />
        </a>
      ) : null}
      <div className="flex flex-col gap-0.5">
        <label className={cn("cursor-pointer text-xs text-primary hover:underline", pending && "pointer-events-none opacity-60")}>
          {pending ? "Subiendo…" : url ? "Cambiar" : "Subir foto"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={pending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ""; // permite re-subir el mismo archivo
              if (!f) return;
              setError(null);
              const fd = new FormData();
              fd.set("image", f);
              start(async () => {
                try {
                  await uploadCellImage(rowId, columnId, fd);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
                }
              });
            }}
          />
        </label>
        {url ? <button type="button" onClick={onClear} className="text-left text-xs text-muted-foreground hover:text-destructive">Quitar</button> : null}
        {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}
