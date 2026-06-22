"use client";

import * as React from "react";
import { Camera, ImagePlus, Pencil, Check, X, Loader2 } from "lucide-react";
import { TONES, tone } from "@/lib/colors";
import { cn } from "@/lib/utils";

type SaveResult = { ok: boolean; error?: string };

// Cabecera del detalle de cliente: foto (izquierda) + nombre con color y descripción editable
// + logo cuadrado (derecha). El color del cliente (accentColor) es el FONDO de toda la barra,
// detrás de la foto y el logo; el logo se apoya sobre ese fondo (sin caja de color propia).
export function ClientHeader({
  name,
  description,
  photoUrl,
  logoUrl,
  color,
  projectsCount,
  canEdit,
  onSave,
  onClearImage,
}: {
  name: string;
  description: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
  color: string | null;
  projectsCount: number;
  canEdit: boolean;
  onSave: (fd: FormData) => Promise<SaveResult>;
  onClearImage: (kind: "photo" | "logo") => Promise<SaveResult>;
}) {
  const [pending, start] = React.useTransition();
  const [colorOpen, setColorOpen] = React.useState(false);
  const [editingDesc, setEditingDesc] = React.useState(false);
  const [descDraft, setDescDraft] = React.useState(description ?? "");
  const photoRef = React.useRef<HTMLInputElement>(null);
  const logoRef = React.useRef<HTMLInputElement>(null);
  const t = color ? tone(color) : null;

  const save = (build: (fd: FormData) => void) => {
    const fd = new FormData();
    build(fd);
    start(() => {
      void onSave(fd);
    });
  };
  const onFile = (kind: "photo" | "logo", f: File | null) => {
    if (f) save((fd) => fd.set(kind, f));
  };
  const pickColor = (key: string) => {
    setColorOpen(false);
    save((fd) => fd.set("accentColor", key));
  };
  const saveDesc = () => {
    setEditingDesc(false);
    if ((descDraft.trim() || "") !== (description ?? "")) save((fd) => fd.set("description", descDraft.trim()));
  };

  return (
    <div className={cn("relative rounded-2xl border p-4 sm:p-5", t ? t.chip : "border-border bg-card")}>
      {pending ? <Loader2 className="absolute right-3 top-3 size-4 animate-spin opacity-60" /> : null}
      <div className="flex flex-wrap items-center gap-4 sm:gap-5">
        {/* ── Foto (izquierda) ── */}
        <div className="relative shrink-0">
          <div className="flex size-[76px] items-center justify-center overflow-hidden rounded-full border border-black/10 bg-background/70">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={name} className="size-full object-cover" />
            ) : (
              <Camera className="size-7 text-muted-foreground" />
            )}
          </div>
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                title="Subir foto"
                className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground"
              >
                <ImagePlus className="size-3.5" />
              </button>
              {photoUrl ? (
                <button
                  type="button"
                  onClick={() => start(() => { void onClearImage("photo"); })}
                  title="Quitar foto"
                  className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              ) : null}
              <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => onFile("photo", e.target.files?.[0] ?? null)} />
            </>
          ) : null}
        </div>

        {/* ── Nombre + color + descripción (centro) ── */}
        <div className="min-w-[12rem] flex-1">
          <div className="relative flex items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight">{name}</h1>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setColorOpen((v) => !v)}
                title="Color del cliente"
                className={cn("size-3.5 shrink-0 rounded-full border border-black/10", t ? t.dot : "bg-muted-foreground/40")}
              />
            ) : color ? (
              <span className={cn("size-3 shrink-0 rounded-full", t?.dot)} />
            ) : null}
            {colorOpen ? (
              <div className="absolute left-0 top-7 z-20 w-56 rounded-xl border border-border bg-popover p-2 shadow-lg">
                <div className="grid grid-cols-7 gap-1.5">
                  <button type="button" onClick={() => pickColor("")} title="Sin color" className="flex size-6 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground">∅</button>
                  {TONES.map((tn) => (
                    <button key={tn.key} type="button" onClick={() => pickColor(tn.key)} title={tn.label} className={cn("size-6 rounded-full border border-black/10", tn.dot)} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Descripción editable */}
          {editingDesc ? (
            <div className="mt-1.5 flex items-start gap-1.5">
              <textarea
                autoFocus
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setEditingDesc(false); setDescDraft(description ?? ""); } }}
                rows={2}
                maxLength={280}
                placeholder="Descripción del cliente…"
                className="min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
              <button type="button" onClick={saveDesc} title="Guardar" className="mt-0.5 rounded-md border border-border bg-background p-1 text-emerald-600 hover:bg-muted"><Check className="size-4" /></button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => canEdit && setEditingDesc(true)}
              className={cn("mt-1 block max-w-2xl text-left text-sm", description ? "text-muted-foreground" : "text-muted-foreground/60", canEdit && "hover:text-foreground")}
            >
              {description || (canEdit ? "+ Añadir descripción" : "")}
              {description ? <span className="text-muted-foreground/70"> · {projectsCount} proyecto{projectsCount === 1 ? "" : "s"}</span> : null}
              {canEdit && description ? <Pencil className="ml-1.5 inline size-3 align-baseline opacity-50" /> : null}
            </button>
          )}
        </div>

        {/* ── Logo (derecha, cuadrado, separado del borde). Se apoya sobre el fondo
              de la barra (color del cliente); sin caja de color propia. ── */}
        <div className="relative shrink-0 sm:mr-3">
          <button
            type="button"
            onClick={() => canEdit && logoRef.current?.click()}
            title={canEdit ? "Subir logo (PNG)" : undefined}
            className={cn("flex size-24 items-center justify-center overflow-hidden rounded-xl border border-black/10", canEdit && "hover:ring-2 hover:ring-primary/40")}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`Logo ${name}`} className="max-h-[88px] max-w-[88px] object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">{canEdit ? "Subir logo" : "Sin logo"}</span>
            )}
          </button>
          {canEdit && logoUrl ? (
            <button
              type="button"
              onClick={() => start(() => { void onClearImage("logo"); })}
              title="Quitar logo"
              className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          ) : null}
          {canEdit ? <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => onFile("logo", e.target.files?.[0] ?? null)} /> : null}
        </div>
      </div>
    </div>
  );
}
