"use client";

import * as React from "react";
import { Copy, Check, Loader2 } from "lucide-react";
import { preApproveReview } from "./actions";

// Panel COMPARTIDO de PRE-APROBACIÓN (usuario invitado como PUENTE): genera el enlace /review para
// que el CLIENTE FINAL revise y apruebe. Copiar el enlace NO tiene efecto de servidor; un ÚNICO
// botón registra la pre-aprobación (nota interna + aviso al equipo, y correo si hay destinatario) y
// queda deshabilitado tras registrar → no duplica notas/avisos. Lo usan la sala de video
// (InvitedActions) y las galerías de fotografía (PhotoDecision).
export function PreApprovePanel({
  token,
  reviewLink,
  emailEnabled,
}: {
  token: string;
  reviewLink: string;
  emailEnabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [to, setTo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [recorded, setRecorded] = React.useState(false);
  const [preBusy, startPre] = React.useTransition();
  const [preMsg, setPreMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const record = (withEmail: boolean) => {
    startPre(async () => {
      const fd = new FormData();
      if (withEmail) {
        fd.set("to", to.trim());
        if (note.trim()) fd.set("note", note.trim());
      }
      const r = await preApproveReview(token, fd);
      if (r.ok) {
        setRecorded(true);
        setPreMsg({ ok: true, text: withEmail ? "Pre-aprobado y enviado al cliente final." : "Pre-aprobado. Comparte el enlace con el cliente final." });
      } else {
        setPreMsg({ ok: false, text: r.error || "No se pudo pre-aprobar. Inténtalo de nuevo." });
      }
    });
  };

  // Copiar NO registra nada: la pre-aprobación se registra UNA sola vez con el botón «Pre-aprobar».
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(reviewLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* sin portapapeles */ }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
      >
        Pre-aprobar y enviar al cliente final
      </button>

      {open ? (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            Al pre-aprobar generas un enlace para que el <b>cliente final</b> revise y apruebe. Cópialo y compártelo, o envíalo por correo.
          </p>
          <div className="flex items-center gap-2">
            <input readOnly value={reviewLink} className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none" />
            <button type="button" onClick={copyLink} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">
              {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />} {copied ? "Copiado" : "Copiar enlace"}
            </button>
          </div>
          {emailEnabled ? (
            <div className="space-y-2">
              <input type="email" value={to} onChange={(e) => setTo(e.target.value)} disabled={recorded} placeholder="Correo del cliente final (opcional)" className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60" />
              <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={recorded} rows={2} placeholder="Mensaje para el cliente final (opcional)" className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60" />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">El correo no está configurado: copia el enlace y compártelo tú.</p>
          )}
          <button
            type="button"
            onClick={() => record(!!to.trim())}
            disabled={preBusy || recorded}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {preBusy ? <Loader2 className="size-4 animate-spin" /> : recorded ? <Check className="size-4" /> : null}
            {recorded ? "Pre-aprobado" : to.trim() ? "Pre-aprobar y enviar por correo" : "Pre-aprobar"}
          </button>
          {preMsg ? (
            <p className={`text-xs ${preMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{preMsg.text}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
