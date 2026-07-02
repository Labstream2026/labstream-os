"use client";

import * as React from "react";

// Tipos de entregable que son "reel" (vertical 9:16). La portada solo acompaña a los reels,
// así que el campo de portada del formulario de subida solo aparece cuando se elige uno de estos.
const REEL_TYPES = new Set(["REEL", "SHORT"]);

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
