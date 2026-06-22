import * as React from "react";
import { cn } from "@/lib/utils";

// Input y Textarea estándar: mismo borde, foco y tamaños en toda la app. Reemplaza la clase
// repetida ad-hoc (w-full rounded-md border border-input bg-background ...).
const base =
  "w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, "h-9", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(base, "py-2", className)} {...props} />,
);
Textarea.displayName = "Textarea";
