"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { moveProjectToClient } from "./actions";

// Mover el proyecto a OTRO cliente (gestión de cartera). SOLO lo ve el administrador —
// la acción del servidor vuelve a validar el rol. Confirma antes porque arrastra efectos:
// los usuarios del portal del cliente actual pierden acceso y el chat se resincroniza.
export function MoveProjectClient({
  projectId,
  currentClientId,
  clients,
}: {
  projectId: string;
  currentClientId: string;
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [target, setTarget] = React.useState("");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const options = clients.filter((c) => c.id !== currentClientId);
  if (options.length === 0) return null;

  const move = async () => {
    const dest = options.find((c) => c.id === target);
    if (!dest) return;
    const ok = await confirm({
      title: "Mover el proyecto de cliente",
      message: `El proyecto pasará a «${dest.name}» con todo lo suyo (tareas, entregables, archivos, chat). Los usuarios del portal del cliente actual perderán el acceso; las cotizaciones y facturas ya emitidas no se tocan.`,
      confirmLabel: "Mover proyecto",
    });
    if (!ok) return;
    setError(null);
    start(async () => {
      const r = await moveProjectToClient(projectId, target);
      if (!r.ok) {
        setError(r.error ?? "No se pudo mover el proyecto.");
        return;
      }
      setTarget("");
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-dashed border-border px-3 py-2">
      {dialog}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground" title="Solo administradores">
          <ArrowRightLeft className="size-3.5" /> Mover a otro cliente:
        </span>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
        >
          <option value="">Elegir cliente…</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void move()}
          disabled={!target || pending}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3 animate-spin" /> : null} Mover
        </button>
        {error ? <span className="text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}
