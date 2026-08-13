"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Laptop, Loader2, MonitorCheck, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { vincularRastreador, revocarRastreador } from "./tracker-actions";

// ── Ajustes → Perfil → «Rastreador de trabajo» ──
// La vinculación SOLO funciona dentro de la app de escritorio: esta página genera el token en
// el servidor y se lo entrega al sensor por un evento Tauri (ls-tracker-token) — el secreto ni
// se muestra ni se copia a mano. En el navegador normal, la tarjeta explica y lista los
// equipos, con su señal de vida y el botón de revocar.

export type EquipoRastreador = {
  id: string;
  name: string;
  platform: string | null;
  // «hace 3 min» (formateado en el servidor); null = nunca ha reportado.
  vistoLabel: string | null;
  // true = reportó hace poco (el sensor está vivo).
  activo: boolean;
};

// El objeto global que inyecta Tauri en la app de escritorio (tipado mínimo local).
type TauriGlobal = { event?: { emit: (name: string, payload?: unknown) => Promise<void> } };

export function TrackerDevices({ equipos }: { equipos: EquipoRastreador[] }) {
  const router = useRouter();
  const [enApp, setEnApp] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    const t = setTimeout(() => {
      const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
      setEnApp(!!tauri?.event);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function vincular() {
    setMsg(null);
    start(async () => {
      const r = await vincularRastreador();
      if (!r.ok || !r.token) {
        setMsg({ ok: false, text: r.error ?? "No se pudo vincular." });
        return;
      }
      const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
      try {
        await tauri!.event!.emit("ls-tracker-token", { token: r.token });
        setMsg({ ok: true, text: "Equipo vinculado: el sensor empieza a registrar en un momento." });
        router.refresh();
      } catch {
        setMsg({ ok: false, text: "No se pudo entregar el token a la app. ¿Estás en la app de escritorio?" });
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><MonitorCheck className="size-4 text-primary" /> Rastreador de trabajo</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        La app de escritorio registra en qué aplicación estás y si hay actividad, para medir horas efectivas en Reportes.
      </p>
      <p className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span>
          Registra <b className="text-foreground">solo</b> la app al frente, el título de su ventana y si hubo entrada.
          <b className="text-foreground"> Nunca</b> teclas, pantallazos ni contenido. Sin actividad por 3 minutos, deja de contar.
          Se pausa desde el icono de la bandeja cuando quieras.
        </span>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={vincular}
          disabled={pending || !enApp}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Laptop className="size-3.5" />}
          Vincular este equipo
        </button>
        {!enApp ? (
          <span className="text-[11px] text-muted-foreground">Abre esta página desde la app de escritorio para vincular.</span>
        ) : null}
        {msg ? (
          <span className={cn("text-[11.5px] font-medium", msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>{msg.text}</span>
        ) : null}
      </div>

      {equipos.length > 0 ? (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {equipos.map((e) => <Fila key={e.id} e={e} />)}
        </ul>
      ) : null}
    </div>
  );
}

function Fila({ e }: { e: EquipoRastreador }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = React.useState(false);
  const [pending, start] = React.useTransition();
  React.useEffect(() => {
    if (!confirmando) return;
    const t = setTimeout(() => setConfirmando(false), 4000);
    return () => clearTimeout(t);
  }, [confirmando]);

  return (
    <li className="flex items-center gap-2.5 px-3 py-2 text-sm">
      <span
        aria-label={e.activo ? "Reportando" : "Sin señal"}
        className={cn("size-2 shrink-0 rounded-full", e.activo ? "bg-emerald-500" : "bg-muted-foreground/40")}
      />
      <span className="min-w-0 flex-1 truncate">
        {e.name}
        {e.platform ? <span className="ml-1.5 text-[10.5px] uppercase text-muted-foreground">{e.platform}</span> : null}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{e.vistoLabel ? `visto ${e.vistoLabel}` : "sin señal aún"}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirmando) { setConfirmando(true); return; }
          setConfirmando(false);
          start(async () => {
            await revocarRastreador(e.id);
            router.refresh();
          });
        }}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
          confirmando ? "bg-destructive text-destructive-foreground" : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {pending ? <Loader2 className="size-3" /> : <X className="size-3" />}
        {confirmando ? "¿Revocar?" : "Revocar"}
      </button>
    </li>
  );
}
