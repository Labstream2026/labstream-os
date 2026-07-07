"use client";

import * as React from "react";
import { FlaskConical, Loader2, Check, Ban } from "lucide-react";
import { provisionDemoUser, deactivateDemoUser, type DemoResult } from "./demo-actions";

// Panel de Configuración → Usuarios: crea/restablece el USUARIO DEMO (solo lectura). Ve toda la
// app sin poder modificar nada del equipo — para probar funciones y detectar roturas sin riesgo.
export function DemoPanel({ exists, active }: { exists: boolean; active: boolean }) {
  const [password, setPassword] = React.useState("");
  const [busy, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const run = (fn: () => Promise<DemoResult>, okText: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Error." });
      if (r.ok) setPassword("");
    });

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FlaskConical className="size-4 text-primary" /> Usuario demo (solo lectura)
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${exists && active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
          {exists ? (active ? "activo" : "desactivado") : "sin crear"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Ve toda la app (proyectos, clientes, calendario, archivos, finanzas, wiki, reportes) pero no puede crear, editar ni borrar nada del equipo.
        Sin chat, sin Marcebot y sin la wiki de contraseñas. Entra en /login con <span className="font-mono">demo@labstream.co</span> y la contraseña que definas.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña del demo (mín. 8)"
          className="min-w-52 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => {
            const fd = new FormData();
            fd.set("password", password);
            run(() => provisionDemoUser(fd), exists ? "Usuario demo restablecido (rol reafirmado a solo-ver y contraseña nueva)." : "Usuario demo creado.");
          }}
          disabled={busy || password.length < 8}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {exists ? "Restablecer demo" : "Crear usuario demo"}
        </button>
        {exists && active ? (
          <button
            type="button"
            onClick={() => run(deactivateDemoUser, "Usuario demo desactivado.")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-60"
          >
            <Ban className="size-3.5" /> Desactivar
          </button>
        ) : null}
      </div>
      {msg ? <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{msg.text}</p> : null}
    </section>
  );
}
