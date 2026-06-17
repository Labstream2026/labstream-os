"use client";

import * as React from "react";
import { ImagePlus, Trash2, Palette, Loader2 } from "lucide-react";
import { TONES, tone } from "@/lib/colors";
import { EmojiPicker } from "@/components/chat/emoji-picker";
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
  const fileRef = React.useRef<HTMLInputElement>(null);
  const emojiBtnRef = React.useRef<HTMLButtonElement>(null);
  const t = tone(color);

  const save = (build: (fd: FormData) => void) => {
    const fd = new FormData();
    build(fd);
    start(() => { void onSave(fd); });
  };
  const onFile = (f: File | null) => { if (f) save((fd) => fd.set("banner", f)); };
  const pickColor = (key: string) => { setColorOpen(false); save((fd) => fd.set("accentColor", key)); };
  const pickEmoji = (e: string) => { setEmojiOpen(false); save((fd) => fd.set("emoji", e)); };
  const clearEmoji = () => { setEmojiOpen(false); save((fd) => fd.set("emoji", "")); };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      {/* ── Hero: imagen (o degradado) DETRÁS, contenido DELANTE ── */}
      <div className="group relative h-48 sm:h-60">
        {/* Capa de fondo, recortada a las esquinas redondeadas */}
        <div className="absolute inset-0 overflow-hidden rounded-t-2xl">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full" style={{ background: `linear-gradient(120deg, ${t.hex} 0%, ${t.hex}cc 55%, ${t.hex}80 100%)` }} />
          )}
          {/* Velo para que el texto blanco se lea sobre cualquier imagen */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/5" />
        </div>

        {/* Controles de edición (delante, arriba a la derecha) */}
        {canEdit ? (
          <>
            <div className="absolute right-3 top-3 z-20 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
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
              <>
                <div className="fixed inset-0 z-20" onClick={() => setColorOpen(false)} />
                <div className="absolute right-3 top-12 z-30 grid grid-cols-7 gap-1.5 rounded-xl border border-border bg-popover p-2 shadow-xl">
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
              </>
            ) : null}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </>
        ) : null}

        {/* Contenido sobre la imagen (delante): emoji + nombre + subtítulo */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-end gap-3 p-4 sm:p-5">
          <div className="shrink-0">
            <button
              ref={emojiBtnRef}
              type="button"
              disabled={!canEdit}
              onClick={() => { if (canEdit) setEmojiOpen((o) => !o); }}
              title={canEdit ? "Cambiar icono" : undefined}
              className="flex size-[64px] items-center justify-center rounded-2xl border border-white/30 bg-white/15 text-4xl shadow-lg backdrop-blur transition hover:bg-white/25 disabled:cursor-default disabled:hover:bg-white/15"
            >
              {emoji || fallbackEmoji}
            </button>
            {emojiOpen ? (
              <EmojiPicker
                anchorRef={emojiBtnRef}
                onClose={() => setEmojiOpen(false)}
                onPick={pickEmoji}
                footer={
                  emoji ? (
                    <button type="button" onClick={clearEmoji} className="flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">
                      <Trash2 className="size-3.5" /> Quitar icono
                    </button>
                  ) : null
                }
              />
            ) : null}
          </div>
          <div className="min-w-0 pb-1">
            <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-md sm:text-3xl">{name}</h1>
            {subtitle ? <div className="mt-0.5 truncate text-sm text-white/85 drop-shadow">{subtitle}</div> : null}
          </div>
        </div>
      </div>

      {/* Pie con info extra (estado, progreso…) sobre fondo de tarjeta normal */}
      {children ? <div className="px-5 py-3">{children}</div> : null}
    </div>
  );
}
