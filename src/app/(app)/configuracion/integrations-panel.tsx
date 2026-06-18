"use client";

import * as React from "react";
import { Mail, CalendarDays, Sparkles, FileEdit, Loader2, Settings2 } from "lucide-react";
import { sendTestEmail, testCalendar, saveMailSettings } from "./actions";

export type MailSettingsView = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromName: string;
  fromEmail: string;
  rejectUnauthorized: boolean;
  hasPassword: boolean;
};

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
  mailSettings,
}: {
  email: boolean;
  caldav: boolean;
  ai: boolean;
  onlyoffice: boolean;
  mailSettings: MailSettingsView;
}) {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [calMsg, setCalMsg] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <StatusRow icon={<Mail className="size-4" />} label="Correo (Synology MailPlus)" on={email} detail="Envío de correos a clientes y notificaciones del equipo.">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
        >
          <Settings2 className="size-3.5" /> {showForm ? "Cerrar" : "Configurar"}
        </button>
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
      {showForm ? <MailSettingsForm initial={mailSettings} onSaved={(m) => setMsg(m)} /> : null}
      <StatusRow icon={<CalendarDays className="size-4" />} label="Calendario (Synology CalDAV)" on={caldav} detail="Sincroniza las citas internas del equipo al Synology Calendar.">
        {caldav ? (
          <button
            onClick={() => {
              setCalMsg(null);
              start(async () => {
                const r = await testCalendar();
                setCalMsg(r.ok ? "✓ Conexión CalDAV correcta" : `⚠️ ${r.error}`);
              });
            }}
            disabled={pending}
            className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarDays className="size-3.5" />} Probar
          </button>
        ) : null}
      </StatusRow>
      {calMsg ? <p className="px-4 pb-2 text-xs text-muted-foreground">{calMsg}</p> : null}
      <StatusRow icon={<Sparkles className="size-4" />} label="Asistente IA (Claude)" on={ai} detail="Copiloto para correos, resúmenes e ideas." />
      <StatusRow icon={<FileEdit className="size-4" />} label="Edición de documentos (OnlyOffice)" on={onlyoffice} detail="Editar Word/Excel/PPT del chat y los proyectos." />
    </div>
  );
}

// Formulario de configuración SMTP (Synology MailPlus). La contraseña no se precarga:
// si se deja vacía, se conserva la guardada. Al guardar, el correo queda activo sin
// redeploy (la app lo lee de la BD con prioridad sobre el .env).
function MailSettingsForm({ initial, onSaved }: { initial: MailSettingsView; onSaved: (msg: string) => void }) {
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<string | null>(null);
  const labelCls = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";
  const inputCls = "rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

  return (
    <form
      action={(fd) => {
        setResult(null);
        start(async () => {
          const r = await saveMailSettings(fd);
          if (r.ok) { setResult("✓ Configuración guardada"); onSaved("✓ Configuración de correo guardada. Prueba el envío."); }
          else setResult(`⚠️ ${r.error}`);
        });
      }}
      className="space-y-3 bg-muted/30 p-4"
    >
      <p className="text-xs text-muted-foreground">
        Datos de tu buzón de Synology MailPlus. La contraseña se guarda cifrada. <strong>Ojo:</strong> el servidor no puede ser <code>localhost</code> (dentro de Docker es el propio contenedor) — usa la IP LAN del NAS.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls + " sm:col-span-2"}>
          Servidor (host)
          <input name="host" defaultValue={initial.host} placeholder="192.168.1.10  ·  o  host.docker.internal" className={inputCls} />
        </label>
        <label className={labelCls}>
          Puerto
          <input name="port" type="number" defaultValue={initial.port} className={inputCls} />
        </label>
        <label className="flex items-center gap-2 self-end pb-1.5 text-xs font-medium">
          <input name="secure" type="checkbox" defaultChecked={initial.secure} className="size-4" /> SSL (puerto 465)
        </label>
        <label className={labelCls}>
          Usuario (correo emisor)
          <input name="username" defaultValue={initial.username} placeholder="notificaciones@labstreamsas.com" className={inputCls} />
        </label>
        <label className={labelCls}>
          Contraseña {initial.hasPassword ? <span className="font-normal">(guardada · escribe para cambiarla)</span> : null}
          <input name="password" type="password" placeholder={initial.hasPassword ? "•••••••• (sin cambios)" : "contraseña del buzón"} className={inputCls} autoComplete="new-password" />
        </label>
        <label className={labelCls}>
          Nombre del remitente
          <input name="fromName" defaultValue={initial.fromName} placeholder="Labstream OS" className={inputCls} />
        </label>
        <label className={labelCls}>
          Correo del remitente (opcional)
          <input name="fromEmail" defaultValue={initial.fromEmail} placeholder="igual que el usuario si lo dejas vacío" className={inputCls} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs font-medium">
          <input name="enabled" type="checkbox" defaultChecked={initial.enabled} className="size-4" /> Activar envío de correo
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <input name="rejectUnauthorized" type="checkbox" defaultChecked={initial.rejectUnauthorized} className="size-4" /> Exigir certificado válido (desactívalo si MailPlus usa certificado autofirmado)
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null} Guardar configuración
        </button>
        {result ? <span className="text-xs text-muted-foreground">{result}</span> : null}
      </div>
    </form>
  );
}
