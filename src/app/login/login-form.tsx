"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";

export function LoginForm({
  ssoEnabled,
  errorMsg,
  next = "/",
}: {
  ssoEnabled: boolean;
  errorMsg?: string;
  next?: string;
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const ssoHref =
    next && next !== "/" ? `/api/auth/oidc/login?next=${encodeURIComponent(next)}` : "/api/auth/oidc/login";

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

        {ssoEnabled ? (
          <>
            <a
              href={ssoHref}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium hover:bg-accent"
            >
              Entrar con Authentik
            </a>
            <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> o con tu correo <span className="h-px flex-1 bg-border" />
            </div>
          </>
        ) : null}

        <form action={action} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <input
            name="email"
            type="email"
            required
            placeholder="tu@labstream.co"
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

          {state?.error || errorMsg ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state?.error ?? errorMsg}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
