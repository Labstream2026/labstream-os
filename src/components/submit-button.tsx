"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

// Botón de envío para formularios con server action (<form action={fn}>): se DESHABILITA
// automáticamente mientras la acción está en curso. Evita la doble-creación por doble toque
// (muy común en móvil, sobre todo cuando la acción tarda, p. ej. subir un video). Debe ir
// DENTRO del <form> (useFormStatus lee el estado del form padre).
export function SubmitButton({
  children,
  className,
  pendingText,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;
  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-busy={pending}
      className={cn(className, isDisabled && "cursor-not-allowed opacity-60")}
      {...rest}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
