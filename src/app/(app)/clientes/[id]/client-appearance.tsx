"use client";

import * as React from "react";
import { Camera, ImagePlus, X, Loader2 } from "lucide-react";
import { TONES } from "@/lib/colors";
import { cn } from "@/lib/utils";

type SaveResult = { ok: boolean; error?: string };

// Panel de APARIENCIA del cliente dentro de Ajustes: reúne toda la personalización visual
// (color, foto, logo + color de fondo del logo, y portada/banner) que antes solo se editaba
// en la cabecera o ni siquiera estaba expuesta (la portada). Usa las MISMAS acciones que el
// header (saveClientAppearance / clearClientImage), que revalidan la página al guardar.
export function ClientAppearance({
  color,
  photoUrl,
  logoUrl,
  logoBg,
  bannerUrl,
  onSave,
  onClearImage,
}: {
  color: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
  logoBg: string | null;
  bannerUrl: string | null;
  onSave: (fd: FormData) => Promise<SaveResult>;
  onClearImage: (kind: "photo" | "logo") => Promise<SaveResult>;
}) {
  const [pending, start] = React.useTransition();
  const photoRef = React.useRef<HTMLInputElement>(null);
  const logoRef = React.useRef<HTMLInputElement>(null);
  const bannerRef = React.useRef<HTMLInputElement>(null);

  const save = (build: (fd: FormData) => void) => {
    const fd = new FormData();
    build(fd);
    start(() => { void onSave(fd); });
  };
  const onFile = (key: "photo" | "logo" | "banner", f: File | null) => { if (f) save((fd) => fd.set(key, f)); };

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Apariencia</h3>
        {pending ? <Loader2 className="size-4 animate-spin opacity-60" /> : null}
      </div>

      {/* Color del cliente */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Color (tiñe la cabecera y sus proyectos)</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => save((fd) => fd.set("accentColor", ""))}
            title="Sin color"
            className={cn("flex size-7 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground", !color && "ring-2 ring-ring ring-offset-1")}
          >
            ∅
          </button>
          {TONES.map((tn) => (
            <button
              key={tn.key}
              type="button"
              onClick={() => save((fd) => fd.set("accentColor", tn.key))}
              title={tn.label}
              className={cn("size-7 rounded-full border border-black/10", tn.dot, color === tn.key && "ring-2 ring-ring ring-offset-1")}
            />
          ))}
        </div>
      </div>

      {/* Foto + Logo */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Foto</p>
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0">
              <div className="flex size-16 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="Foto del cliente" className="size-full object-cover" />
                ) : (
                  <Camera className="size-5 text-muted-foreground" />
                )}
              </div>
              {photoUrl ? (
                <button type="button" onClick={() => start(() => { void onClearImage("photo"); })} title="Quitar foto" className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-destructive"><X className="size-3" /></button>
              ) : null}
            </div>
            <button type="button" onClick={() => photoRef.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"><ImagePlus className="size-3.5" /> Subir</button>
            <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => onFile("photo", e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Logo</p>
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0">
              <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border border-border" style={logoBg ? { background: logoBg } : undefined}>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo del cliente" className="max-h-[56px] max-w-[56px] object-contain" />
                ) : (
                  <span className="text-[10px] text-muted-foreground">Sin logo</span>
                )}
              </div>
              {logoUrl ? (
                <button type="button" onClick={() => start(() => { void onClearImage("logo"); })} title="Quitar logo" className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-destructive"><X className="size-3" /></button>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={() => logoRef.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"><ImagePlus className="size-3.5" /> Subir</button>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Color de fondo del recuadro del logo (útil para PNG con transparencia)">
                Fondo
                <input type="color" defaultValue={logoBg ?? "#ffffff"} onChange={(e) => save((fd) => fd.set("logoBg", e.target.value))} className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0" />
              </label>
            </div>
            <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => onFile("logo", e.target.files?.[0] ?? null)} />
          </div>
        </div>
      </div>

      {/* Portada / banner */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Portada</p>
        <button type="button" onClick={() => bannerRef.current?.click()} title="Subir portada (imagen ancha)" className="block w-full overflow-hidden rounded-lg border border-border hover:ring-2 hover:ring-primary/40">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerUrl} alt="Portada del cliente" className="h-24 w-full object-cover" />
          ) : (
            <div className="flex h-24 w-full items-center justify-center bg-muted/40 text-xs text-muted-foreground"><ImagePlus className="mr-1.5 size-4" /> Subir portada</div>
          )}
        </button>
        <input ref={bannerRef} type="file" accept="image/*" hidden onChange={(e) => onFile("banner", e.target.files?.[0] ?? null)} />
      </div>
    </div>
  );
}
