"use client";

import * as React from "react";
import { ImagePlus, Trash2, Palette, Loader2, Check } from "lucide-react";
import { TONES, tone } from "@/lib/colors";
import { cn } from "@/lib/utils";

type SaveResult = { ok: boolean; error?: string };

// Portada/cabecera tipo Notion reutilizable (clientes y proyectos): imagen de banner
// (o degradado del color), burbuja de emoji y selector de color, todo editable en línea
// y guardado al instante. Las acciones llegan bind-eadas por el contenedor (cliente o
// proyecto) — el componente solo construye el FormData con lo que cambió.
export function CoverBanner({
  name,
  subtitle,
  emoji,
  fallbackEmoji = "📁",
  color,
  bannerUrl,
  canEdit,
  onSave,
  onClearCover,
  children,
}: {
  name: string;
  subtitle?: React.ReactNode;
  emoji: string | null;
  fallbackEmoji?: string;
  color: string | null;
  bannerUrl: string | null;
  canEdit: boolean;
  onSave: (fd: FormData) => Promise<SaveResult>;
  onClearCover: () => Promise<SaveResult>;
  children?: React.ReactNode;
}) {
  const [pending, start] = React.useTransition();
  const [colorOpen, setColorOpen] = React.useState(false);
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const [emojiDraft, setEmojiDraft] = React.useState(emoji ?? "");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const t = tone(color);

  const save = (build: (fd: FormData) => void) => {
    const fd = new FormData();
    build(fd);
    start(() => { void onSave(fd); });
  };
  const onFile = (f: File | null) => { if (f) save((fd) => fd.set("banner", f)); };
  const pickColor = (key: string) => { setColorOpen(false); save((fd) => fd.set("accentColor", key)); };
  const saveEmoji = () => {
    setEmojiOpen(false);
    const v = emojiDraft.trim().slice(0, 8);
    if (v !== (emoji ?? "")) save((fd) => fd.set("emoji", v));
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* ── Portada ── */}
      <div className="group relative h-36 w-full sm:h-48">
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full" style={{ background: `linear-gradient(120deg, ${t.hex} 0%, ${t.hex}cc 55%, ${t.hex}80 100%)` }} />
        )}

        {canEdit ? (
          <>
            <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={pending} className="inline-flex items-center gap-1 rounded-md bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70 disabled:opacity-50">
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />} {bannerUrl ? "Cambiar portada" : "Añadir portada"}
              </button>
              <button type="button" onClick={() => setColorOpen((o) => !o)} title="Color" className="inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70">
                <Palette className="size-3.5" />
              </button>
              {bannerUrl ? (
                <button type="button" onClick={() => start(() => { void onClearCover(); })} disabled={pending} title="Quitar portada" className="inline-flex items-center rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70 disabled:opacity-50">
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
            {colorOpen ? (
              <div className="absolute right-3 top-12 z-10 grid grid-cols-7 gap-1.5 rounded-xl border border-border bg-popover p-2 shadow-xl">
                {TONES.map((to) => (
                  <button
                    key={to.key}
                    type="button"
                    onClick={() => pickColor(to.key)}
                    title={to.label}
                    className={cn("size-6 rounded-full ring-offset-2 ring-offset-popover transition hover:scale-110", color === to.key && "ring-2 ring-foreground")}
                    style={{ background: to.hex }}
                  />
                ))}
              </div>
            ) : null}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </>
        ) : null}
      </div>

      {/* ── Emoji + título ── */}
      <div className="px-5 pb-4">
        <div className="-mt-9 mb-2 flex items-end gap-3">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => { if (canEdit) { setEmojiDraft(emoji ?? ""); setEmojiOpen((o) => !o); } }}
            title={canEdit ? "Cambiar icono" : undefined}
            className="flex size-[68px] shrink-0 items-center justify-center rounded-2xl border-4 border-card bg-muted text-4xl shadow-sm transition hover:bg-muted/70 disabled:cursor-default disabled:hover:bg-muted"
          >
            {emoji || fallbackEmoji}
          </button>
        </div>

        {emojiOpen ? (
          <div className="mb-2 flex items-center gap-2">
            <input
              autoFocus
              value={emojiDraft}
              onChange={(e) => setEmojiDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveEmoji(); if (e.key === "Escape") setEmojiOpen(false); }}
              maxLength={8}
              placeholder="Pega un emoji"
              className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-center text-lg outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="button" onClick={saveEmoji} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              <Check className="size-3.5" /> Guardar
            </button>
          </div>
        ) : null}

        <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
        {subtitle ? <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div> : null}
        {children}
      </div>
    </div>
  );
}
