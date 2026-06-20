"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { runInventoryImport } from "./actions";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

// Botón solo-admin para cargar el inventario inicial (desde la hoja del equipo).
// Idempotente: omite los equipos que ya existan (por serial o nombre).
export function ImportInventoryButton() {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  return (
    <div className="flex items-center gap-3">
      {dialog}
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          if (!(await confirm({ title: "Importar inventario", message: "Importar el inventario inicial de equipos. No duplica los que ya estén. ¿Continuar?", confirmLabel: "Importar" }))) return;
          setMsg(null);
          start(async () => {
            const r = await runInventoryImport();
            if (r.ok) setMsg(`Listo: ${r.created} equipos añadidos${r.skipped ? `, ${r.skipped} ya existían` : ""}.`);
            else setMsg(r.error ?? "No se pudo importar.");
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        <Download className="size-3.5" />
        {pending ? "Importando…" : "Importar inventario inicial"}
      </button>
      {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
    </div>
  );
}
