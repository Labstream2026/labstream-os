"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { restoreProject, purgeProject } from "@/app/(app)/proyectos/[id]/actions";
import { restoreClient, purgeClient } from "@/app/(app)/clientes/actions";

// Acciones de una fila de la papelera: Restaurar (vuelve a las listas) y Borrar
// definitivamente (irreversible, con confirmación enfática). Sirve para proyectos y clientes.
export function PapeleraActions({ kind, id, name }: { kind: "project" | "client"; id: string; name: string }) {
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();

  const restore = () =>
    start(async () => {
      if (kind === "project") await restoreProject(id);
      else await restoreClient(id);
      router.refresh();
    });

  const purge = async () => {
    const ok = await confirm({
      title: "Borrar definitivamente",
      message:
        kind === "project"
          ? `Se borrará el proyecto «${name}» y su contenido (tareas, archivos, entregables). Las cotizaciones y facturas se conservan. Esta acción NO se puede deshacer.`
          : `Se borrará el cliente «${name}» y TODO lo suyo (proyectos, cotizaciones, facturas) en cascada. Esta acción NO se puede deshacer.`,
      confirmLabel: "Borrar definitivamente",
      danger: true,
    });
    if (!ok) return;
    start(async () => {
      const r = kind === "project" ? await purgeProject(id) : await purgeClient(id);
      if (r.ok) router.refresh();
      else await confirm({ title: "No se pudo", message: r.error ?? "Error al borrar.", confirmLabel: "Entendido" });
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={restore}
        disabled={pending}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
      >
        Restaurar
      </button>
      <button
        type="button"
        onClick={purge}
        disabled={pending}
        title="Borrar definitivamente"
        className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
      >
        <Trash2 className="size-3.5" /> Borrar
      </button>
      {dialog}
    </div>
  );
}
