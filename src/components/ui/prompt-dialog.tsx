"use client";

import * as React from "react";

// Diálogo de marca para pedir UN texto (reemplaza window.prompt). Promise-based:
//   const { prompt, dialog } = usePromptDialog();
//   const name = await prompt({ message: "Nombre", required: true });
//   if (name) { ... }   // null = canceló (igual que window.prompt)

export type PromptOptions = {
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean; // si true, no se puede confirmar vacío
};

type Pending = PromptOptions & { resolve: (value: string | null) => void };

export function usePromptDialog() {
  const [pending, setPending] = React.useState<Pending | null>(null);

  const prompt = React.useCallback((opts: PromptOptions | string): Promise<string | null> => {
    const o = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<string | null>((resolve) => setPending({ ...o, resolve }));
  }, []);

  const settle = React.useCallback((value: string | null) => {
    setPending((p) => { p?.resolve(value); return null; });
  }, []);

  const dialog = pending ? (
    <PromptDialog {...pending} onSubmit={(v) => settle(v)} onCancel={() => settle(null)} />
  ) : null;

  return { prompt, dialog };
}

function PromptDialog({
  title,
  message,
  placeholder,
  defaultValue = "",
  confirmLabel = "Aceptar",
  cancelLabel = "Cancelar",
  required,
  onSubmit,
  onCancel,
}: PromptOptions & { onSubmit: (value: string) => void; onCancel: () => void }) {
  const [value, setValue] = React.useState(defaultValue);
  const trimmed = value.trim();
  const canSubmit = !required || trimmed.length > 0;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
        {message ? <p className={title ? "mt-1 text-sm text-muted-foreground" : "text-sm text-muted-foreground"}>{message}</p> : null}
        {/* Sin <form> interno: el diálogo puede renderizarse DENTRO de otro <form> (anidar
            forms es HTML inválido). Enter en el input confirma; los botones son type="button". */}
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) { e.preventDefault(); onSubmit(trimmed); } }}
          placeholder={placeholder}
          className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
            {cancelLabel}
          </button>
          <button type="button" disabled={!canSubmit} onClick={() => { if (canSubmit) onSubmit(trimmed); }} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
