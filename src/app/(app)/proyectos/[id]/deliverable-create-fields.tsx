"use client";

import * as React from "react";
import { ChevronDown, HardDrive, Link2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { cerrarMenu } from "@/components/ui/barra-menu";
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

// ── «Subir para revisión» — la GALERÍA manda ──
// El material casi siempre YA vive en la carpeta del cliente en LabTem, así que la puerta
// por defecto es esa: un solo botón grande («hero», llega por `hero` y abre su modal
// autocontenido que ya pide nombre, tipo y notas). El resto de fuentes (pegar un link,
// subir un archivo) viven plegadas en el menú «Otras fuentes ▾» — al elegir una, aparecen
// los campos clásicos del formulario (`arriba`: nombre/tipo/portada · `abajo`: más
// opciones, tareas y el botón Añadir) y una fila de pestañas para volver o cambiar.
export function SourceFields({
  hero,
  arriba,
  abajo,
}: {
  hero: React.ReactNode;
  arriba: React.ReactNode;
  abajo: React.ReactNode;
}) {
  const [fuente, setFuente] = React.useState<"galeria" | "link" | "archivo">("galeria");

  const itemCls = "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-accent";

  if (fuente === "galeria") {
    return (
      <div className="space-y-2.5">
        {hero}
        <details data-autoclose className="relative inline-block">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            Otras fuentes <span className="font-normal text-muted-foreground/70">· link o archivo</span>
            <ChevronDown className="size-3" />
          </summary>
          <div className="absolute left-0 z-20 mt-1 flex w-72 flex-col rounded-lg border border-border bg-popover p-1 shadow-lg">
            <button type="button" onClick={(e) => { cerrarMenu(e); setFuente("link"); }} className={itemCls}>
              <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Pegar un link</span>
                <span className="block text-[11px] text-muted-foreground">YouTube · Vimeo · Google Drive · MP4</span>
              </span>
            </button>
            <button type="button" onClick={(e) => { cerrarMenu(e); setFuente("archivo"); }} className={itemCls}>
              <Upload className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Subir un archivo</span>
                <span className="block text-[11px] text-muted-foreground">se guarda en la app; los pesados viajan por trozos</span>
              </span>
            </button>
          </div>
        </details>
      </div>
    );
  }

  const tabCls = (on: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
      on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="space-y-3">
      {/* Volver a la galería o saltar entre link ⇄ archivo sin perder lo escrito abajo. */}
      <div className="inline-flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
        <button type="button" onClick={() => setFuente("galeria")} className={tabCls(false)}>
          <HardDrive className="size-3.5" /> Galería
        </button>
        <button type="button" onClick={() => setFuente("link")} className={tabCls(fuente === "link")}>
          <Link2 className="size-3.5" /> Link
        </button>
        <button type="button" onClick={() => setFuente("archivo")} className={tabCls(fuente === "archivo")}>
          <Upload className="size-3.5" /> Subir archivo
        </button>
      </div>

      {arriba}

      <div className="space-y-2.5 rounded-lg border border-border bg-muted/20 p-3">
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

      {abajo}
    </div>
  );
}
