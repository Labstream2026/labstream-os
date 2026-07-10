"use client";

import * as React from "react";
import { EmojiPicker } from "@/components/chat/emoji-picker";
import { EntityEmoji, SECTOR_MARKS, PROJECT_MARKS } from "@/components/icons/marks";
import { cn } from "@/lib/utils";

// Selector de icono para FORMULARIOS: un botón que muestra el icono actual y, al pulsarlo,
// abre el desplegable de emojis (el mismo del chat y las portadas). El valor elegido viaja en
// un <input type="hidden" name={name}> para que se envíe con cualquier server action, sin JS extra.
// Reemplaza los <input> de emoji escritos a mano por un menú consistente en toda la app.
//
// `marks` añade la galería de íconos propios de Labstream como primer grupo del picker:
// "sectores" (clientes: moda, salud, legal…) o "proyectos" (foto, video, redes…). Se pasa por
// NOMBRE (string) para poder usarse desde componentes de servidor; el valor guardado es el
// token "ls:<clave>", que EntityEmoji pinta como ícono en toda la app.
export function EmojiSelect({
  name,
  defaultValue,
  fallback = "🙂",
  allowClear = true,
  className,
  marks,
}: {
  name: string;
  defaultValue?: string | null;
  fallback?: string; // icono mostrado cuando no hay valor (placeholder)
  allowClear?: boolean;
  className?: string;
  marks?: "sectores" | "proyectos";
}) {
  const [value, setValue] = React.useState(defaultValue ?? "");
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  // Catálogo COMPLETO con el grupo relevante primero (sectores para clientes, tipos para
  // proyectos): el selector de entidades ya solo ofrece íconos modernos, sin emojis viejos.
  const markList =
    marks === "sectores" ? [...SECTOR_MARKS, ...PROJECT_MARKS]
    : marks === "proyectos" ? [...PROJECT_MARKS, ...SECTOR_MARKS]
    : undefined;
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Elegir icono"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex h-10 w-12 items-center justify-center rounded-md border border-input bg-background text-xl leading-none outline-none hover:bg-accent focus:ring-2 focus:ring-ring",
          className,
        )}
      >
        <span className={cn("inline-flex items-center", !value && "opacity-50")}>
          <EntityEmoji value={value} fallback={fallback} />
        </span>
      </button>
      {open ? (
        <EmojiPicker
          anchorRef={btnRef}
          onClose={() => setOpen(false)}
          onPick={(e) => { setValue(e); setOpen(false); }}
          marks={markList}
          marksOnly={Boolean(markList)}
          footer={
            allowClear && value ? (
              <button
                type="button"
                onClick={() => { setValue(""); setOpen(false); }}
                className="flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Quitar icono
              </button>
            ) : undefined
          }
        />
      ) : null}
    </>
  );
}
