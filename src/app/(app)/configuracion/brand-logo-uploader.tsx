"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X } from "lucide-react";
import { uploadOrgLogo, removeOrgLogo } from "./branding-actions";

type Variant = "light" | "dark";

// Panel (Ajustes → Marca) para SUBIR el logo de la organización en dos versiones: para fondo
// claro y para fondo oscuro. Se guarda en disco (sin migración) y se muestra en toda la app
// (barra lateral, login…). Si no subes nada, se usa el logo Labstream de fábrica.
export function BrandLogoUploader({ custom }: { custom: { light: boolean; dark: boolean } }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<Variant | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Cambia al subir/quitar para forzar que el <img> pida la versión nueva (evita caché).
  const [ver, setVer] = React.useState(0);

  const upload = async (variant: Variant, file: File) => {
    setError(null);
    setBusy(variant);
    const fd = new FormData();
    fd.set("variant", variant);
    fd.set("file", file);
    const r = await uploadOrgLogo(fd);
    setBusy(null);
    if (!r.ok) { setError(r.error ?? "No se pudo subir."); return; }
    setVer((v) => v + 1);
    router.refresh();
  };
  const remove = async (variant: Variant) => {
    setError(null);
    setBusy(variant);
    const r = await removeOrgLogo(variant);
    setBusy(null);
    if (!r.ok) { setError(r.error ?? "No se pudo quitar."); return; }
    setVer((v) => v + 1);
    router.refresh();
  };

  const slot = (variant: Variant, title: string, previewBg: string) => (
    <div className="flex-1 rounded-lg border border-border p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mb-2 grid h-14 place-items-center rounded-md border border-border" style={{ background: previewBg }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/brand-logo/${variant}?v=${ver}`} alt="" className="max-h-9 w-auto" />
      </div>
      <div className="flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent">
          {busy === variant ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Subir PNG
          <input
            type="file"
            accept="image/png"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(variant, f); e.currentTarget.value = ""; }}
          />
        </label>
        {custom[variant] ? (
          <button type="button" onClick={() => void remove(variant)} disabled={busy === variant} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive">
            <X className="size-3.5" /> Quitar
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold">Logo de la organización</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Sube tu logo para que se vea perfecto en tema claro y oscuro. PNG con transparencia, máx. 2 MB.
          Si no subes nada, se usa el logo Labstream por defecto.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {slot("light", "Logo para fondo claro", "#ffffff")}
        {slot("dark", "Logo para fondo oscuro", "#18181b")}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
