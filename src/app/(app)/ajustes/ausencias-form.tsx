"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

// Formulario de nueva ausencia (cliente por el estado de error y el reseteo tras guardar).
export function AusenciaForm({ equipo, accion }: {
  equipo: { id: string; name: string }[];
  accion: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, arranca] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    arranca(async () => {
      const r = await accion(fd);
      if (!r.ok) { setError(r.error ?? "No se pudo registrar."); return; }
      formRef.current?.reset();
      router.refresh();
    });
  };

  const cls = "rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <form ref={formRef} onSubmit={enviar} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
      <label className="flex flex-col gap-1 text-[11px] font-medium">
        Persona
        <select name="userId" required className={cls}>
          {equipo.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-medium">
        Tipo
        <select name="tipo" defaultValue="VACACIONES" className={cls}>
          <option value="VACACIONES">Vacaciones</option>
          <option value="INCAPACIDAD">Incapacidad</option>
          <option value="PERMISO">Permiso</option>
          <option value="OTRO">Otra</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-medium">
        Desde
        <input name="desde" type="date" required className={`${cls} tabular-nums`} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-medium">
        Hasta <span className="font-normal text-muted-foreground">(vacío = un día)</span>
        <input name="hasta" type="date" className={`${cls} tabular-nums`} />
      </label>
      <label className="flex min-w-36 flex-1 flex-col gap-1 text-[11px] font-medium">
        Nota <span className="font-normal text-muted-foreground">(opcional)</span>
        <input name="nota" maxLength={200} placeholder="«viaje familiar»" className={cls} />
      </label>
      <button type="submit" disabled={pendiente}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Registrar
      </button>
      {error ? <p className="w-full text-xs font-medium text-destructive">{error}</p> : null}
    </form>
  );
}
