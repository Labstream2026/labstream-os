"use client";

import * as React from "react";
import { usePromptDialog } from "@/components/ui/prompt-dialog";

// Botón que pide un nombre (diálogo de MARCA) antes de crear (evita crear elementos "sin
// título"). Recibe una server action que acepta el nombre como argumento.
export function PromptCreate({
  action,
  promptText,
  defaultValue = "",
  className,
  children,
}: {
  action: (name: string) => Promise<void> | void;
  promptText: string;
  defaultValue?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [pending, start] = React.useTransition();
  const { prompt, dialog } = usePromptDialog();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={async () => {
          const name = await prompt({ message: promptText, defaultValue, required: true });
          if (name) start(() => Promise.resolve(action(name)));
        }}
      >
        {children}
      </button>
      {dialog}
    </>
  );
}
