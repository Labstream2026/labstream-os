"use client";

import * as React from "react";
import { Archive, ArchiveRestore, Trash2, Link2Off } from "lucide-react";
import { CopyLink } from "@/components/copy-link";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { setDeliverableArchived, deleteDeliverable } from "../proyectos/[id]/actions";

// Acciones de GESTIÓN de un entregable en la bandeja /revisiones — solo para quien puede gestionar
// el proyecto (canManage). Reutiliza los mismos server actions del panel del proyecto: archivar NO
// toca el enlace de entrega (sigue vivo); solo "Borrar" lo mata. `linkActive` = el enlace de
// revisión sigue funcionando (ni revocado ni caducado).
export function DeliverableAdminActions({
  deliverableId,
  projectId,
  reviewUrl,
  linkActive,
  archived,
  name,
}: {
  deliverableId: string;
  projectId: string;
  reviewUrl: string;
  linkActive: boolean;
  archived: boolean;
  name: string;
}) {
  const [pending, start] = React.useTransition();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {linkActive ? (
        <CopyLink url={reviewUrl} label="Copiar enlace" />
      ) : (
        <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground">
          <Link2Off className="size-3.5" /> Enlace inactivo
        </span>
      )}
      <button
        type="button"
        onClick={() => start(() => setDeliverableArchived(deliverableId, projectId, !archived))}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50"
        title={archived ? "Devolver al inbox activo" : "Archivar: sale del inbox pero el enlace sigue vivo"}
      >
        {archived ? <><ArchiveRestore className="size-3.5" /> Desarchivar</> : <><Archive className="size-3.5" /> Archivar</>}
      </button>
      <form action={deleteDeliverable.bind(null, deliverableId, projectId)}>
        <ConfirmSubmit
          message={`¿Borrar el entregable «${name}» con TODAS sus versiones, comentarios y decisiones? También deja de funcionar su enlace de entrega. No se puede deshacer.`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Borrar todo (mata el enlace)"
        >
          <Trash2 className="size-3.5" /> Borrar
        </ConfirmSubmit>
      </form>
    </div>
  );
}
