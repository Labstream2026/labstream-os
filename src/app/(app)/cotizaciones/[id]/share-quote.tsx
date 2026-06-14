"use client";

import { useState } from "react";
import { Link2, Check, Copy } from "lucide-react";

// Muestra el enlace público de la cotización (para enviar al cliente) y lo copia.
export function ShareQuote({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? window.location.origin + path : path;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignora */ }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
      >
        <Link2 className="size-4" /> Compartir con cliente
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-border bg-popover p-3 shadow-lg">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Enlace público (el cliente puede ver y aprobar sin iniciar sesión):
          </p>
          <div className="flex items-center gap-2">
            <input readOnly value={url} className="min-w-0 flex-1 truncate rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none" />
            <button onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
