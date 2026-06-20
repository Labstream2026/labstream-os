"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Diálogo de confirmación de marca, reutilizable y SIN proveedor global (autocontenido por
// componente, para no tocar el layout raíz). Reemplaza al window.confirm nativo: es
// promise-based, así que el handler hace `if (await confirm(...)) { ... }` igual de simple.
//
// Uso:
//   const { confirm, dialog } = useConfirmDialog();
//   ...onClick={async () => { if (await confirm({ message: "¿Borrar?", danger: true })) run(); }}
//   return <>{...}{dialog}</>;

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // botón rojo + foco en Cancelar (acción destructiva)
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

export function useConfirmDialog() {
  const [pending, setPending] = React.useState<Pending | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    const o = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => setPending({ ...o, resolve }));
  }, []);

  const settle = React.useCallback((ok: boolean) => {
    setPending((p) => { p?.resolve(ok); return null; });
  }, []);

  const dialog = pending ? (
    <ConfirmDialog {...pending} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  ) : null;

  return { confirm, dialog };
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancelar",
  danger,
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  // Escape cancela. No se ata Enter a Confirmar (evita confirmar por accidente una acción
  // destructiva); el botón enfocado se activa con Enter de forma natural.
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
        <p className={cn("text-sm text-muted-foreground", title && "mt-1")}>{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            // type="button" es CRÍTICO: el diálogo puede renderizarse DENTRO de un <form>
            // (p. ej. ConfirmSubmit); sin él, el botón haría submit del form y dispararía la
            // acción aunque se cancele. En acciones destructivas el foco arranca en Cancelar.
            type="button"
            autoFocus={danger}
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus={!danger}
            onClick={onConfirm}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold text-white",
              danger ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90",
            )}
          >
            {confirmLabel ?? (danger ? "Eliminar" : "Confirmar")}
          </button>
        </div>
      </div>
    </div>
  );
}
