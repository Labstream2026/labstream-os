"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { setDeliverableReviewers } from "./actions";

type Member = { id: string; name: string; initials: string | null; color: string | null };

// Selector de VARIOS revisores (co-revisores) de un entregable. Cualquiera de los marcados puede
// pre-aprobar/solicitar cambios y a todos les aparece en su bandeja «Proyectos a revisar».
// Guarda al instante (optimista) al marcar/desmarcar.
export function ReviewersPicker({
  deliverableId,
  projectId,
  members,
  value,
}: {
  deliverableId: string;
  projectId: string;
  members: Member[];
  value: string[];
}) {
  const [pending, start] = React.useTransition();
  const [sel, setSel] = React.useState<string[]>(value);
  React.useEffect(() => setSel(value), [value]);

  const toggle = (id: string) => {
    const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
    setSel(next);
    start(() => { void setDeliverableReviewers(deliverableId, projectId, next); });
  };

  const chosen = members.filter((m) => sel.includes(m.id));
  const label = chosen.length ? chosen.map((m) => m.name.split(" ")[0]).join(", ") : "Sin asignar";

  return (
    <details data-autoclose className="relative inline-block">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent">
        <span className={cn("max-w-[12rem] truncate", !chosen.length && "text-muted-foreground")}>{label}</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </summary>
      <div className="absolute left-0 z-30 mt-1 max-h-56 w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-xs shadow-lg">
        {members.length === 0 ? (
          <p className="px-2 py-1.5 text-muted-foreground">El proyecto no tiene miembros.</p>
        ) : (
          members.map((m) => {
            const on = sel.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                disabled={pending}
                onClick={() => toggle(m.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
              >
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {on ? <Check className="size-3" /> : null}
                </span>
                <span className="truncate">{m.name}</span>
              </button>
            );
          })
        )}
      </div>
    </details>
  );
}
