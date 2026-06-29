"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, FolderPlus, Archive } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { archiveClient } from "./actions";

// Menú de acciones rápidas en la tarjeta de cliente (lista de Clientes): crear un proyecto
// nuevo ya asociado a este cliente, y archivarlo (borrado suave → Papelera). Archivar es solo
// admin; el server action lo vuelve a verificar igualmente.
export function ClientCardMenu({
  clientId,
  clientName,
  canCreateProject,
  canArchive,
}: {
  clientId: string;
  clientName: string;
  canCreateProject: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!canCreateProject && !canArchive) return null;

  function newProject() {
    setOpen(false);
    router.push(`/proyectos/nuevo?clientId=${clientId}`);
  }

  function archive() {
    setOpen(false);
    start(async () => {
      const ok = await confirm({
        title: "Archivar cliente",
        message: `¿Mover «${clientName}» a la papelera? Sale de las listas pero se conserva todo (proyectos, cotizaciones, facturas) y se puede restaurar.`,
        confirmLabel: "Archivar",
        danger: true,
      });
      if (!ok) return;
      const r = await archiveClient(clientId);
      if (r.ok) router.refresh();
      else await confirm({ title: "No se pudo", message: r.error ?? "Error al archivar.", confirmLabel: "Entendido" });
    });
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-label="Acciones del cliente"
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        <MoreVertical className="size-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-9 z-20 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {canCreateProject ? (
            <button type="button" onClick={newProject} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent">
              <FolderPlus className="size-4 text-muted-foreground" /> Nuevo proyecto
            </button>
          ) : null}
          {canArchive ? (
            <button type="button" onClick={archive} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10">
              <Archive className="size-4" /> Archivar cliente
            </button>
          ) : null}
        </div>
      ) : null}
      {dialog}
    </div>
  );
}
