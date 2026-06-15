"use client";

import * as React from "react";

// Botón de envío que pide confirmación antes de ejecutar la acción del <form>.
// Sirve para borrados dentro de formularios de server components (que no pueden
// llevar onClick). Si el usuario cancela, se evita el envío.
export function ConfirmSubmit({
  message,
  children,
  className,
  title,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="submit"
      title={title}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
