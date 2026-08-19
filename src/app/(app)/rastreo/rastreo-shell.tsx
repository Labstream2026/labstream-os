"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Share2, ShieldCheck, X } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import type { PersonaRastreo, RastreoDatos } from "@/lib/rastreo/datos";
import { Barras, Spark } from "../reportes/graficas";
import { compartirRastreo, revocarRastreo } from "./acciones";

// ── El panel de rastreo: el shell ──
// Dos vistas: la LISTA del equipo (quién trabajó cuánto, con su curva) y la FICHA de una
// persona (jornadas, apps, cuentas y con quién está compartida). Los datos llegan enteros y
// ya formateados del servidor; aquí no se recalcula nada, solo se pinta y se navega.
// El periodo va por searchParams, igual que en Reportes, para que un enlace lleve a lo mismo.

const PERIODOS = [
  { key: "mes", label: "Mes" },
  { key: "90", label: "90 d" },
  { key: "ano", label: "Año" },
  { key: "todo", label: "Todo" },
];

const VARS =
  "[--rs1:#2a78d6] [--rs2:#1d9e75] [--rs3:#eda100] [--rs4:#7f77dd] [--rs-bad:#e24b4a] dark:[--rs3:#bd8100] " +
  "[--rs-grid:hsl(var(--muted))] [--rs-tx:hsl(var(--foreground))] [--rs-dim:hsl(var(--muted-foreground))] " +
  "[--rs-faint:hsl(var(--muted-foreground))] [--rs-card:hsl(var(--card))]";

export function RastreoShell({ datos }: { datos: RastreoDatos }) {
  const router = useRouter();
  const [sel, setSel] = React.useState<string | null>(null);
  const per = datos.periodo;

  // Con UNA sola ficha visible (a alguien le compartieron una persona) no hay lista que elegir.
  const unica = datos.personas.length === 1 && !datos.gestiona ? datos.personas[0].id : null;
  const personaSel = datos.personas.find((p) => p.id === (sel ?? unica)) ?? null;

  const irPeriodo = (p: string, m?: string | null) => {
    const q = new URLSearchParams({ p });
    if (p === "mes" && m) q.set("m", m);
    router.push(`/rastreo?${q.toString()}`, { scroll: false });
  };

  return (
    <div className={VARS}>
      {/* ── Barra de enfoque ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="flex items-center gap-2 text-base font-semibold">🛰️ Rastreo de trabajo</h1>
        <p className="min-w-32 flex-1 text-[11px] text-muted-foreground">{per.subtitulo}</p>
        {per.key === "mes" ? (
          <span className="inline-flex items-center gap-0.5 rounded-lg border border-border px-1 py-0.5">
            <button type="button" aria-label="Mes anterior" onClick={() => irPeriodo("mes", per.mesAnterior)} className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <ChevronLeft className="size-3.5" />
            </button>
            <b className="min-w-16 text-center text-[11.5px] tabular-nums">{per.etiqueta}</b>
            <button
              type="button" aria-label="Mes siguiente" disabled={!per.mesSiguiente}
              onClick={() => per.mesSiguiente && irPeriodo("mes", per.mesSiguiente)}
              className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </span>
        ) : null}
        <span className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Periodo">
          {PERIODOS.map((p, i) => (
            <button
              key={p.key} type="button" onClick={() => irPeriodo(p.key)}
              className={cn(
                "px-2.5 py-1.5 text-[11.5px] transition-colors",
                i > 0 && "border-l border-border",
                per.key === p.key ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </span>
        {datos.gestiona && datos.personas.length ? (
          <button
            type="button" onClick={() => exportarCsv(datos)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Download className="size-3.5" /> CSV
          </button>
        ) : null}
      </div>

      {/* Quien entra por compartición no ve el equipo: que sepa exactamente qué está viendo. */}
      {!datos.gestiona ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11.5px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          Te compartieron este rastreo. Ves solo a {datos.personas.length === 1 ? "esta persona" : "estas personas"} y no puedes compartirlo con nadie más.
        </p>
      ) : null}

      {datos.sinSensor ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
          <p className="text-[13px] font-semibold">Todavía no hay nada que medir</p>
          <p className="mx-auto mt-1.5 max-w-lg text-[11.5px] leading-relaxed text-muted-foreground">
            Nadie ha vinculado su equipo aún. Cada persona lo hace desde la app de escritorio, en{" "}
            <b className="text-foreground">Ajustes → Perfil → Vincular este equipo</b>. Mientras tanto este panel se queda vacío.
          </p>
        </div>
      ) : personaSel ? (
        <Ficha
          p={personaSel} datos={datos}
          onCerrar={unica ? null : () => setSel(null)}
        />
      ) : (
        <Lista datos={datos} onElegir={setSel} />
      )}
    </div>
  );
}

