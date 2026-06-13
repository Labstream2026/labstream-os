"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
            L
          </span>
          <h1 className="mt-4 text-xl font-semibold">Labstream OS</h1>
          <p className="text-sm text-muted-foreground">Espacio de trabajo del equipo</p>
        </div>

        <form action={action} className="space-y-3">
          <input
            name="email"
            type="email"
            required
            placeholder="tu@labstream.co"
            defaultValue="mateo@labstream.co"
            autoComplete="email"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            name="password"
            type="password"
            required
            placeholder="Contraseña"
            autoComplete="current-password"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />

          {state?.error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Acceso del equipo. SSO con Authentik en una fase posterior.
        </p>
      </div>
    </div>
  );
}
