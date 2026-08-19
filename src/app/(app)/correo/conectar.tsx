"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { conectarCorreo } from "./acciones";

// ── Conectar el buzón ───────────────────────────────────────────────────────
// El equipo solo escribe su correo y su contraseña: los servidores vienen prellenados con el
// MailPlus del NAS y viven en un desplegable de «Avanzado» para quien tenga un caso raro.

export function ConectarCorreo({ hostDefecto, emailSugerido }: { hostDefecto: string; emailSugerido?: string }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, arranca] = React.useTransition();

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    arranca(async () => {
      const r = await conectarCorreo(fd);
      if (!r.ok) setError(r.error ?? "No se pudo conectar.");
      else router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Mail className="size-4 text-primary" /> Conecta tu buzón</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Es el correo del propio servidor del estudio (Synology MailPlus): tu dirección ya viene
        puesta — solo falta <b className="text-foreground">tu contraseña</b>, la misma de tu usuario del Synology.
      </p>
      <p className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span>
          La contraseña se guarda <b className="text-foreground">cifrada</b> y solo la usa el servidor para hablar con el correo del NAS.
          Nadie más del equipo ve tu buzón: es tuyo.
        </span>
      </p>

      <form onSubmit={enviar} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Tu correo
          <input name="email" type="email" required defaultValue={emailSugerido ?? ""} placeholder="nombre@labstreamsas.com" autoComplete="email"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Contraseña (la de tu usuario del Synology)
          <input name="password" type="password" required autoFocus={!!emailSugerido} autoComplete="current-password"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>

        <details className="rounded-md border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Avanzado (servidores)</summary>
          <div className="mt-2 grid grid-cols-[1fr_5rem] gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-medium">Servidor IMAP
              <input name="imapHost" defaultValue={hostDefecto} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium">Puerto
              <input name="imapPort" defaultValue="993" inputMode="numeric" className="rounded-md border border-input bg-background px-2 py-1.5 text-xs tabular-nums" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium">Servidor SMTP
              <input name="smtpHost" defaultValue={hostDefecto} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium">Puerto
              <input name="smtpPort" defaultValue="587" inputMode="numeric" className="rounded-md border border-input bg-background px-2 py-1.5 text-xs tabular-nums" />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-[11px] font-medium">Usuario (si no es el correo completo)
              <input name="usuario" placeholder="igual que el correo" className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
            </label>
          </div>
        </details>

        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

        <button type="submit" disabled={pendiente}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pendiente ? <><Loader2 className="size-4 animate-spin" /> Probando y sincronizando…</> : "Conectar"}
        </button>
      </form>
    </div>
  );
}
