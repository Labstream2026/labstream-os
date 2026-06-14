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
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set(name, e.target.value);
        start(() => action(fd));
      }}
      className={cn(
        "cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-50",
        className,
      )}
    />
  );
}
