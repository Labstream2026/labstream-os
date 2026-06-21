import { type ComponentType } from "react";
import { ChevronsUp, ChevronUp, Minus, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { priorityBadge, type LabelRow, type PriorityIcon } from "@/lib/colors";

// Píldora ENFÁTICA de prioridad: sólida (color configurado del WorkflowLabel) + icono según
// el nivel. Fuente única usada en toda la app (mis-tareas, lista de proyecto, etc.).
const ICONS: Record<PriorityIcon, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  "chevrons-up": ChevronsUp,
  "chevron-up": ChevronUp,
  minus: Minus,
  flag: Flag,
};

export function PriorityPill({
  priorities,
  value,
  className,
}: {
  priorities: LabelRow[];
  value: string;
  className?: string;
}) {
  const p = priorityBadge(priorities, value);
  const Icon = ICONS[p.icon];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        p.solid,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {p.label}
    </span>
  );
}
