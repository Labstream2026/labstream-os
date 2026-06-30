"use client";

import * as React from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { setInvitePassword } from "./actions";

export function SetPasswordForm({ token, name, email }: { token: string; name: string; email: string }) {
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (pw !== pw2) { setError("Las contraseñas no coinciden."); return; }
    start(async () => {
      const r = await setInvitePassword(token, pw);
      if (!r.ok) { setError(r.error ?? "No se pudo activar."); return; }
      // Sesión iniciada: recarga completa para entrar al portal.
      window.location.href = "/proyectos";
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Hola <span className="font-medium text-foreground">{name.trim().split(/\s+/)[0] || name}</span>, crea una contraseña para tu cuenta.</p>
        <p className="mt-1 text-xs text-muted-foreground">Iniciarás sesión con <span className="font-medium">{email}</span>.</p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Contraseña</span>
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? "Ocultar" : "Mostrar"}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Repite la contraseña</span>
        <input
          type={show ? "text" : "password"}
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null} Activar mi acceso
      </button>
    </form>
  );
}
