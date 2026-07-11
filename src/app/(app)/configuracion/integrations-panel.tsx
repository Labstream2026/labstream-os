"use client";

import * as React from "react";
import { Mail, CalendarDays, Sparkles, FileEdit, Loader2, Settings2, Bot } from "lucide-react";
import { sendTestEmail, saveMailSettings, syncAllCalendarsNow, saveOpenClawSettings, testOpenClaw, saveOnlyOfficeSettings, testOnlyOffice } from "./actions";
import { CalendarConnect } from "@/app/(app)/perfil/calendar-connect";
import { CalendarSubscribe } from "@/app/(app)/perfil/calendar-subscribe";
import { formatBogota } from "@/lib/bogota-time";

export type CalTeamRow = { name: string; calendarName: string | null; lastSyncAt: string | null; lastError: string | null };
type MyCalConn = { serverUrl: string; username: string; calendarUrl: string | null; calendarName: string | null; lastSyncAt: string | null; lastError: string | null } | null;

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

export type OpenClawSettingsView = {
  enabled: boolean;
  baseUrl: string;
  agentModel: string;
  hasToken: boolean;
};

export type OnlyOfficeSettingsView = {
  docsUrl: string;
  callbackBase: string;
  internalUrl: string;
  hasSecret: boolean;
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
  onlyofficeSettings,
  mailSettings,
  openclawOn,
  openclawSettings,
  calendarTeam = [],
  calendarTotal = 0,
  myEmail = "",
  myCalendarConnection = null,
  feedToken = null,
  feedBaseUrl = "",
}: {
  email: boolean;
  caldav: boolean;
  ai: boolean;
  onlyoffice: boolean;
  onlyofficeSettings: OnlyOfficeSettingsView;
  mailSettings: MailSettingsView;
  openclawOn: boolean;
  openclawSettings: OpenClawSettingsView;
  calendarTeam?: CalTeamRow[];
  calendarTotal?: number;
  myEmail?: string;
  myCalendarConnection?: MyCalConn;
  feedToken?: string | null;
  feedBaseUrl?: string;
}) {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [calMsg, setCalMsg] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [ocPending, startOc] = React.useTransition();
  const [ocMsg, setOcMsg] = React.useState<string | null>(null);
  const [showOc, setShowOc] = React.useState(false);
  const [ooPending, startOo] = React.useTransition();
  const [ooMsg, setOoMsg] = React.useState<string | null>(null);
  const [showOo, setShowOo] = React.useState(false);

  return (
    <>
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
      <StatusRow icon={<CalendarDays className="size-4" />} label="Calendario (Synology CalDAV)" on={calendarTeam.length > 0} detail={`${calendarTeam.length} de ${calendarTotal} del equipo con su calendario conectado. Cada quien conecta el suyo en «Mi perfil».`}>
        <button
          onClick={() => {
            setCalMsg(null);
            start(async () => {
              const r = await syncAllCalendarsNow();
              setCalMsg(r.ok ? `✓ Sincronizado · ${r.users ?? 0} usuarios · ${r.imported ?? 0} nuevos, ${r.updated ?? 0} actualizados, ${r.deleted ?? 0} borrados` : `⚠️ ${r.error}`);
            });
          }}
          disabled={pending}
          className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarDays className="size-3.5" />} Sincronizar todo
        </button>
      </StatusRow>
      {calendarTeam.length > 0 ? (
        <div className="px-4 pb-3">
          <div className="overflow-hidden rounded-lg border border-border">
            {calendarTeam.map((c, i) => (
              <div key={c.name} className={"flex items-center gap-2 px-3 py-1.5 text-xs " + (i ? "border-t border-border" : "")}>
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                {c.calendarName ? <span className="truncate text-muted-foreground">{c.calendarName}</span> : null}
                <span className="shrink-0 text-muted-foreground">
                  {c.lastError ? <span className="text-rose-600 dark:text-rose-400">⚠ {c.lastError.slice(0, 40)}</span>
                    : c.lastSyncAt ? `sync ${formatBogota(c.lastSyncAt, { dateStyle: "short", timeStyle: "short" })}`
                    : "sin sincronizar aún"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {calMsg ? <p className="px-4 pb-2 text-xs text-muted-foreground">{calMsg}</p> : null}
      <StatusRow icon={<Sparkles className="size-4" />} label="Asistente IA (Claude)" on={ai} detail="Copiloto para correos, resúmenes e ideas." />
      <StatusRow icon={<FileEdit className="size-4" />} label="Edición de documentos (OnlyOffice)" on={onlyoffice} detail="Editar Word/Excel/PPT del chat y los proyectos, en colaboración y con guardado automático.">
        <button
          onClick={() => setShowOo((v) => !v)}
          className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
        >
          <Settings2 className="size-3.5" /> {showOo ? "Cerrar" : "Configurar"}
        </button>
        {onlyoffice ? (
          <button
            onClick={() => {
              setOoMsg(null);
              startOo(async () => {
                const r = await testOnlyOffice();
                setOoMsg(r.ok ? "✓ Document Server conectado." : `⚠️ ${r.error}`);
              });
            }}
            disabled={ooPending}
            className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {ooPending ? <Loader2 className="size-3.5 animate-spin" /> : <FileEdit className="size-3.5" />} Probar
          </button>
        ) : null}
      </StatusRow>
      {ooMsg ? <p className="px-4 pb-2 text-xs text-muted-foreground">{ooMsg}</p> : null}
      {showOo ? <OnlyOfficeForm initial={onlyofficeSettings} onSaved={(m) => setOoMsg(m)} /> : null}
      <StatusRow icon={<Bot className="size-4" />} label="Agente IA en el chat (OpenClaw)" on={openclawOn} detail="Tu agente OpenClaw responde en cualquier chat cuando lo etiquetan con @Marcebot.">
        <button
          onClick={() => setShowOc((v) => !v)}
          className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
        >
          <Settings2 className="size-3.5" /> {showOc ? "Cerrar" : "Configurar"}
        </button>
        {openclawOn ? (
          <button
            onClick={() => {
              setOcMsg(null);
              startOc(async () => {
                const r = await testOpenClaw();
                setOcMsg(r.ok ? `✓ Respondió: ${r.reply}` : `⚠️ ${r.error}`);
              });
            }}
            disabled={ocPending}
            className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {ocPending ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />} Probar
          </button>
        ) : null}
      </StatusRow>
      {ocMsg ? <p className="px-4 pb-2 text-xs text-muted-foreground">{ocMsg}</p> : null}
      {showOc ? <OpenClawForm initial={openclawSettings} onSaved={(m) => setOcMsg(m)} /> : null}
    </div>
    {/* Conexión personal del calendario (cada quien la suya; también disponible en Mi perfil). */}
    <CalendarConnect email={myEmail} connection={myCalendarConnection} />
    {/* Suscripción del calendario personal en Google/Apple/Outlook (feed webcal de solo lectura). */}
    <CalendarSubscribe initialToken={feedToken} baseUrl={feedBaseUrl} />
    </>
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

// Formulario de conexión con el Document Server de OnlyOffice. El secreto no se precarga: si
// se deja vacío, se conserva el guardado. Al activarlo, los Word/Excel/PPT se editan en línea.
function OnlyOfficeForm({ initial, onSaved }: { initial: OnlyOfficeSettingsView; onSaved: (msg: string) => void }) {
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<string | null>(null);
  const labelCls = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";
  const inputCls = "rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

  return (
    <form
      action={(fd) => {
        setResult(null);
        start(async () => {
          const r = await saveOnlyOfficeSettings(fd);
          if (r.ok) { setResult("✓ Conexión guardada"); onSaved("✓ Conexión con OnlyOffice guardada. Pruébala con «Probar»."); }
          else setResult(`⚠️ ${r.error}`);
        });
      }}
      className="space-y-3 bg-muted/30 p-4"
    >
      <p className="text-xs text-muted-foreground">
        Datos del Document Server de OnlyOffice. El secreto JWT se guarda cifrado y debe ser <strong>idéntico</strong> al del Document Server. <strong>Ojo con las redes:</strong> la app y OnlyOffice están en contenedores distintos, así que las direcciones internas usan la IP LAN del NAS, no el dominio público.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls + " sm:col-span-2"}>
          URL pública del Document Server <span className="font-normal">(la que abre el navegador)</span>
          <input name="docsUrl" defaultValue={initial.docsUrl} placeholder="https://docs.labstreamsas.com" className={inputCls} />
        </label>
        <label className={labelCls}>
          Secreto JWT {initial.hasSecret ? <span className="font-normal">(guardado · escribe para cambiarlo)</span> : null}
          <input name="jwtSecret" type="password" placeholder={initial.hasSecret ? "•••••••• (sin cambios)" : "secreto del Document Server"} className={inputCls} autoComplete="new-password" />
        </label>
        <label className={labelCls}>
          URL de la app vista desde OnlyOffice <span className="font-normal">(callback)</span>
          <input name="callbackBase" defaultValue={initial.callbackBase} placeholder="http://192.168.0.22:3100" className={inputCls} />
        </label>
        <label className={labelCls + " sm:col-span-2"}>
          URL interna del Document Server <span className="font-normal">(la app baja el doc guardado de aquí)</span>
          <input name="internalUrl" defaultValue={initial.internalUrl} placeholder="http://192.168.0.22:8088" className={inputCls} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs font-medium">
        <input name="enabled" type="checkbox" defaultChecked={initial.docsUrl !== ""} className="size-4" /> Activar la edición de documentos
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null} Guardar conexión
        </button>
        {result ? <span className="text-xs text-muted-foreground">{result}</span> : null}
      </div>
    </form>
  );
}

// Formulario de conexión con el agente OpenClaw. El token no se precarga: si se deja vacío,
// se conserva el guardado. Al activarlo, el agente responde en el chat al etiquetarlo.
function OpenClawForm({ initial, onSaved }: { initial: OpenClawSettingsView; onSaved: (msg: string) => void }) {
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<string | null>(null);
  const labelCls = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";
  const inputCls = "rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

  return (
    <form
      action={(fd) => {
        setResult(null);
        start(async () => {
          const r = await saveOpenClawSettings(fd);
          if (r.ok) { setResult("✓ Conexión guardada"); onSaved("✓ Conexión con el agente guardada. Pruébala con «Probar»."); }
          else setResult(`⚠️ ${r.error}`);
        });
      }}
      className="space-y-3 bg-muted/30 p-4"
    >
      <p className="text-xs text-muted-foreground">
        Datos del gateway de tu agente OpenClaw (en el PC de la LAN del NAS). El token se guarda cifrado. <strong>Ojo:</strong> la URL debe ser alcanzable desde el contenedor del NAS — usa la IP LAN del PC, p. ej. <code>http://192.168.0.4:18789</code>.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls + " sm:col-span-2"}>
          URL del gateway
          <input name="baseUrl" defaultValue={initial.baseUrl} placeholder="http://192.168.0.4:18789" className={inputCls} />
        </label>
        <label className={labelCls}>
          Token {initial.hasToken ? <span className="font-normal">(guardado · escribe para cambiarlo)</span> : null}
          <input name="token" type="password" placeholder={initial.hasToken ? "•••••••• (sin cambios)" : "token Bearer del gateway"} className={inputCls} autoComplete="new-password" />
        </label>
        <label className={labelCls}>
          Agente / modelo
          <input name="agentModel" defaultValue={initial.agentModel} placeholder="openclaw" className={inputCls} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs font-medium">
        <input name="enabled" type="checkbox" defaultChecked={initial.enabled} className="size-4" /> Activar el agente en el chat (responde al etiquetarlo con @Marcebot)
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null} Guardar conexión
        </button>
        {result ? <span className="text-xs text-muted-foreground">{result}</span> : null}
      </div>
    </form>
  );
}