// ── Vista de equipo ─────────────────────────────────────────────────────────
function Lista({ datos, onElegir }: { datos: RastreoDatos; onElegir: (id: string) => void }) {
  const max = Math.max(...datos.personas.map((p) => p.horas), 1);
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi v={datos.totalTxt} l="medidas en el periodo" />
        <Kpi v={String(datos.personasConDatos)} l="personas con datos" />
        <Kpi v={datos.pctActivoEquipo === null ? "—" : `${datos.pctActivoEquipo}%`} l="con entrada real" hint="Del tiempo medido, cuánto tuvo mouse o teclado de verdad. El resto es la app abierta sin uso." />
        <Kpi v={String(datos.personas.filter((p) => p.equipos > 0).length)} l="equipos vinculados" />
      </div>

      {datos.serieEquipo.valores.length ? (
        <Caja titulo={`Horas efectivas del equipo · ${datos.contexto.toLowerCase()}`} className="mt-2.5">
          <Barras serie={datos.serieEquipo} color="var(--rs1)" unidad=" h" />
        </Caja>
      ) : null}

      {datos.ocioEquipoTxt ? (
        <Caja
          titulo={`Ocio en el navegador (${datos.ambitoTodos ? "equipo" : "personas visibles"}) · ${datos.ocioEquipoTxt}`}
          hint="Sitios de ocio detectados por el título de la ventana. El detalle por persona y por franja del día está en cada ficha. WhatsApp y Telegram no cuentan aquí: son canal de clientes."
          className="mt-2.5"
        >
          <FilasBarra filas={datos.ocioEquipo} color="var(--rs3)" />
          {datos.navegacionTruncada ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              El periodo trae más navegación que el tope de la consulta: estas cifras son parciales (falta lo más viejo). Elige un
              periodo más corto para verlo completo.
            </p>
          ) : null}
        </Caja>
      ) : null}

      <Caja titulo="Cada persona" hint="Clic en alguien para abrir su ficha" className="mt-2.5">
        <div className="flex flex-col">
          {datos.personas.map((p) => (
            <button
              key={p.id} type="button" onClick={() => onElegir(p.id)}
              className="flex items-center gap-2.5 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-muted/60"
            >
              <UserAvatar initials={p.ini} color={p.color} size="sm" className="size-7 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <b className="truncate text-[12.5px]">{p.nombre}</b>
                  {p.equipos === 0 ? (
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground">sin equipo</span>
                  ) : p.visores.length ? (
                    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-medium text-primary">compartido</span>
                  ) : null}
                </span>
                <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full transition-all" style={{ width: `${(p.horas / max) * 100}%`, background: "var(--rs1)" }} />
                </span>
              </span>
              <span className="hidden w-24 shrink-0 sm:block"><Spark v={p.serie.valores} /></span>
              <span className="w-14 shrink-0 text-right text-[10.5px] text-muted-foreground tabular-nums">{p.dias} d</span>
              <span className="w-16 shrink-0 text-right text-[12.5px] font-semibold tabular-nums">{p.horasTxt}</span>
            </button>
          ))}
        </div>
      </Caja>
    </>
  );
}

