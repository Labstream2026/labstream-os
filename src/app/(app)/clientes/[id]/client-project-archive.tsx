"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, FileDown, Loader2 } from "lucide-react";
import { EntityEmoji } from "@/components/icons/marks";
import { cn } from "@/lib/utils";
import { archiveProject } from "@/app/(app)/proyectos/[id]/actions";

// ── Ciclo de vida → archivar PROYECTOS sueltos (aprobado por prototipo) ──
// Antes solo se podía archivar la cuenta entera; el caso real es «este proyecto ya se cerró,
// que deje de estorbar» sin tocar el resto. Cada fila manda su proyecto a la papelera con la
// MISMA acción de siempre (archiveProject: borrado suave, restaurable desde Papelera). El
// servidor decide qué proyectos entran aquí (gestión + permiso de eliminar): sin candidatos,
// el bloque no se pinta.

export type ProyectoArchivable = {
  id: string;
  name: string;
  emoji: string | null;
  statusLabel: string;
  statusClass: string;
};

function Fila({ p }: { p: ProyectoArchivable }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!confirmando) return;
    const t = setTimeout(() => setConfirmando(false), 4000);
    return () => clearTimeout(t);
  }, [confirmando]);

  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm">
        {p.emoji ? <><EntityEmoji value={p.emoji} /> </> : null}{p.name}
      </span>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", p.statusClass)}>{p.statusLabel}</span>
      {error ? <span className="shrink-0 text-[11px] text-destructive">{error}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirmando) { setConfirmando(true); return; }
          setConfirmando(false);
          setError(null);
          start(async () => {
            const r = await archiveProject(p.id);
            if (r.ok) router.refresh();
            else setError(r.error ?? "No se pudo archivar.");
          });
        }}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
          confirmando
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
        {pending ? "Archivando…" : confirmando ? "¿A la papelera?" : "Archivar"}
      </button>
    </li>
  );
}

export function ClientProjectArchive({ proyectos }: { proyectos: ProyectoArchivable[] }) {
  return (
    <div className="space-y-4">
      {proyectos.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <h3 className="text-sm font-semibold">Archivar proyectos</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manda un proyecto terminado a la papelera sin tocar el resto de la cuenta. Es borrado suave: se restaura entero desde la Papelera.
          </p>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {proyectos.map((p) => <Fila key={p.id} p={p} />)}
          </ul>
        </div>
      ) : null}

      {/* Lo acordado quedó para después; la tarjeta lo deja dicho para no perderlo. */}
      <div className="rounded-xl border border-dashed border-border p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <FileDown className="size-4" /> Exportar e importar proyectos
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Después</span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Llevarse un proyecto (o traerlo) como paquete. Acordado para una fase posterior.
        </p>
      </div>
    </div>
  );
}
