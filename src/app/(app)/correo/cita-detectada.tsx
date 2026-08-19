"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarPlus, Check, Loader2 } from "lucide-react";
import { crearCitaDesdeCorreo } from "./acciones";
import type { CitaDetectada } from "@/lib/correo/citas";

// ── El banner de CITA detectada en un correo ────────────────────────────────
// El detector propone («jue 21 ago · 15:00»); aquí la persona confirma y ajusta. «Agendar»
// crea el evento real del calendario (sincroniza al Synology de quien lo tenga conectado y
// avisa antes); «Solo recordatorio» es la versión ligera. Nada se crea sin el clic.

export function BannerCita({ mensajeId, cita, puedeEvento }: {
  mensajeId: string;
  cita: CitaDetectada;
  puedeEvento: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [titulo, setTitulo] = React.useState(cita.tituloSugerido);
  const [fecha, setFecha] = React.useState(cita.fecha);
  const [hora, setHora] = React.useState(cita.hora);
  const [duracion, setDuracion] = React.useState(60);
  const [lugar, setLugar] = React.useState(cita.enlaceVideo ?? "");
  const [aviso, setAviso] = React.useState(15);
  const [error, setError] = React.useState<string | null>(null);
  const [listo, setListo] = React.useState<"evento" | "recordatorio" | null>(null);
  const [pendiente, arranca] = React.useTransition();

  const crear = (modo: "evento" | "recordatorio") => {
    setError(null);
    arranca(async () => {
      const r = await crearCitaDesdeCorreo({ mensajeId, modo, titulo, fecha, hora, duracionMin: duracion, lugar, recordatorioMin: aviso });
      if (!r.ok) { setError(r.error ?? "No se pudo crear."); return; }
      setListo(modo);
      router.refresh();
    });
  };

  if (listo) {
    return (
      <p className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
        <Check className="size-3.5" />
        {listo === "evento" ? "Agendada en el calendario (con su aviso). " : "Recordatorio creado. "}
        {listo === "evento" ? <a href="/calendario" className="underline">Ver calendario →</a> : null}
      </p>
    );
  }

  const cls = "rounded-md border border-input bg-background px-2 py-1 text-[12px] outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="mb-2 rounded-lg border border-dashed border-sky-300/70 bg-sky-50/60 px-3 py-2 dark:border-sky-500/30 dark:bg-sky-500/10">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <CalendarPlus className="size-3.5 text-sky-600 dark:text-sky-400" />
        <span>
          Posible cita: <b className="capitalize">{cita.etiqueta}</b>
        </span>
        {!abierto ? (
          <button type="button" onClick={() => setAbierto(true)}
            className="rounded-md bg-sky-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-sky-700">
            Agendar…
          </button>
        ) : null}
      </div>

      {abierto ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex min-w-40 flex-1 flex-col gap-0.5 text-[10.5px] font-medium text-muted-foreground">
            Título
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} className={cls} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10.5px] font-medium text-muted-foreground">
            Fecha
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${cls} tabular-nums`} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10.5px] font-medium text-muted-foreground">
            Hora
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={`${cls} tabular-nums`} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10.5px] font-medium text-muted-foreground">
            Dura
            <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} className={cls}>
              <option value={30}>30 min</option>
              <option value={60}>1 h</option>
              <option value={90}>1,5 h</option>
              <option value={120}>2 h</option>
            </select>
          </label>
          <label className="flex min-w-36 flex-1 flex-col gap-0.5 text-[10.5px] font-medium text-muted-foreground">
            Lugar / enlace
            <input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Sala, dirección o Meet…" className={cls} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10.5px] font-medium text-muted-foreground">
            Aviso
            <select value={aviso} onChange={(e) => setAviso(Number(e.target.value))} className={cls}>
              <option value={0}>Sin aviso</option>
              <option value={15}>15 min antes</option>
              <option value={30}>30 min antes</option>
              <option value={60}>1 h antes</option>
            </select>
          </label>
          <div className="flex items-center gap-1.5">
            {puedeEvento ? (
              <button type="button" disabled={pendiente} onClick={() => crear("evento")}
                className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarPlus className="size-3.5" />} Al calendario
              </button>
            ) : null}
            <button type="button" disabled={pendiente} onClick={() => crear("recordatorio")}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-accent disabled:opacity-50">
              <Bell className="size-3.5" /> Solo recordatorio
            </button>
          </div>
          {error ? <p className="w-full text-[11.5px] font-medium text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