// ── Ficha de una persona ────────────────────────────────────────────────────
function Ficha({ p, datos, onCerrar }: { p: PersonaRastreo; datos: RastreoDatos; onCerrar: (() => void) | null }) {
  return (
    <div className="mt-3">
      <div className="mb-2.5 flex items-center gap-2.5">
        {onCerrar ? (
          <button type="button" onClick={onCerrar} className="rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
            ← Todo el equipo
          </button>
        ) : null}
        <UserAvatar initials={p.ini} color={p.color} size="sm" className="size-8" />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[14px]">{p.nombre}</b>
          <span className="text-[11px] text-muted-foreground">
            {p.equipos ? `${p.equipos} equipo${p.equipos > 1 ? "s" : ""} vinculado${p.equipos > 1 ? "s" : ""}` : "Sin equipo vinculado"}
            {p.ultimoTxt ? ` · reportó ${p.ultimoTxt}` : ""}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi v={p.horasTxt} l="efectivas en el periodo" />
        <Kpi v={String(p.dias)} l="días con actividad" />
        <Kpi v={p.promedioTxt} l="promedio por día" />
        <Kpi v={p.pctActivo === null ? "—" : `${p.pctActivo}%`} l="con entrada real" hint="Cuánto de ese tiempo tuvo mouse o teclado. Lo demás es la app abierta sin uso." />
      </div>

      {p.serie.valores.length ? (
        <Caja titulo={`Su curva · ${datos.contexto.toLowerCase()}`} className="mt-2.5">
          <Barras serie={p.serie} color="var(--rs1)" unidad=" h" />
        </Caja>
      ) : null}

      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
        <Caja titulo="Sus jornadas" hint="A qué hora entró, a qué hora paró, cuánto sumó y cuánto estuvo quieto · hora de Bogotá">
          {p.jornadas.length ? (
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-1 font-bold">Día</th>
                  <th className="py-1 text-right font-bold">Entró</th>
                  <th className="py-1 text-right font-bold">Paró</th>
                  <th className="py-1 text-right font-bold">Efectivas</th>
                  {/* «Inactivo» = el equipo despierto y sin una sola entrada (tras los 3 min de
                      umbral). Los sensores anteriores a 1.9 no lo reportan: sale «—». */}
                  <th className="py-1 text-right font-bold">Inactivo</th>
                </tr>
              </thead>
              <tbody>
                {p.jornadas.map((j) => (
                  <tr key={j.dia} className="border-b border-border last:border-0">
                    <td className="py-1 capitalize">{j.dia}</td>
                    <td className="py-1 text-right tabular-nums">{j.inicio}</td>
                    <td className="py-1 text-right tabular-nums">{j.fin}</td>
                    <td className={cn("py-1 text-right font-semibold tabular-nums", j.horas >= 7 ? "text-emerald-600 dark:text-emerald-400" : j.horas >= 4 ? "" : "text-muted-foreground")}>
                      {j.efectivasTxt}
                    </td>
                    <td className="py-1 text-right tabular-nums text-muted-foreground">{j.inactivoTxt ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Vacio texto="Sin jornadas en el periodo." />
          )}
        </Caja>
        <Caja
          titulo="En qué páginas (navegador)"
          hint="Clasificado por el título de la ventana contra un catálogo de sitios conocidos; lo demás va a «Otros sitios». Un rato en YouTube puede ser un tutorial: esto dice dónde y cuándo, no por qué."
        >
          {p.sitios.length ? <FilasBarra filas={p.sitios} color="var(--rs2)" /> : <Vacio texto="Sin navegación en el periodo." />}
        </Caja>
        {p.ocioTxt ? (
          <Caja titulo={`Ocio en el navegador · ${p.ocioTxt}`} hint="Solo sitios de la categoría ocio, y en qué franja del día caen · hora de Bogotá">
            <div className="grid gap-3 sm:grid-cols-2">
              <FilasBarra filas={p.ocioSitios} color="var(--rs3)" />
              <FilasBarra filas={p.ocioFranjas} color="var(--rs3)" />
            </div>
          </Caja>
        ) : null}
        <div className="flex flex-col gap-2.5">
          <Caja titulo="En qué apps">
            {p.apps.length ? <FilasBarra filas={p.apps} color="var(--rs2)" /> : <Vacio texto="Sin datos en el periodo." />}
          </Caja>
          <Caja titulo="En qué cuentas" hint="Deducido del título de la ventana; lo que no se puede decir queda «sin atribuir»">
            {p.cuentas.length ? <FilasBarra filas={p.cuentas} color="var(--rs4)" /> : <Vacio texto="Sin datos en el periodo." />}
          </Caja>
        </div>
      </div>

      {datos.gestiona ? <Compartir p={p} candidatos={datos.candidatos} /> : null}
    </div>
  );
}

// ── Compartir con otra persona del equipo ───────────────────────────────────
function Compartir({ p, candidatos }: { p: PersonaRastreo; candidatos: RastreoDatos["candidatos"] }) {
  const [abierto, setAbierto] = React.useState(false);
  const [quien, setQuien] = React.useState("");
  const [dias, setDias] = React.useState("90");
  const [nota, setNota] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, arranca] = React.useTransition();

  const yaVen = new Set(p.visores.map((v) => v.id));
  const libres = candidatos.filter((c) => !yaVen.has(c.id));

  const enviar = () => {
    if (!quien) return;
    setError(null);
    arranca(async () => {
      const r = await compartirRastreo({ subjectId: p.id, viewerId: quien, dias: dias === "0" ? null : Number(dias), nota });
      if (!r.ok) setError(r.error ?? "No se pudo compartir.");
      else { setQuien(""); setNota(""); setAbierto(false); }
    });
  };

  const quitar = (viewerId: string) => {
    setError(null);
    arranca(async () => {
      const r = await revocarRastreo({ subjectId: p.id, viewerId });
      if (!r.ok) setError(r.error ?? "No se pudo quitar.");
    });
  };

  return (
    <Caja titulo="Quién puede ver esto" hint="Además de quien tenga el permiso de rastreo" className="mt-2.5">
      {p.visores.length ? (
        <ul className="mb-2 flex flex-col gap-1">
          {p.visores.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
              <UserAvatar initials={v.ini} color={v.color} size="sm" className="size-6 shrink-0" />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[12px]">{v.nombre}</b>
                {v.venceTxt || v.nota ? (
                  <span className="block truncate text-[10.5px] text-muted-foreground">
                    {[v.venceTxt, v.nota].filter(Boolean).join(" · ")}
                  </span>
                ) : (
                  <span className="block text-[10.5px] text-muted-foreground">sin vencimiento</span>
                )}
              </span>
              <button
                type="button" onClick={() => quitar(v.id)} disabled={pendiente}
                aria-label={`Quitar acceso a ${v.nombre}`}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-[11.5px] text-muted-foreground">Nadie más. Solo quien tenga el permiso de rastreo ve estos números.</p>
      )}

      {abierto ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <div className="flex flex-wrap gap-2">
            <select
              value={quien} onChange={(e) => setQuien(e.target.value)}
              className="min-w-40 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
            >
              <option value="">¿Con quién?</option>
              {libres.map((c) => (
                <option key={c.id} value={c.id}>{c.id === p.id ? `${c.nombre} (ella/él mismo)` : c.nombre}</option>
              ))}
            </select>
            <select
              value={dias} onChange={(e) => setDias(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
            >
              <option value="30">30 días</option>
              <option value="90">90 días</option>
              <option value="365">1 año</option>
              <option value="0">Sin vencimiento</option>
            </select>
          </div>
          <input
            value={nota} onChange={(e) => setNota(e.target.value)} maxLength={140}
            placeholder="Para qué (opcional): «su 1:1 de agosto»"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
          />
          {error ? <p className="text-[11.5px] text-rose-600 dark:text-rose-400">{error}</p> : null}
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={enviar} disabled={!quien || pendiente}
              className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-40"
            >
              {pendiente ? "Compartiendo…" : "Compartir"}
            </button>
            <button type="button" onClick={() => { setAbierto(false); setError(null); }} className="text-[11.5px] text-muted-foreground hover:text-foreground">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button" onClick={() => setAbierto(true)} disabled={!libres.length}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] font-medium hover:bg-muted disabled:opacity-40"
        >
          <Share2 className="size-3.5" /> Compartir con alguien del equipo
        </button>
      )}
      {error && !abierto ? <p className="mt-1.5 text-[11.5px] text-rose-600 dark:text-rose-400">{error}</p> : null}
    </Caja>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────
function Caja({ titulo, hint, className, children }: { titulo: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-3", className)}>
      <h3 className="text-[12px] font-semibold">{titulo}</h3>
      {hint ? <p className="mb-2 mt-0.5 text-[10.5px] text-muted-foreground">{hint}</p> : <div className="mb-2" />}
      {children}
    </section>
  );
}

function Kpi({ v, l, hint }: { v: string; l: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5" title={hint}>
      <p className="text-[17px] font-bold leading-none tabular-nums">{v}</p>
      <p className="mt-1 text-[10.5px] leading-tight text-muted-foreground">{l}</p>
    </div>
  );
}

function FilasBarra({ filas, color }: { filas: { label: string; valor: number; texto?: string }[]; color: string }) {
  const max = Math.max(...filas.map((f) => f.valor), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {filas.map((f) => (
        <div key={f.label} className="flex items-center gap-2 text-[11.5px]">
          <span className="w-28 shrink-0 truncate" title={f.label}>{f.label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full" style={{ width: `${(f.valor / max) * 100}%`, background: color }} />
          </span>
          <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{f.texto}</span>
        </div>
      ))}
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p className="py-3 text-center text-[11.5px] text-muted-foreground">{texto}</p>;
}

// ── CSV ─────────────────────────────────────────────────────────────────────
function exportarCsv(d: RastreoDatos) {
  const esc = (x: string | number) => `"${String(x).replaceAll('"', '""')}"`;
  const fila = (xs: (string | number)[]) => xs.map(esc).join(";");
  const lineas = [
    fila(["Persona", "Horas efectivas", "Días con actividad", "Promedio por día", "% con entrada real", "Equipos vinculados", "Compartido con"]),
    ...d.personas.map((p) =>
      fila([p.nombre, p.horasTxt, p.dias, p.promedioTxt, p.pctActivo === null ? "" : `${p.pctActivo}%`, p.equipos, p.visores.map((v) => v.nombre).join(", ")]),
    ),
  ];
  // BOM para que Excel abra el UTF-8 con tildes bien.
  const blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rastreo-${d.periodo.etiqueta.toLowerCase().replace(/\s+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
