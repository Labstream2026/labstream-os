"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2, Upload } from "lucide-react";
import { eliminarGif, guardarFirma } from "./acciones";
import type { GifVM } from "./compositor";

// ── Panel «Firma y GIFs» ────────────────────────────────────────────────────
// La firma se edita UNA vez y sale en todos los correos: un mini-redactor para el texto
// (negrita, enlaces) y la imagen aparte en ALTA calidad — se sube a 2× de su tamaño y viaja
// incrustada, así no se pixela ni la esconde Gmail. Abajo, la biblioteca de GIFs del estudio.

export function PanelFirma({ firmaHtml, imagenUrl }: {
  /** El HTML editable actual (vacío = la institucional con nombre y cargo). */
  firmaHtml: string;
  imagenUrl: string | null;
}) {
  const router = useRouter();
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [quitarImagen, setQuitarImagen] = React.useState(false);
  const [nombreImagen, setNombreImagen] = React.useState<string | null>(null);
  const [estado, setEstado] = React.useState<"quieto" | "guardando" | "listo" | string>("quieto");
  const inicial = React.useRef(firmaHtml);

  const guardar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("firmaHtml", editorRef.current?.innerHTML ?? "");
    if (quitarImagen) fd.set("quitarImagen", "1");
    setEstado("guardando");
    void guardarFirma(fd).then((r) => {
      if (!r.ok) { setEstado(r.error ?? "No se pudo guardar."); return; }
      setEstado("listo");
      setNombreImagen(null);
      setQuitarImagen(false);
      router.refresh();
    });
  };

  const manda = (cmd: string, valor?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, valor);
  };

  return (
    <form onSubmit={guardar} className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Tu firma</h3>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
        Sale al final de todos tus correos. Déjala vacía y se usa la institucional (tu nombre y cargo).
      </p>

      <div className="mt-3 flex items-center gap-0.5 rounded-t-lg border border-b-0 border-input px-1.5 py-1">
        {([["bold", "N", "Negrita"], ["italic", "C", "Cursiva"], ["underline", "S", "Subrayado"]] as const).map(([cmd, l, t]) => (
          <button key={cmd} type="button" title={t} onMouseDown={(e) => { e.preventDefault(); manda(cmd); }}
            className="rounded px-2 py-1 text-[12px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground">{l}</button>
        ))}
        <button type="button" title="Enlace" onMouseDown={(e) => {
          e.preventDefault();
          const url = window.prompt("Dirección del enlace (https://…)");
          if (url && /^https?:\/\//i.test(url)) manda("createLink", url);
        }} className="rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground">🔗</button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-label="Texto de la firma"
        data-placeholder="p. ej. Diana Ruiz · Productora — 300 000 0000"
        dangerouslySetInnerHTML={{ __html: inicial.current }}
        className="min-h-20 rounded-b-lg border border-input px-3 py-2 text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-ring empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-primary [&_a]:underline"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {imagenUrl && !quitarImagen ? (
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagenUrl} alt="Imagen de la firma" className="max-h-16 rounded-md border border-border" />
            <button type="button" onClick={() => setQuitarImagen(true)} className="text-[11.5px] font-medium text-destructive hover:underline">Quitar imagen</button>
          </span>
        ) : (
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <Upload className="size-3.5" /> {nombreImagen ?? "Imagen de la firma (PNG a 2×, máx. 500 KB)"}
            <input type="file" name="imagen" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
              onChange={(e) => { setNombreImagen(e.target.files?.[0]?.name ?? null); setQuitarImagen(false); }} />
          </label>
        )}
        <button type="submit" disabled={estado === "guardando"}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {estado === "guardando" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar firma
        </button>
      </div>
      {estado === "listo" ? <p className="mt-2 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">Firma guardada: sale en tu próximo correo.</p> : null}
      {estado !== "quieto" && estado !== "guardando" && estado !== "listo" ? <p className="mt-2 text-[12px] font-medium text-destructive">{estado}</p> : null}
      <p className="mt-3 text-[11px] text-muted-foreground">
        💡 La imagen viaja INCRUSTADA en el correo: se ve siempre (Gmail no la esconde) y en nítido.
        Súbela al doble del tamaño al que quieres verla — p. ej. un logo de 440 px para verse de 220 px — y no se pixela en pantallas retina.
      </p>
    </form>
  );
}

export function BibliotecaGifs({ gifs }: { gifs: (GifVM & { autor: string | null })[] }) {
  const router = useRouter();
  const [pendiente, arranca] = React.useTransition();
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">GIFs del estudio</h3>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
        La biblioteca compartida del equipo: se insertan desde el redactor (😊) y viajan incrustados, animados de verdad en la bandeja del cliente.
      </p>
      {gifs.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
          Aún no hay GIFs. Sube el primero desde el redactor: botón 😊 → «Subir GIF».
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {gifs.map((g) => (
            <figure key={g.id} className="group relative overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/correo/gif/${g.id}`} alt={g.nombre} loading="lazy" className="aspect-square w-full object-cover" />
              <figcaption className="truncate px-1.5 py-1 text-[10.5px] text-muted-foreground">{g.nombre}{g.autor ? ` · ${g.autor}` : ""}</figcaption>
              <button type="button" title="Quitar de la biblioteca" disabled={pendiente}
                onClick={() => arranca(async () => { await eliminarGif(g.id); router.refresh(); })}
                className="absolute right-1 top-1 hidden rounded-full bg-background/90 p-1.5 text-destructive shadow group-hover:block">
                <Trash2 className="size-3.5" />
              </button>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
