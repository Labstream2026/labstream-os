import * as React from "react";
import { cn } from "@/lib/utils";

// Estado vacío consistente en toda la app: ícono + título + descripción + acción opcional.
// Reemplaza los "No hay …" sueltos por una invitación clara a crear/empezar. El ícono es un
// elemento de lucide-react (p. ej. <FileText />); la acción, un <Button>/<Link> opcional.
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
