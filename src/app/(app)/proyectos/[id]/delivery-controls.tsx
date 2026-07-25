"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Mail, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsappSend } from "./whatsapp-send";
import {
  createProjectDeliveryLink,
  emailProjectDeliveryLink,
  revokeProjectDeliveryLink,
  setDeliveryExpiry,
  toggleDeliveryExcluded,
} from "./delivery-actions";

// Controles interactivos del paquete de entrega (la parte con estado del panel: generar/copiar/
// vigencia/revocar). Los datos y las estadísticas los renderiza el servidor (delivery-section).

const DAY_CHOICES: { label: string; days: number | null }[] = [
  { label: "30 días", days: 30 },
  { label: "60 días", days: 60 },
  { label: "90 días", days: 90 },
  { label: "Sin límite", days: null },
];

const chipCls = (on: boolean) =>
  cn(
    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
    on ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
  );

export function DeliveryControls({
  projectId,
  projectName,
  canManage,
  active,
  url,
  expiresLabel,
  emailEnabled = false,
  suggestedEmails = "",
  whatsappEnabled = false,
  clientPhone = "",
}: {
  projectId: string;
  projectName: string;
  canManage: boolean;
  active: boolean;
  url: string | null;
  expiresLabel: string | null; // «hasta el 24 ago (quedan 30 días)» | null = sin límite
  emailEnabled?: boolean;
  suggestedEmails?: string; // correos de los contactos del cliente, para prellenar
  whatsappEnabled?: boolean;
  clientPhone?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [days, setDays] = React.useState<number | null>(60);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dateOpen, setDateOpen] = React.useState(false);
  const [date, setDate] = React.useState("");
  const [mailOpen, setMailOpen] = React.useState(false);
  const [mailTo, setMailTo] = React.useState(suggestedEmails);
  const [mailNote, setMailNote] = React.useState("");
  const [mailSent, setMailSent] = React.useState(false);

  const waText = url
    ? `Tu material de «${projectName}» está listo para descargar 🎬 ${url}${expiresLabel ? ` (disponible ${expiresLabel})` : ""}`
    : "";

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "No se pudo.");
      router.refresh();
    });

  if (!active) {
    if (!canManage)
      return <p className="text-sm text-muted-foreground">Aún no hay enlace de entrega. Quien gestiona el proyecto puede generarlo aquí.</p>;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Vigencia:</span>
        {DAY_CHOICES.map((c) => (
          <button key={c.label} type="button" onClick={() => setDays(c.days)} className={chipCls(days === c.days)}>
            {c.label}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => createProjectDeliveryLink(projectId, { days }))}
          className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? "Generando…" : "Generar enlace de entrega"}
        </button>
        {error ? <p className="w-full text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url ?? ""}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-input bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground outline-none"
          aria-label="Enlace de entrega"
        />
        <button
          type="button"
          onClick={async () => {
            if (!url) return;
            await navigator.clipboard.writeText(url).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
        {canManage && emailEnabled ? (
          <button
            type="button"
            onClick={() => setMailOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent",
              mailOpen ? "border-primary/50 text-primary" : "border-border",
            )}
          >
            <Mail className="size-3.5" /> Enviar por correo
          </button>
        ) : null}
        {url ? (
          <WhatsappSend
            projectId={projectId}
            kind="entrega"
            enabled={whatsappEnabled}
            suggestedPhone={clientPhone}
            fallbackText={waText}
          />
        ) : null}
        {canManage ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm("¿Revocar el enlace de entrega? La URL que ya circula quedará muerta para siempre.")) {
                run(() => revokeProjectDeliveryLink(projectId));
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            <ShieldOff className="size-3.5" /> Revocar
          </button>
        ) : null}
      </div>

      {mailOpen ? (
        <form
          className="space-y-2 rounded-lg border border-border bg-muted/30 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData();
            fd.set("to", mailTo);
            fd.set("note", mailNote);
            startTransition(async () => {
              setError(null);
              setMailSent(false);
              const r = await emailProjectDeliveryLink(projectId, fd);
              if (!r.ok) setError(r.error ?? "No se pudo enviar.");
              else {
                setMailSent(true);
                setMailNote("");
              }
              router.refresh();
            });
          }}
        >
          <input
            value={mailTo}
            onChange={(e) => setMailTo(e.target.value)}
            placeholder="correo@cliente.com (varios separados por coma)"
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            aria-label="Correos del cliente"
          />
          <textarea
            value={mailNote}
            onChange={(e) => setMailNote(e.target.value)}
            placeholder="Nota opcional para el cliente…"
            rows={2}
            className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            aria-label="Nota opcional"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending || !mailTo.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? "Enviando…" : "Enviar la entrega"}
            </button>
            {mailSent ? <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ Enviada — quedará el recordatorio antes de vencer</span> : null}
          </div>
        </form>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Vigencia · {expiresLabel ?? "sin límite"}:</span>
          {DAY_CHOICES.map((c) => (
            <button
              key={c.label}
              type="button"
              disabled={pending}
              onClick={() => run(() => setDeliveryExpiry(projectId, { days: c.days }))}
              className={chipCls(false)}
              title={c.days ? `Contar ${c.days} días desde hoy` : "Quitar la caducidad"}
            >
              {c.label}
            </button>
          ))}
          {dateOpen ? (
            <span className="inline-flex items-center gap-1.5">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-[11px] outline-none focus:ring-2 focus:ring-ring"
                aria-label="Fecha exacta de vencimiento"
              />
              <button
                type="button"
                disabled={pending || !date}
                onClick={() => {
                  run(() => setDeliveryExpiry(projectId, { date }));
                  setDateOpen(false);
                }}
                className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
              >
                Aplicar
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setDateOpen(true)} className={chipCls(false)}>
              Fecha exacta…
            </button>
          )}
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

// Checkbox de «entra al paquete» por pieza. Excluir es la excepción, no la regla.
export function ExcludeToggle({ deliverableId, excluded, disabled }: { deliverableId: string; excluded: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      title={excluded ? "Excluida del paquete — clic para incluirla" : "Incluida en el paquete — clic para excluirla"}
      onClick={() =>
        startTransition(async () => {
          await toggleDeliveryExcluded(deliverableId);
          router.refresh();
        })
      }
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded border text-[10px] font-bold transition-colors",
        excluded ? "border-border bg-background text-transparent" : "border-primary bg-primary text-primary-foreground",
        (disabled || pending) && "opacity-50",
      )}
    >
      ✓
    </button>
  );
}
