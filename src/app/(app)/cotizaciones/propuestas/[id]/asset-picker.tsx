"use client";

import * as React from "react";
import { Upload, Loader2, X, Trash2, Search } from "lucide-react";
import { ASSET_CATEGORIES, assetCategory, humanSize, type AssetKind } from "@/lib/proposals/assets";
import { listProposalAssets, uploadProposalAsset, deleteProposalAsset, type AssetRow } from "../asset-actions";

// ── Selector de la biblioteca de medios ──
// Un campo que abre la biblioteca compartida (videos de fondo, logos, imágenes), filtrable por
// categoría, con subida directa. Lo que se guarda en el bloque es la URL del medio, así que un
// mismo video sirve en veinte propuestas sin volver a subirlo.

export function AssetField({
  label,
  kind,
  value,
  onChange,
  hint,
}: {
  label: string;
  kind: AssetKind;
  value: string;
  onChange: (url: string) => void;
  hint?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="text-sm">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {value ? (
        <div className="relative mb-1.5 w-fit">
          {kind === "VIDEO" ? (
            <video src={value} muted playsInline preload="metadata" className="max-h-24 rounded-md border border-border bg-black object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="max-h-24 rounded-md border border-border bg-muted/30 object-contain p-1" />
          )}
          <button
            type="button"
            onClick={() => onChange("")}
            title="Quitar"
            className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-background shadow ring-1 ring-border"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
        >
          🗂 Biblioteca
        </button>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="o pega una URL…"
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {hint ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span> : null}
      {open ? <AssetLibrary kind={kind} onPick={(u) => { onChange(u); setOpen(false); }} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

export function AssetLibrary({ kind, onPick, onClose }: { kind: AssetKind; onPick: (url: string) => void; onClose: () => void }) {
  const [rows, setRows] = React.useState<AssetRow[] | null>(null);
  const [cat, setCat] = React.useState<string>("");
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // Categoría con la que se etiqueta lo que se suba ahora. Arranca en la del filtro (si hay
  // uno activo), que es lo que el usuario tiene en la cabeza en ese momento.
  const [upCat, setUpCat] = React.useState<string>("general");

  // Carga inicial. El estado arranca en null (= cargando) y la lista se fija dentro del
  // `then`, ya fuera del cuerpo del efecto; `alive` evita escribir si el diálogo se cerró.
  React.useEffect(() => {
    let alive = true;
    listProposalAssets({ kind })
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [kind]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function upload(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      fd.set("category", upCat);
      const res = await uploadProposalAsset(fd);
      if (res.ok) setRows((prev) => [res.asset, ...(prev ?? [])]);
      else setErr(res.error);
    } catch {
      setErr("No se pudo subir. Revisa tu conexión e inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: AssetRow) {
    setErr(null);
    const prev = rows;
    setRows((r) => (r ?? []).filter((x) => x.id !== a.id));
    const res = await deleteProposalAsset(a.id);
    if (!res.ok) { setErr(res.error ?? "No se pudo borrar."); setRows(prev); }
  }

  const shown = (rows ?? []).filter(
    (a) => (!cat || a.category === cat) && (!q.trim() || a.name.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const isVideo = kind === "VIDEO";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Biblioteca de medios">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">{isVideo ? "Videos de fondo" : kind === "LOGO" ? "Logos" : "Imágenes"}</h3>
          <span className="text-xs text-muted-foreground">· biblioteca compartida</span>
          <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            Subir {isVideo ? "video" : "imagen"}
            <input
              type="file"
              accept={isVideo ? "video/*" : "image/*"}
              className="hidden"
              disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) void upload(f); }}
            />
          </label>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Categoría con la que se etiquetará lo próximo que se suba */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Al subir, guardar en
            <select
              value={upCat}
              onChange={(e) => setUpCat(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
            >
              {ASSET_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
              ))}
            </select>
          </label>
          <div className="ml-auto flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1">
            <Search className="size-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-28 bg-transparent text-xs outline-none" />
          </div>
        </div>

        {/* Filtro por categoría */}
        <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2">
          <button
            type="button"
            onClick={() => setCat("")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${!cat ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-accent"}`}
          >
            Todas
          </button>
          {ASSET_CATEGORIES.map((c) => {
            const n = (rows ?? []).filter((a) => a.category === c.key).length;
            if (!n && cat !== c.key) return null;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  const next = cat === c.key ? "" : c.key;
                  setCat(next);
                  // Filtrar por una categoría suele preceder a subir ahí mismo: la de subida sigue al filtro.
                  if (next) setUpCat(next);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${cat === c.key ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-accent"}`}
              >
                {c.icon} {c.label} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>

        {err ? <p className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">{err}</p> : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {rows === null ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando la biblioteca…</p>
          ) : shown.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <p>{(rows ?? []).length === 0 ? "La biblioteca está vacía." : "Nada en esta categoría."}</p>
              <p className="mt-1 text-xs">Sube {isVideo ? "un video" : "una imagen"} con el botón de arriba y quedará disponible para todas las propuestas.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {shown.map((a) => (
                <div key={a.id} className="group relative overflow-hidden rounded-lg border border-border">
                  <button type="button" onClick={() => onPick(a.url)} className="block w-full text-left hover:opacity-90" title={`Usar «${a.name}»`}>
                    {isVideo ? (
                      <video src={a.url} muted playsInline preload="metadata" className="h-24 w-full bg-black object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.name} className="h-24 w-full bg-muted/40 object-contain p-2" />
                    )}
                    <span className="block truncate px-2 pt-1.5 text-xs font-medium">{a.name}</span>
                    <span className="block truncate px-2 pb-1.5 text-[10px] text-muted-foreground">
                      {assetCategory(a.category).icon} {assetCategory(a.category).label} · {humanSize(a.size)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(a)}
                    title="Borrar de la biblioteca"
                    className="absolute right-1.5 top-1.5 hidden rounded-md bg-background/90 p-1 text-muted-foreground shadow ring-1 ring-border hover:text-destructive group-hover:block"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
