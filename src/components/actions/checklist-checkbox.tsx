"use client";

import { useTransition } from "react";
import { cn } from "@/lib/utils";

export function ChecklistCheckbox({
  checked,
  label,
  action,
}: {
  checked: boolean;
  label: string;
  action: (done: boolean) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => action(!checked))}
      className="flex w-full items-center gap-2 text-left disabled:opacity-50"
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded border text-[10px]",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
        )}
      >
        {checked ? "✓" : ""}
      </span>
      <span className={cn("text-sm", checked && "text-muted-foreground line-through")}>{label}</span>
    </button>
  );
}
