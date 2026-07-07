"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { EmojiSelect } from "@/components/emoji-select";
import { updateClient } from "../actions";

export function ClientEdit({
  clientId,
  name,
  emoji,
  company,
  description,
  notes,
}: {
  clientId: string;
  name: string;
  emoji: string | null;
  company: string | null;
  description: string | null;
  notes: string | null;
}) {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    start(async () => {
      const r = await updateClient(clientId, fd);
      setMsg(r.ok ? { ok: true, text: "Guardado." } : { ok: false, text: r.error ?? "No se pudo guardar." });
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold">Información del cliente</h3>
      <div className="grid grid-cols-[72px_1fr] gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Icono</span>
          <EmojiSelect name="emoji" defaultValue={emoji} fallback="🏢" marks="sectores" className="w-full" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Nombre</span>
          <input name="name" required defaultValue={name} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Empresa</span>
        <input name="company" defaultValue={company ?? ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Descripción</span>
        <input name="description" defaultValue={description ?? ""} placeholder="Ej. Productora audiovisual" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Notas internas</span>
        <textarea name="notes" defaultValue={notes ?? ""} rows={3} placeholder="Contactos, condiciones, recordatorios…" className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        {msg ? (
          <span className={msg.ok ? "inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400" : "text-xs text-destructive"}>
            {msg.ok ? <Check className="size-3.5" /> : null}
            {msg.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
