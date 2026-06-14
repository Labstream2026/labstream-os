"use client";

import * as React from "react";
import { Mail, CalendarDays, Sparkles, FileEdit, Loader2 } from "lucide-react";
import { sendTestEmail } from "./actions";

function StatusRow({
  icon,
  label,
  on,
  detail,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <span
        className={
          "rounded-full px-2.5 py-1 text-xs font-medium " +
          (on
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            : "bg-muted text-muted-foreground")
        }
      >
        {on ? "Activo" : "Sin configurar"}
      </span>
      {children}
    </div>
  );
}

export function IntegrationsPanel({
  email,
  caldav,
  ai,
  onlyoffice,
}: {
  email: boolean;
  caldav: boolean;
  ai: boolean;
  onlyoffice: boolean;
}) {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <StatusRow icon={<Mail className="size-4" />} label="Correo (Synology MailPlus)" on={email} detail="Envío de correos a clientes y enlaces de revisión.">
        {email ? (
          <button
            onClick={() => {
              setMsg(null);
              start(async () => {
                const r = await sendTestEmail();
                setMsg(r.ok ? "✓ Correo enviado a tu buzón" : `⚠️ ${r.error}`);
              });
            }}
            disabled={pending}
            className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} Enviar prueba
          </button>
        ) : null}
      </StatusRow>
      {msg ? <p className="px-4 pb-2 text-xs text-muted-foreground">{msg}</p> : null}
      <StatusRow icon={<CalendarDays className="size-4" />} label="Calendario (Synology CalDAV)" on={caldav} detail="Sincroniza las citas internas del equipo al Synology Calendar." />
      <StatusRow icon={<Sparkles className="size-4" />} label="Asistente IA (Claude)" on={ai} detail="Copiloto para correos, resúmenes e ideas." />
      <StatusRow icon={<FileEdit className="size-4" />} label="Edición de documentos (OnlyOffice)" on={onlyoffice} detail="Editar Word/Excel/PPT del chat y los proyectos." />
    </div>
  );
}
