"use client";

import * as React from "react";
import { CalendarPlus, Check, Copy, Link2, Loader2, RefreshCw, PowerOff } from "lucide-react";
import { getCalendarFeedToken, rotateCalendarFeedToken, disableCalendarFeed } from "./calendar-actions";

// Suscribir el calendario personal de Labstream en Google/Apple/Outlook mediante un enlace webcal
// de SOLO LECTURA (token secreto). Se actualiza solo, sin contraseñas. Rotar el enlace lo revoca.
// baseUrl viene del servidor (NEXTAUTH_URL) para que el enlace sea correcto también sin JS y sin
// discrepancias de hidratación; si está vacío (dev), cae a window.location.origin.
export function CalendarSubscribe({ initialToken, baseUrl = "" }: { initialToken: string | null; baseUrl?: string }) {
  const [token, setToken] = React.useState<string | null>(initialToken);
  const [pending, start] = React.useTransition();
  const [copied, setCopied] = React.useState(false);

  const origin = (baseUrl || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  // La URL lleva «.ics» para que los clientes que exigen extensión la acepten.
  const httpsUrl = token && origin ? `${origin}/api/calendar/feed/${token}.ics` : "";
  const webcalUrl = httpsUrl.replace(/^https?:/i, "webcal:");
  const googleUrl = webcalUrl ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}` : "";
  const outlookUrl = httpsUrl ? `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(httpsUrl)}&name=${encodeURIComponent("Labstream")}` : "";

  const copy = async () => {
    if (!httpsUrl) return;
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* el usuario puede seleccionar el texto manualmente */ }
  };

  const generate = () => start(async () => { const r = await getCalendarFeedToken(); if (r.ok) setToken(r.token ?? null); });
  const rotate = () => start(async () => { const r = await rotateCalendarFeedToken(); if (r.ok) setToken(r.token ?? null); });
  const disable = () => start(async () => { const r = await disableCalendarFeed(); if (r.ok) setToken(null); });

  const link = "inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent";

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Suscribir mi calendario en Google, Apple u Outlook</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Un enlace privado y de solo lectura con tus citas, entregas y rodajes. Los calendarios que lo
        sigan se actualizan solos, sin contraseñas. Si compartes el enlace por error, puedes rotarlo.
      </p>

      <div className="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        {!token ? (
          <button
            onClick={generate}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />} Generar mi enlace de suscripción
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={httpsUrl}>{httpsUrl || "…"}</span>
              <button onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-muted">
                {copied ? <><Check className="size-3.5 text-emerald-500" /> Copiado</> : <><Copy className="size-3.5" /> Copiar</>}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <a href={googleUrl} target="_blank" rel="noopener noreferrer" className={link}>Añadir a Google</a>
              <a href={webcalUrl} className={link}>Añadir a Apple</a>
              <a href={outlookUrl} target="_blank" rel="noopener noreferrer" className={link}>Añadir a Outlook</a>
            </div>

            <p className="text-[11px] text-muted-foreground">
              En Apple/otros: pega el enlace en «Suscribirse a un calendario». Google y Apple refrescan
              cada varias horas (no es instantáneo). Para cambios inmediatos usa «Añadir a mi calendario»
              en cada cita.
            </p>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button onClick={rotate} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Rotar enlace
              </button>
              <button onClick={disable} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">
                <PowerOff className="size-4" /> Apagar feed
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
