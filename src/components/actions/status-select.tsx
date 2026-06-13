"use client";

import { useTransition } from "react";
import { cn } from "@/lib/utils";

export function StatusSelect({
  value,
  options,
  action,
  className,
}: {
  value: string;
  options: { value: string; label: string }[];
  action: (value: string) => Promise<void>;
  className?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        start(() => action(v));
      }}
      className={cn(
        "cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-ring disabled:opacity-50",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
