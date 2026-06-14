"use client";

import { useTransition } from "react";
import { cn } from "@/lib/utils";

// Input de fecha que dispara una server action (FormData con `name`) al cambiar.
// Se usa para la fecha de rodaje de las tareas (alimenta la vista de calendario).
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
  return (
    <input
      type="date"
      title={title}
      defaultValue={value ?? ""}
      // No se deshabilita durante la acción (que puede tardar por el envío de correo):
      // deshabilitar cerraría el selector nativo si está abierto. Solo baja la opacidad.
      onChange={(e) => {
        const fd = new FormData();
        fd.set(name, e.target.value);
        start(() => action(fd));
      }}
      className={cn(
        "cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring",
        pending && "opacity-60",
        className,
      )}
    />
  );
}
