"use client";

import * as React from "react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

// Botón de envío que pide confirmación (diálogo de MARCA) antes de ejecutar la acción del
// <form>. Sirve para borrados dentro de formularios de server components (que no pueden
// llevar onClick). Si el usuario cancela, no se envía. Promise-based: capturamos el form
// ANTES del await (el evento se recicla) y, si confirma, hacemos requestSubmit().
export function ConfirmSubmit({
  message,
  children,
  className,
  title,
  confirmLabel,
  danger = true,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const { confirm, dialog } = useConfirmDialog();
  return (
    <>
      <button
        type="button"
        title={title}
        className={className}
        onClick={async (e) => {
          const form = e.currentTarget.form;
          if (await confirm({ message, confirmLabel, danger })) form?.requestSubmit();
        }}
      >
        {children}
      </button>
      {dialog}
    </>
  );
}
