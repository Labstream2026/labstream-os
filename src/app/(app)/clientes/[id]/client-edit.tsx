"use client";

import * as React from "react";
import { Check, Lock } from "lucide-react";
import { EmojiSelect } from "@/components/emoji-select";
import { updateClient } from "../actions";

// Ficha editable del cliente (Ajustes → Información). El botón de guardar solo se activa
// cuando algo cambió (estado «sucio»): evita clics inútiles y hace visible que hay cambios
// pendientes antes de salir de la página.
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
  const [dirty, setDirty] = React.useState(false);
  const [descLen, setDescLen] = React.useState((description ?? "").length);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    start(async () => {
      const r = await updateClient(clientId, fd);
      if (r.ok) setDirty(false);
      setMsg(r.ok ? { ok: true, text: "Guardado." } : { ok: false, text: r.error ?? "No se pudo guardar." });
    });
  }

  return (
    <form onSubmit={onSubmit} onChange={() => setDirty(true)} className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Información del cliente</h3>
        {dirty && !pending ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Cambios sin guardar</span>
        ) : null}
      </div>
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
        <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Descripción</span>
          <span className={`font-normal tabular-nums ${descLen > 260 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/60"}`}>{descLen}/280</span>
        </span>
        <input
          name="description"
          defaultValue={description ?? ""}
          maxLength={280}
          onChange={(e) => setDescLen(e.target.value.length)}
          placeholder="Ej. Productora audiovisual"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Notas internas</span>
          <span className="inline-flex items-center gap-1 font-normal text-muted-foreground/60"><Lock className="size-3" /> Solo las ve el equipo</span>
        </span>
        <textarea name="notes" defaultValue={notes ?? ""} rows={3} placeholder="Contactos, condiciones, recordatorios…" className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !dirty} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
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
