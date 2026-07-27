"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Check, AlertTriangle, BookOpen, ExternalLink } from "lucide-react";
import { activarModoDemo, desactivarModoDemo, type DemoModoResult } from "./demo-mode-actions";

// Panel de Ajustes → Sistema → «Modo demo»: enciende una muestra completa de la app
// (cliente, proyecto, tareas, entregable, citas, chat, nota, recordatorio, wiki, biblioteca)
// y la apaga borrando exactamente lo que creó. Solo lo ve un administrador.

export function DemoModePanel({
  activo,
  activadoEn,
  activadoPor,
  cuantos,
  clienteId,
  proyectoId,
  totalFunciones,
}: {
  activo: boolean;
  activadoEn: string | null;
  activadoPor: string | null;
  cuantos: number;
  clienteId: string | null;
  proyectoId: string | null;
  totalFunciones: number;
}) {
  const router = useRouter();
  const [busy, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [confirmar, setConfirmar] = React.useState(false);

  const correr = (fn: () => Promise<DemoModoResult>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r.ok) {
        setMsg({
          ok: true,
          text:
            r.creados != null
              ? `Muestra lista: ${r.creados} elementos creados. Ya puedes recorrer la app.`
              : `Muestra retirada: ${r.borrados} elementos borrados.`,
        });
        setConfirmar(false);
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error ?? "Algo salió mal." });
      }
    });

  const fecha = activadoEn
    ? new Date(activadoEn).toLocaleString("es-CO", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" /> Modo demo
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            activo
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {activo ? "encendido" : "apagado"}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Llena la app con un cliente y un proyecto de <strong>muestra</strong> —tareas (una vencida y una hecha),
        un entregable en revisión, dos citas, un chat de proyecto, una nota, un recordatorio, una página de wiki
        y material de biblioteca— para enseñar o probar la herramienta sin tocar el trabajo real.
        Al apagarlo se borra <strong>exactamente</strong> lo que creó. No toca facturación ni propuestas.
      </p>

      {activo && fecha ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Encendido el {fecha}
          {activadoPor ? ` por ${activadoPor}` : ""} · {cuantos} elementos de muestra.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!activo ? (
          <button
            type="button"
            onClick={() => correr(activarModoDemo)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Encender el modo demo
          </button>
        ) : !confirmar ? (
          <button
            type="button"
            onClick={() => setConfirmar(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Apagar y borrar la muestra
          </button>
        ) : (
          <>
            <span className="text-xs font-medium text-destructive">
              ¿Seguro? Se borrarán los {cuantos} elementos de muestra.
            </span>
            <button
              type="button"
              onClick={() => correr(desactivarModoDemo)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Sí, borrar
            </button>
            <button
              type="button"
              onClick={() => setConfirmar(false)}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
          </>
        )}

        <Link
          href="/guia"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <BookOpen className="size-4" /> Ver la guía ({totalFunciones} funciones)
        </Link>
      </div>

      {activo && (clienteId || proyectoId) ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          <span className="text-[11px] text-muted-foreground">Ir a la muestra:</span>
          {proyectoId ? (
            <Link href={`/proyectos/${proyectoId}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
              <ExternalLink className="size-3" /> Proyecto
            </Link>
          ) : null}
          {clienteId ? (
            <Link href={`/clientes/${clienteId}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
              <ExternalLink className="size-3" /> Cliente
            </Link>
          ) : null}
          <Link href="/mis-tareas" className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
            <ExternalLink className="size-3" /> Tareas
          </Link>
          <Link href="/calendario" className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
            <ExternalLink className="size-3" /> Calendario
          </Link>
        </div>
      ) : null}

      {msg ? (
        <p className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {msg.ok ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />} {msg.text}
        </p>
      ) : null}
    </section>
  );
}
