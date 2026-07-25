"use client";

import * as React from "react";
import { Check, ChevronDown, Copy, Download } from "lucide-react";

// «Descargar todo» de la sala de entrega: panel con TODOS los enlaces del paquete (cada uno
// pasa por /go, así el registro de descargas sigue funcionando) + copiar la lista completa.
// No dispara ráfagas de window.open: la mayoría son enlaces de Drive y el navegador las
// bloquearía; una lista clara vale más que un popup bloqueado.
export function DownloadAll({ entries }: { entries: { label: string; href: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  if (entries.length < 2) return null;

  const copyAll = async () => {
    const text = entries.map((e) => `${e.label}: ${new URL(e.href, window.location.origin).href}`).join("\n");
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
      >
        <Download className="size-3.5" /> Descargar todo ({entries.length}) <ChevronDown className="size-3" />
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[90vw] rounded-xl border border-border bg-popover p-2 shadow-2xl">
          <button
            type="button"
            onClick={copyAll}
            className="mb-1 flex w-full items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            {copied ? "Lista copiada" : "Copiar todos los enlaces"}
          </button>
          <div className="max-h-72 overflow-y-auto">
            {entries.map((e, i) => (
              <a
                key={i}
                href={e.href}
                target="_blank"
                rel="noreferrer"
                className="block truncate rounded-md px-2.5 py-1.5 text-xs hover:bg-accent"
                title={e.label}
              >
                ⬇ {e.label}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
