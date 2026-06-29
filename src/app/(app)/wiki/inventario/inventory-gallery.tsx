"use client";

import * as React from "react";
import { Camera, Aperture, Radio, Mic, Lightbulb, Laptop, HardDrive, Package, Upload, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { tone } from "@/lib/colors";
import { uploadCellImage, setCell } from "@/app/(app)/tablas/actions";

// Vista galería del Inventario: tarjetas con foto (la foto reemplaza al ícono al subirla),
// estado de disponibilidad, indicadores y filtro por categoría. Lee las MISMAS columnas
// que la tabla (Foto, Nombre, Serial, Marca, Categoría, Estado, Localización); la pestaña
// "Tabla" sigue siendo el editor completo.

type Option = { id: string; label: string; color: string };
type Column = { id: string; name: string; type: string; options: Option[] | null };
type Row = { id: string; cells: Record<string, unknown> };

// Ícono por categoría (cuando el equipo aún no tiene foto).
const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  "Cámara": Camera,
  "Lente": Aperture,
  "Streaming": Radio,
  "Audio": Mic,
  "Iluminación": Lightbulb,
  "Cómputo": Laptop,
  "Almacenamiento": HardDrive,
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function InventoryGallery({ columns, rows }: { columns: Column[]; rows: Row[] }) {
  const [query, setQuery] = React.useState("");
  const [activeCat, setActiveCat] = React.useState<string | null>(null);

  const fotoCol = columns.find((c) => c.type === "IMAGE");
  const nombreCol = columns.find((c) => c.name === "Nombre");
  const serialCol = columns.find((c) => c.name === "Serial");
  const marcaCol = columns.find((c) => c.name === "Marca");
  const catCol = columns.find((c) => c.name === "Categoría");
  const estadoCol = columns.find((c) => c.name === "Estado");
  const locCol = columns.find((c) => c.name === "Localización");

  const catOptions = catCol?.options ?? [];
  const estadoOptions = estadoCol?.options ?? [];

  type Item = {
    id: string;
    foto: string;
    nombre: string;
    serial: string;
    marca: Option | null;
    cat: Option | null;
    estado: Option | null;
    loc: string;
  };
  const items: Item[] = rows.map((r) => ({
    id: r.id,
    foto: fotoCol ? str(r.cells[fotoCol.id]) : "",
    nombre: nombreCol ? str(r.cells[nombreCol.id]) : "",
    serial: serialCol ? str(r.cells[serialCol.id]) : "",
    marca: marcaCol ? marcaCol.options?.find((o) => o.id === r.cells[marcaCol.id]) ?? null : null,
    cat: catCol ? catOptions.find((o) => o.id === r.cells[catCol.id]) ?? null : null,
    estado: estadoCol ? estadoOptions.find((o) => o.id === r.cells[estadoCol.id]) ?? null : null,
    loc: locCol ? str(r.cells[locCol.id]) : "",
  }));

  // Indicadores: total + conteo por estado (en el orden de las opciones).
  const total = items.length;
  const estadoCounts = estadoOptions.map((o) => ({ o, n: items.filter((it) => it.estado?.id === o.id).length }));
  const topEstados = estadoCounts.slice(0, 3);

  // Conteo por categoría para los chips de filtro.
  const catCounts = catOptions.map((o) => ({ o, n: items.filter((it) => it.cat?.id === o.id).length }));

  const q = query.trim().toLowerCase();
  const filtered = items.filter((it) => {
    if (activeCat && it.cat?.id !== activeCat) return false;
    if (!q) return true;
    return (
      it.nombre.toLowerCase().includes(q) ||
      it.serial.toLowerCase().includes(q) ||
      (it.marca?.label.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="space-y-5">
      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total equipos</p>
          <p className="mt-1 text-2xl font-bold">{total}</p>
        </div>
        {topEstados.map(({ o, n }) => (
          <div key={o.id} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{o.label}</p>
            <p className={cn("mt-1 inline-flex items-center gap-1.5 text-2xl font-bold")}>
              <span className={cn("size-2.5 rounded-full", tone(o.color).dot)} />
              {n}
            </p>
          </div>
        ))}
      </div>

      {/* Buscador + chips de categoría */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar equipo, serial o marca…"
            className="w-52 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={activeCat === null} onClick={() => setActiveCat(null)} label="Todos" count={total} />
          {catCounts.filter((c) => c.n > 0).map(({ o, n }) => (
            <Chip key={o.id} active={activeCat === o.id} onClick={() => setActiveCat(o.id)} label={o.label} count={n} />
          ))}
        </div>
      </div>

      {/* Galería */}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No hay equipos que coincidan.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((it) => (
            <ItemCard key={it.id} item={it} fotoColId={fotoCol?.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label} · {count}
    </button>
  );
}

function ItemCard({ item, fotoColId }: { item: { id: string; foto: string; nombre: string; serial: string; marca: { label: string } | null; cat: { label: string; color: string } | null; estado: { label: string; color: string } | null; loc: string }; fotoColId?: string }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const Icon = (item.cat && CATEGORY_ICON[item.cat.label]) || Package;

  const upload = (f: File) => {
    if (!fotoColId) return;
    setError(null);
    const fd = new FormData();
    fd.set("image", f);
    start(async () => {
      try {
        await uploadCellImage(item.id, fotoColId, fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
      }
    });
  };
  const clear = () => {
    if (!fotoColId) return;
    start(async () => {
      try {
        await setCell(item.id, fotoColId, "");
      } catch {
        /* noop */
      }
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Miniatura: si hay foto, se ve la foto (sin ícono); si no, ícono + subir. */}
      <div className="group relative h-36 bg-muted">
        {item.foto ? (
          <>
            <a href={item.foto} data-lightbox rel="noreferrer" title="Ampliar" className="block size-full cursor-zoom-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.foto} alt={item.nombre} className="size-full object-cover" />
            </a>
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/55 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
              <label className={cn("cursor-pointer rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-800 hover:bg-white", pending && "pointer-events-none opacity-60")}>
                {pending ? "Subiendo…" : "Cambiar"}
                <input type="file" accept="image/*" className="hidden" disabled={pending} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
              </label>
              <button type="button" onClick={clear} disabled={pending} className="rounded-md bg-white/90 p-1 text-slate-700 hover:bg-white hover:text-destructive" title="Quitar foto">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </>
        ) : (
          <label className={cn("flex size-full cursor-pointer flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", pending && "pointer-events-none opacity-60")}>
            <Icon className="size-7" />
            <span className="flex items-center gap-1 text-[11px] font-medium">
              <Upload className="size-3" /> {pending ? "Subiendo…" : "Subir foto"}
            </span>
            <input type="file" accept="image/*" className="hidden" disabled={pending} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
          </label>
        )}
        {item.estado ? (
          <span className={cn("absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[11px] font-medium", tone(item.estado.color).chip)}>
            {item.estado.label}
          </span>
        ) : null}
      </div>

      <div className="p-3">
        <p className="truncate text-sm font-medium" title={item.nombre}>{item.nombre || "Sin nombre"}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[item.marca?.label, item.cat?.label].filter(Boolean).join(" · ") || "—"}
        </p>
        {item.serial ? <p className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground">SN {item.serial}</p> : null}
        {item.loc ? <p className="mt-1 truncate text-[11px] text-muted-foreground">📍 {item.loc}</p> : null}
        {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
