"use client";

import * as React from "react";
import { Camera, ImagePlus, X, Loader2, Check } from "lucide-react";
import { TONES, tone } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { EntityEmoji } from "@/components/icons/marks";
import { ImageCropper } from "@/components/image-cropper";

type SaveResult = { ok: boolean; error?: string };

// Apariencia del cliente en DOS tarjetas (rejilla fluida de Ajustes): «Identidad» (vista previa
// + color + foto + logo) y «Portada» (banner ancho). Piezas más pequeñas = la rejilla encaja sin
// espacio muerto. Ambas usan las mismas acciones de siempre y reportan su resultado (✓ o el
// error real): un fallo del almacenamiento del NAS no pasa en silencio.

// Guardado con feedback compartido por ambas tarjetas.
function useAppearanceSave(onSave: (fd: FormData) => Promise<SaveResult>) {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  // El «Guardado ✓» se esfuma solo; los errores se quedan hasta el siguiente intento.
  React.useEffect(() => {
    if (!msg?.ok) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  const report = (r: SaveResult) => setMsg(r.ok ? { ok: true, text: "Guardado" } : { ok: false, text: r.error ?? "No se pudo guardar." });
  const save = (build: (fd: FormData) => void) => {
    const fd = new FormData();
    build(fd);
    setMsg(null);
    start(async () => { report(await onSave(fd)); });
  };
  const run = (fn: () => Promise<SaveResult>) => { setMsg(null); start(async () => { report(await fn()); }); };
  return { pending, msg, save, run };
}

function StatusChip({ pending, msg }: { pending: boolean; msg: { ok: boolean; text: string } | null }) {
  if (pending) return <Loader2 className="size-4 animate-spin opacity-60" />;
  if (!msg) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
      {msg.ok ? <Check className="size-3.5" /> : null}
      {msg.text}
    </span>
  );
}

// ── Tarjeta 1: IDENTIDAD (vista previa + color + foto + logo) ──
export function ClientIdentity({
  name,
  emoji,
  color,
  photoUrl,
  logoUrl,
  logoBg,
  onSave,
  onClearImage,
}: {
  name: string;
  emoji: string | null;
  color: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
  logoBg: string | null;
  onSave: (fd: FormData) => Promise<SaveResult>;
  onClearImage: (kind: "photo" | "logo") => Promise<SaveResult>;
}) {
  const { pending, msg, save, run } = useAppearanceSave(onSave);
  const photoRef = React.useRef<HTMLInputElement>(null);
  const logoRef = React.useRef<HTMLInputElement>(null);
  // La FOTO pasa por el reencuadre (arrastrar + zoom) antes de subir; el logo va directo
  // (recortar un logo lo daña: se sube completo, con su transparencia).
  const [cropPhoto, setCropPhoto] = React.useState<File | null>(null);
  const onFile = (key: "photo" | "logo", f: File | null) => { if (f) save((fd) => fd.set(key, f)); };

  const t = color ? tone(color) : null;
  const toneLabel = color ? TONES.find((tn) => tn.key === color)?.label : null;

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Identidad</h3>
        <StatusChip pending={pending} msg={msg} />
      </div>

      {/* Vista previa en vivo: así se ve la tarjeta del cliente con el color elegido. */}
      <div className={cn("flex items-center gap-3 rounded-lg border p-3", t ? t.chip : "border-border bg-muted/40")}>
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-background/70">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={name} className="size-full object-cover" />
          ) : emoji ? (
            <span className="text-lg leading-none"><EntityEmoji value={emoji} /></span>
          ) : (
            <Camera className="size-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">Vista previa · así se ve en listas y cabeceras</p>
        </div>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={`Logo ${name}`} className="max-h-8 max-w-[4.5rem] shrink-0 object-contain" />
        ) : null}
      </div>

      {/* Color del cliente */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Color (tiñe la cabecera y sus proyectos){toneLabel ? <span className="text-foreground"> · {toneLabel}</span> : null}
        </p>
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
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Foto <span className="font-normal text-muted-foreground/70">· cuadrada, se recorta al centro</span></p>
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
                <button type="button" onClick={() => run(() => onClearImage("photo"))} title="Quitar foto" className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-destructive"><X className="size-3" /></button>
              ) : null}
            </div>
            <button type="button" onClick={() => photoRef.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"><ImagePlus className="size-3.5" /> Subir</button>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.currentTarget.value = ""; // permite re-elegir el mismo archivo
                if (f) setCropPhoto(f);
              }}
            />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Logo <span className="font-normal text-muted-foreground/70">· PNG con transparencia</span></p>
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
                <button type="button" onClick={() => run(() => onClearImage("logo"))} title="Quitar logo" className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-destructive"><X className="size-3" /></button>
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

      {cropPhoto ? (
        <ImageCropper
          file={cropPhoto}
          aspect={1}
          outWidth={960}
          title="Reencuadrar foto"
          onCancel={() => setCropPhoto(null)}
          onDone={(f) => { setCropPhoto(null); save((fd) => fd.set("photo", f)); }}
        />
      ) : null}
    </div>
  );
}

// ── Tarjeta 2: PORTADA (banner ancho) ──
export function ClientCover({
  bannerUrl,
  onSave,
  onClearCover,
}: {
  bannerUrl: string | null;
  onSave: (fd: FormData) => Promise<SaveResult>;
  onClearCover: () => Promise<SaveResult>;
}) {
  const { pending, msg, save, run } = useAppearanceSave(onSave);
  const bannerRef = React.useRef<HTMLInputElement>(null);
  // La portada también pasa por el reencuadre (proporción ancha fija 1600×500).
  const [cropBanner, setCropBanner] = React.useState<File | null>(null);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Portada <span className="font-normal text-muted-foreground/70">· ancha (~1600×500) · máx 8MB</span></h3>
        <div className="flex items-center gap-3">
          <StatusChip pending={pending} msg={msg} />
          {bannerUrl ? (
            <button type="button" onClick={() => run(onClearCover)} disabled={pending} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-destructive disabled:opacity-50">
              <X className="size-3" /> Quitar portada
            </button>
          ) : null}
        </div>
      </div>
      <button type="button" onClick={() => bannerRef.current?.click()} title="Subir portada (imagen ancha)" className="block w-full overflow-hidden rounded-lg border border-border hover:ring-2 hover:ring-primary/40">
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerUrl} alt="Portada del cliente" className="h-28 w-full object-cover" />
        ) : (
          <div className="flex h-28 w-full items-center justify-center bg-muted/40 text-xs text-muted-foreground"><ImagePlus className="mr-1.5 size-4" /> Subir portada</div>
        )}
      </button>
      <input
        ref={bannerRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.currentTarget.value = ""; // permite re-elegir el mismo archivo
          if (f) setCropBanner(f);
        }}
      />

      {cropBanner ? (
        <ImageCropper
          file={cropBanner}
          aspect={1600 / 500}
          outWidth={1600}
          title="Reencuadrar portada"
          onCancel={() => setCropBanner(null)}
          onDone={(f) => { setCropBanner(null); save((fd) => fd.set("banner", f)); }}
        />
      ) : null}
    </div>
  );
}
