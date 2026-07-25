"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendProjectLinkWhatsapp, type WhatsappLinkKind } from "./whatsapp-actions";

// Botón + mini formulario para mandarle al cliente el enlace (portadas o entrega) por WhatsApp
// desde la misma instancia de Evolution API que usa Marcebot. Si el canal no está configurado
// en el servidor, cae al enlace wa.me de siempre (abre WhatsApp con el mensaje escrito).

export function WhatsappSend({
  projectId,
  kind,
  enabled,
  suggestedPhone = "",
  fallbackText,
}: {
  projectId: string;
  kind: WhatsappLinkKind;
  enabled: boolean; // el canal está configurado en el servidor
  suggestedPhone?: string;
  fallbackText?: string; // mensaje para wa.me cuando no hay canal
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [phone, setPhone] = React.useState(suggestedPhone);
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);

  if (!enabled) {
    return fallbackText ? (
      <a
        href={`https://wa.me/${suggestedPhone ? suggestedPhone : ""}?text=${encodeURIComponent(fallbackText)}`}
        target="_blank"
        rel="noreferrer"
        title="Abrir WhatsApp con el mensaje listo"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
      >
        <MessageCircle className="size-3.5" /> WhatsApp
      </a>
    ) : null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent",
          open ? "border-primary/50 text-primary" : "border-border",
        )}
      >
        <MessageCircle className="size-3.5" /> Enviar por WhatsApp
      </button>
      {open ? (
        <form
          className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData();
            fd.set("phone", phone);
            fd.set("note", note);
            startTransition(async () => {
              const r = await sendProjectLinkWhatsapp(projectId, kind, fd);
              setResult(r.ok ? { ok: true, text: "✓ Enviado por WhatsApp." } : { ok: false, text: r.error ?? "No se pudo enviar." });
              if (r.ok) {
                setNote("");
                setOpen(false);
              }
              router.refresh();
            });
          }}
        >
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            placeholder="300 123 4567"
            inputMode="tel"
            aria-label="WhatsApp del cliente"
            className="w-44 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Mensaje extra (opcional)…"
            className="min-w-44 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={pending || !phone.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Enviar
          </button>
          <p className="w-full text-[11px] text-muted-foreground">Sale desde el WhatsApp del estudio (el que está emparejado por QR). Si no lleva indicativo, se asume Colombia.</p>
        </form>
      ) : null}
      {result ? (
        <p className={cn("w-full text-xs", result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>{result.text}</p>
      ) : null}
    </>
  );
}
