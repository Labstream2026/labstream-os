"use client";

import * as React from "react";
import { Mail, Loader2 } from "lucide-react";
import { emailReviewLink } from "./client-actions";

export function EmailReviewButton({ deliverableId }: { deliverableId: string }) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);

  function submit(formData: FormData) {
    setMsg(null);
    start(async () => {
      const r = await emailReviewLink(deliverableId, formData);
      setMsg(r.ok ? "✓ Enviado al cliente" : `⚠️ ${r.error ?? "No se pudo enviar"}`);
      if (r.ok) setOpen(false);
    });
  }

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
      >
        <Mail className="size-3.5" /> Enviar al cliente
      </button>
      {open ? (
        <form
          action={submit}
          className="absolute left-0 z-10 mt-1 w-64 space-y-2 rounded-lg border border-border bg-popover p-2 shadow-lg"
        >
          <input
            name="to"
            type="email"
            required
            placeholder="correo@cliente.com"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            name="note"
            placeholder="Mensaje (opcional)"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            disabled={pending}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} Enviar enlace de revisión
          </button>
        </form>
      ) : null}
      {msg ? <span className="ml-2 text-xs text-muted-foreground">{msg}</span> : null}
    </span>
  );
}
