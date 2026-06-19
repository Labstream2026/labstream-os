"use client";

import * as React from "react";
import { CalendarDays, Loader2, RefreshCw, Unplug, CheckCircle2, AlertTriangle } from "lucide-react";
import { connectCalendar, selectCalendar, disconnectCalendar, syncCalendarNow, type CalendarConnResult } from "./calendar-actions";

type Conn = {
  serverUrl: string;
  username: string;
  calendarUrl: string | null;
  calendarName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
} | null;

type Calendar = { url: string; name: string };

export function CalendarConnect({ email, connection }: { email: string; connection: Conn }) {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [calendars, setCalendars] = React.useState<Calendar[]>([]);
  const [connected, setConnected] = React.useState(Boolean(connection?.calendarUrl));
  const [calName, setCalName] = React.useState(connection?.calendarName ?? null);

  const flash = (r: CalendarConnResult, okMsg: string) => {
    if (r.ok) { setMsg(okMsg); setErr(null); }
    else { setErr(r.error ?? "Error"); setMsg(null); }
  };
  // Envuelve una acción para que un rechazo del servidor NUNCA tumbe la ruta (error boundary):
  // se muestra el error en el panel y la página sigue viva.
  const runSafe = (fn: () => Promise<void>) =>
    start(async () => {
      try { await fn(); } catch { setErr("Algo falló en la solicitud. Revisa la conexión e inténtalo de nuevo."); setMsg(null); }
    });

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Sincronizar con Synology Calendar</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Conecta tu calendario del NAS para que tus citas se sincronicen en ambos sentidos: lo que crees
        aquí aparece en tu Synology Calendar y viceversa.
      </p>

      <div className="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        {connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-500" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Conectado{calName ? ` · ${calName}` : ""}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {connection?.username} · {connection?.serverUrl}
                  {connection?.lastSyncAt ? ` · última sync ${new Date(connection.lastSyncAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}` : ""}
                </p>
              </div>
            </div>
            {connection?.lastError ? (
              <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Último error: {connection.lastError}
              </p>
            ) : null}

            {calendars.length > 1 ? (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Calendario destino</label>
                <select
                  defaultValue={connection?.calendarUrl ?? ""}
                  onChange={(e) => {
                    const url = e.target.value;
                    const name = calendars.find((c) => c.url === url)?.name ?? "";
                    runSafe(async () => { const r = await selectCalendar(url, name); flash(r, "Calendario actualizado"); if (r.ok) setCalName(name); });
                  }}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {calendars.map((c) => <option key={c.url} value={c.url}>{c.name}</option>)}
                </select>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => runSafe(async () => {
                  const r = await syncCalendarNow();
                  if (r.ok) { setMsg(`Sincronizado · ${r.imported ?? 0} nuevos, ${r.updated ?? 0} actualizados, ${r.deleted ?? 0} borrados`); setErr(null); }
                  else { setErr(r.error ?? "Error"); setMsg(null); }
                })}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sincronizar ahora
              </button>
              <button
                onClick={() => start(async () => { const r = await disconnectCalendar(); flash(r, "Desconectado"); if (r.ok) { setConnected(false); setCalendars([]); } })}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Unplug className="size-4" /> Desconectar
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              start(async () => {
                try {
                  const r = await connectCalendar(fd);
                  flash(r, "¡Conectado!");
                  if (r.ok) { setConnected(true); setCalendars(r.calendars ?? []); setCalName((r.calendars ?? []).find((c) => c.url === r.selected)?.name ?? null); }
                } catch {
                  setErr("No se pudo conectar (la solicitud falló o tardó demasiado). Revisa la URL del NAS y que sea alcanzable.");
                  setMsg(null);
                }
              });
            }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-muted-foreground" /> Conectar mi Synology Calendar</div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">URL del NAS (CalDAV)</label>
              <input name="serverUrl" required placeholder="https://192.168.0.22/caldav/" defaultValue="https://" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <p className="mt-1 text-[11px] text-muted-foreground">Usa la <strong>IP local</strong> del NAS y la ruta <code>/caldav/</code> (ej. <code>https://192.168.0.22/caldav/</code>). El dominio público no funciona desde dentro del NAS.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Usuario DSM</label>
                <input name="username" required defaultValue={email.split("@")[0]} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Contraseña de aplicación</label>
                <input name="password" type="password" required autoComplete="off" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Usa una <strong>contraseña de aplicación</strong> de DSM (Panel de control → Usuario → Cuenta → contraseñas de aplicación),
              no tu contraseña principal. Se guarda <strong>cifrada</strong> en el servidor.
            </p>
            <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CalendarDays className="size-4" />} Conectar
            </button>
          </form>
        )}

        {msg ? <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">✓ {msg}</p> : null}
        {err ? <p className="mt-3 text-xs text-destructive">⚠️ {err}</p> : null}
      </div>
    </section>
  );
}
