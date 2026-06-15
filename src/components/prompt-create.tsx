"use client";

import * as React from "react";

// Botón que pide un nombre antes de crear (evita crear elementos "sin título").
// Recibe una server action que acepta el nombre como argumento.
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
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() => {
        const name = window.prompt(promptText, defaultValue)?.trim();
        if (name) start(() => Promise.resolve(action(name)));
      }}
    >
      {children}
    </button>
  );
}
