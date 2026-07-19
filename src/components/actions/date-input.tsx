"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// Input de fecha que dispara una server action (FormData con `name`) al cambiar.
// Se usa para la fecha de rodaje/entrega de las tareas (alimenta la vista de calendario).
// La acción puede RECHAZAR (p. ej. "la fecha de inicio no puede ser posterior a la de entrega",
// o permiso): si lo hace, antes el throw subía al límite de error y TUMBABA todo el tablero a la
// pantalla gris. Ahora se atrapa, se marca el campo en rojo, se revierte al valor guardado
// (remontando el input) y se re-sincroniza — el resto de la vista sigue intacto.
export function DateInput({
  value,
  name,
  action,
  className,
  title,
}: {
  value: string | null; // "YYYY-MM-DD"
  name: string;
  action: (formData: FormData) => Promise<void>;
  className?: string;
  title?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [err, setErr] = useState(false);
  const [remount, setRemount] = useState(0);
  return (
    <input
      key={remount}
      type="date"
      title={err ? "No se pudo aplicar el cambio (revisa las fechas)." : title}
      defaultValue={value ?? ""}
      // No se deshabilita durante la acción (que puede tardar por el envío de correo):
      // deshabilitar cerraría el selector nativo si está abierto. Solo baja la opacidad.
      onChange={(e) => {
        const fd = new FormData();
        fd.set(name, e.target.value);
        setErr(false);
        start(async () => {
          try {
            await action(fd);
          } catch {
            setErr(true);
            setRemount((n) => n + 1); // revierte al valor guardado
            router.refresh();
          }
        });
      }}
      className={cn(
        "cursor-pointer rounded-md border bg-card px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring",
        err ? "border-destructive ring-1 ring-destructive" : "border-border",
        pending && "opacity-60",
        className,
      )}
    />
  );
}
