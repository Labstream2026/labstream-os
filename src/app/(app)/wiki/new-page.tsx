"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { WIKI_TEMPLATES } from "@/lib/wiki-templates";
import { createWikiPage } from "./actions";

// Botón "Nueva página" que abre un selector de plantillas. Cada plantilla pre-rellena
// contenido, sección y etiquetas; "Página en blanco" crea una vacía.
export function NewWikiPageButton() {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="size-4" /> Nueva página
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            <p className="border-b border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground">Elige una plantilla</p>
            <div className="max-h-96 overflow-y-auto p-1">
              {WIKI_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  disabled={pending}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("templateKey", t.key);
                    start(() => createWikiPage(fd));
                  }}
                  className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-accent disabled:opacity-50"
                >
                  <span className="text-lg leading-none">{t.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t.name}</span>
                    <span className="block text-xs text-muted-foreground">{t.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
