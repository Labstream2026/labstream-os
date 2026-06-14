"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Botón que copia un texto (ej. ruta SMB del NAS) al portapapeles.
export function CopyText({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* sin portapapeles */
        }
      }}
      title="Copiar ruta"
      className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-muted", className)}
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}
