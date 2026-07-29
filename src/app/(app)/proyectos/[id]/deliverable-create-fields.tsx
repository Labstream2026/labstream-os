"use client";

import * as React from "react";
import { Link2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { VideoUploadField } from "./video-upload-field";

// Tipos de entregable que son "reel" (vertical 9:16). La portada solo acompaña a los reels,
// así que el campo de portada del formulario de subida solo aparece cuando se elige uno de estos.
const REEL_TYPES = new Set(["REEL", "SHORT", "REEL_CELULAR"]);

// Selector de tipo + campo de portada del formulario "Subir para revisión". El campo de portada
// se muestra únicamente cuando el tipo elegido es un reel, para que el editor no vea opciones que
// no aplican (consecuente con la sala del cliente, donde la portada solo existe en reels).
export function TypeAndCoverFields({ options }: { options: [string, string][] }) {
  const [type, setType] = React.useState("REEL");
  const isReel = REEL_TYPES.has(type);
  return (
    <>
      <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
        Tipo de contenido
        <select
          name="type"
          defaultValue="REEL"
          onChange={(e) => setType(e.target.value)}
          title="Define el formato de revisión: vertical (9:16), horizontal (16:9) o galería de fotos"
          className="rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
        >
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {isReel ? (
        <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
          Portada <span className="font-normal text-muted-foreground/70">· opcional</span>
          <input
            type="file"
            name="cover"
            accept="image/*"
            title="Imagen de portada que acompaña al reel (opcional)"
            className="max-w-56 text-xs file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1.5 file:text-xs"
          />
        </label>
      ) : null}
    </>
  );
}

// ── «¿De dónde sale el material?» — UNA fuente a la vez ──
// El formulario mostraba link + archivo + disco TODOS a la vez: puro ruido. Ahora es un
// grupo con pestañas: se ve solo la fuente elegida. Las dos primeras (Link / Subir archivo)
// viven dentro del <form> y se envían con «Añadir»; la tercera («Desde el disco», llega por
// `discoSlot`) abre su propio modal autocontenido — por eso es un disparador, no un panel.
export function SourceFields({ discoSlot }: { discoSlot?: React.ReactNode }) {
  const [fuente, setFuente] = React.useState<"link" | "archivo">("link");

  const tabCls = (on: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
      on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">¿De dónde sale el material?</span>
        <div className="inline-flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
          <button type="button" onClick={() => setFuente("link")} className={tabCls(fuente === "link")}>
            <Link2 className="size-3.5" /> Link
          </button>
          <button type="button" onClick={() => setFuente("archivo")} className={tabCls(fuente === "archivo")}>
            <Upload className="size-3.5" /> Subir archivo
          </button>
          {discoSlot}
        </div>
      </div>

      {fuente === "link" ? (
        <>
          <input
            name="fileUrl"
            placeholder="https://…  (Drive · YouTube · Vimeo · MP4)"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground">Pega el enlace y pulsa «Añadir»: la v1 nace apuntando a ese link.</p>
        </>
      ) : (
        <>
          <VideoUploadField
            name="file"
            title="Sube el material (vídeo, imagen, PDF…) para que el cliente lo vea en el portal"
            className="w-full text-xs file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1.5 file:text-xs"
          />
          <p className="text-[11px] text-muted-foreground">Se guarda en la app; los archivos pesados viajan por trozos con reintentos.</p>
        </>
      )}
    </div>
  );
}
