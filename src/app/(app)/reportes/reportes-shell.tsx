"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Landmark, X } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import type { FilaBarra, FilaCliente, FilaCumplimiento, Kpi, PersonaReporte, ReporteDatos } from "@/lib/reportes/datos";
import { Apiladas, Area, Barras, Spark } from "./graficas";

// ── Reportes v2: el shell (rediseño aprobado por prototipo) ──
// CINCO casos de enfoque en pestañas —Estudio, Entregas, Equipo, Clientes, Finanzas— y un
// PERIODO global (mes navegable ◂ ▸, 90 días, año, todo) que mueve todos los números. Los
// datos llegan ENTEROS y ya formateados del servidor (lib/reportes/datos); aquí solo se
// pinta, se cambia de pestaña sin recargar, y el periodo navega con searchParams (el
// servidor recalcula). Los drills (persona, cliente) son estado local sobre datos que ya
// vinieron. El caso Finanzas no duplica el Centro Finanzas: es el pulso + el enlace.

type CasoKey = "estudio" | "entregas" | "equipo" | "clientes" | "finanzas";

const CASOS: { key: CasoKey; label: string; icono: string; nuevo?: boolean; soloFin?: boolean }[] = [
  { key: "estudio", label: "Estudio", icono: "🎛️" },
  { key: "entregas", label: "Entregas", icono: "🎬", nuevo: true },
  { key: "equipo", label: "Equipo", icono: "👥" },
  { key: "clientes", label: "Clientes", icono: "🤝", nuevo: true },
  { key: "finanzas", label: "Finanzas", icono: "💰", soloFin: true },
];

const PERIODOS: { key: string; label: string }[] = [
  { key: "mes", label: "Mes" },
  { key: "90", label: "90 d" },
  { key: "ano", label: "Año" },
  { key: "todo", label: "Todo" },
];

// Colores de las series (validados claro y oscuro; el ámbar cambia de tono en oscuro porque
// el claro no pasa la banda de luminosidad sobre fondo oscuro). El resto hereda tokens.
const VARS =
  "[--rs1:#2a78d6] [--rs2:#1d9e75] [--rs3:#eda100] [--rs-bad:#e24b4a] dark:[--rs3:#bd8100] " +
  "[--rs-grid:hsl(var(--muted))] [--rs-tx:hsl(var(--foreground))] [--rs-dim:hsl(var(--muted-foreground))] " +
  "[--rs-faint:hsl(var(--muted-foreground))] [--rs-card:hsl(var(--card))]";

export function ReportesShell({ datos }: { datos: ReporteDatos }) {
  const router = useRouter();
  const [caso, setCaso] = React.useState<CasoKey>("estudio");
  const [persona, setPersona] = React.useState<string | null>(null);
  const [cliente, setCliente] = React.useState<string | null>(null);

  // Preferencia tras montar (evita mismatch de hidratación); el hash manda sobre lo guardado.
  React.useEffect(() => {
    const valida = (k: string | null): k is CasoKey => !!k && CASOS.some((c) => c.key === k && (!c.soloFin || datos.canFin));
    const t = setTimeout(() => {
      const fromHash = window.location.hash.replace(/^#/, "");
      if (valida(fromHash)) { setCaso(fromHash); return; }
      const saved = window.localStorage.getItem("reportes-caso");
      if (valida(saved)) setCaso(saved);
    }, 0);
    return () => clearTimeout(t);
  }, [datos.canFin]);
  const irCaso = (k: CasoKey) => {
    setCaso(k);
    window.localStorage.setItem("reportes-caso", k);
    history.replaceState(null, "", `#${k}`);
  };

  const irPeriodo = (p: string, m?: string | null) => {
    const q = new URLSearchParams({ p });
    if (p === "mes" && m) q.set("m", m);
    router.push(`/reportes?${q.toString()}${window.location.hash}`, { scroll: false });
  };

  const per = datos.periodo;
  const personaSel = persona ? datos.personas.find((p) => p.id === persona) ?? null : null;
  const clienteSel = cliente ? datos.clientes.find((c) => c.id === cliente) ?? null : null;
  const cumplPersona = (id: string) => datos.cumplimiento.find((c) => c.id === id) ?? null;

  const enfocaPersona = (id: string) => {
    if (!datos.personas.some((p) => p.id === id)) return;
    setPersona(id);
    irCaso("equipo");
  };

  return (
    <div className={VARS}>
      {/* ── Barra de enfoque: título + periodo ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="flex items-center gap-2 text-base font-semibold">📊 Reportes</h1>
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
              key={p.key}
              type="button"
              onClick={() => irPeriodo(p.key)}
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
      </div>

      {/* ── Casos ── */}
      <div role="tablist" aria-label="Casos" className="mt-2 flex items-stretch gap-0.5 overflow-x-auto border-b border-border">
        {CASOS.filter((c) => !c.soloFin || datos.canFin).map((c) => {
          const on = c.key === caso;
          return (
            <button
              key={c.key} type="button" role="tab" aria-selected={on} onClick={() => irCaso(c.key)}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors",
                on ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span aria-hidden>{c.icono}</span> {c.label}
              {c.nuevo ? <span className="rounded bg-primary px-1 py-px text-[9px] font-bold text-primary-foreground">NUEVO</span> : null}
              {on ? <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" /> : null}
            </button>
          );
        })}
        <span className="ml-auto self-center">
          <button
            type="button"
            onClick={() => exportarCsv(caso, datos)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Descargar lo que estás viendo como CSV"
          >
            <Download className="size-3" /> CSV
          </button>
        </span>
      </div>

      <div key={caso} className="mt-3.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
        {caso === "estudio" ? (
          <>
            <KpiFila kpis={datos.canCumpl ? datos.kpis : datos.kpis.filter((k) => k.l !== "Cumplimiento")} />
            <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
              <Caja titulo="Videos aprobados" hint={`${datos.contexto} · aprobaciones reales del cliente, no estados a mano`}>
                {datos.serieAprobados.valores.some((v) => v > 0) ? (
                  <Barras serie={datos.serieAprobados} color="var(--rs1)" unidad="videos" />
                ) : (
                  <Vacio texto="Sin aprobaciones en esta ventana." />
                )}
              </Caja>
              <Caja titulo="Horas registradas" hint={`${datos.contexto} · tiempo imputado en tareas`}>
                {datos.serieHoras.valores.some((v) => v > 0) ? (
                  <Area serie={datos.serieHoras} color="var(--rs2)" unidad="h" />
                ) : (
                  <Vacio texto="Sin horas registradas aún. Se imputan desde el detalle de una tarea." />
                )}
              </Caja>
              <Caja titulo="Dónde está el esfuerzo" hint="Horas del periodo por proyecto (top 5)">
                {datos.esfuerzo.length ? <FilasBarra filas={datos.esfuerzo} color="var(--rs1)" /> : <Vacio texto="Sin horas registradas en el periodo." />}
              </Caja>
              {datos.canCumpl ? (
                <Caja titulo="Cumplimiento por persona" hint="Tareas con fecha del periodo: a tiempo · tarde · vencidas — clic abre su detalle">
                  {datos.cumplimiento.length ? (
                    <FilasCumplimiento filas={datos.cumplimiento} onPersona={enfocaPersona} />
                  ) : (
                    <Vacio texto="Sin tareas con fecha de entrega en el periodo." />
                  )}
                </Caja>
              ) : null}
            </div>
          </>
        ) : null}

        {caso === "entregas" ? (
          <>
            <KpiFila kpis={datos.kpisEntregas} />
            <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
              <Caja titulo="Aprobadas por mes" hint="Últimos 8 meses, salga el periodo que salga arriba">
                <p className="mb-1.5 flex gap-3 text-[10.5px] text-muted-foreground">
                  <span><i className="mr-1 inline-block size-2 rounded-sm align-[-1px]" style={{ background: "var(--rs2)" }} />A la primera</span>
                  <span><i className="mr-1 inline-block size-2 rounded-sm align-[-1px]" style={{ background: "var(--rs3)" }} />Con correcciones</span>
                </p>
                {datos.apiladas.a.some((v) => v > 0) || datos.apiladas.b.some((v) => v > 0) ? (
                  <Apiladas serie={datos.apiladas} />
                ) : (
                  <Vacio texto="Aún no hay aprobaciones registradas." />
                )}
              </Caja>
              <Caja titulo="Proyectos con más correcciones" hint="Cambios pedidos por el cliente en el periodo">
                {datos.corrPorProyecto.length ? <FilasBarra filas={datos.corrPorProyecto} color="var(--rs3)" /> : <Vacio texto="Sin correcciones pedidas en el periodo. 🎉" />}
                {datos.piezaTop ? (
                  <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">La pieza con más idas y vueltas: <b className="text-foreground">{datos.piezaTop}</b>.</p>
                ) : null}
              </Caja>
            </div>
            <Caja className="mt-2.5" titulo="Por proyecto" hint="El pulso de cada proyecto activo en el periodo">
              {datos.tablaEntregas.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-[11.5px]">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-2 py-1.5 font-bold">Proyecto</th>
                        <Th r>Piezas</Th><Th r>Aprobadas</Th><Th r>En curso</Th><Th r>Correcciones</Th><Th r>Versiones/pieza</Th><Th r>Días a aprobar</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.tablaEntregas.map((f) => (
                        <tr key={f.label} className="border-b border-border last:border-0">
                          <td className="px-2 py-1.5"><Semaforo tono={f.tono} /> {f.label}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{f.piezas}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{f.aprobadas}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{f.enCurso}</td>
                          <td className="px-2 py-1.5 text-right">{f.correcciones ? <Pill tono="warn">{f.correcciones}</Pill> : "—"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{f.versionesTxt}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{f.diasTxt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Vacio texto="No hay proyectos activos con entregables." />
              )}
            </Caja>
          </>
        ) : null}

        {caso === "equipo" ? (
          <>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setPersona(null)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
                  !personaSel ? "border-transparent bg-primary/10 font-semibold text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                👥 Todo el equipo
              </button>
              {datos.personas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPersona(p.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    personaSel?.id === p.id ? "border-transparent bg-primary/10 font-semibold text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <UserAvatar initials={p.ini} color={p.color} size="sm" className="size-4" />
                  {p.nombre.split(" ")[0]}
                </button>
              ))}
            </div>

            {personaSel ? (
              <DrillPersona p={personaSel} cumpl={cumplPersona(personaSel.id)} canCumpl={datos.canCumpl} onCerrar={() => setPersona(null)} />
            ) : (
              <>
                <div className="grid gap-2.5 lg:grid-cols-2">
                  <Caja titulo="Horas del periodo por persona" hint="Tiempo imputado en tareas · clic abre su detalle">
                    {datos.personas.some((p) => p.horas > 0) ? (
                      <div className="flex flex-col gap-1.5">
                        {datos.personas.filter((p) => p.horas > 0).map((p) => (
                          <FilaPersonaBarra key={p.id} p={p} max={Math.max(...datos.personas.map((x) => x.horas), 1)} valor={p.horas} sufijo=" h" color="var(--rs2)" onClick={() => setPersona(p.id)} />
                        ))}
                      </div>
                    ) : (
                      <Vacio texto="Sin horas registradas en el periodo." />
                    )}
                  </Caja>
                  <Caja titulo="Carga actual" hint="Tareas abiertas asignadas hoy (no depende del periodo)">
                    {datos.personas.some((p) => p.carga > 0) ? (
                      <div className="flex flex-col gap-1.5">
                        {[...datos.personas].sort((a, b) => b.carga - a.carga).filter((p) => p.carga > 0).map((p) => {
                          const max = Math.max(...datos.personas.map((x) => x.carga), 1);
                          return <FilaPersonaBarra key={p.id} p={p} max={max} valor={p.carga} color={max > 3 && p.carga >= max * 0.85 ? "var(--rs3)" : "var(--rs1)"} onClick={() => setPersona(p.id)} />;
                        })}
                      </div>
                    ) : (
                      <Vacio texto="Nadie tiene tareas abiertas asignadas." />
                    )}
                  </Caja>
                </div>
                {datos.canCumpl ? (
                  <Caja className="mt-2.5" titulo="Cumplimiento del equipo" hint="Tareas con fecha del periodo: a tiempo · tarde · vencidas">
                    {datos.cumplimiento.length ? <FilasCumplimiento filas={datos.cumplimiento} onPersona={(id) => setPersona(id)} /> : <Vacio texto="Sin tareas con fecha de entrega en el periodo." />}
                  </Caja>
                ) : null}
              </>
            )}
          </>
        ) : null}

        {caso === "clientes" ? (
          <>
            <Caja titulo="Ranking de cuentas" hint="Clic en una fila para ver el porqué del semáforo">
              {datos.clientes.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-[11.5px]">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-2 py-1.5 font-bold">Cliente</th>
                        <th className="px-2 py-1.5 font-bold">Videos del compromiso</th>
                        <Th r>Corr.</Th><Th r>Horas</Th>
                        {datos.canFin ? <Th r>Cobrado / facturado</Th> : null}
                        <th className="px-2 py-1.5 font-bold">Salud</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.clientes.map((c) => (
                        <tr key={c.id} onClick={() => setCliente(c.id)} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40">
                          <td className="px-2 py-2 font-medium">{c.emoji} {c.nombre}</td>
                          <td className="px-2 py-2">
                            <span className="mr-1.5 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-muted align-middle">
                              <span className="block h-full rounded-full" style={{ width: `${c.total ? (c.hechos / c.total) * 100 : 0}%`, background: "var(--rs2)" }} />
                            </span>
                            <span className="tabular-nums text-muted-foreground">{c.hechos}/{c.total}</span>
                          </td>
                          <td className="px-2 py-2 text-right">{c.correcciones ? <Pill tono="warn">{c.correcciones}</Pill> : "—"}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{c.horas} h</td>
                          {datos.canFin ? (
                            <td className="px-2 py-2 text-right tabular-nums">
                              {c.dineroTxt}{c.pctCobrado !== null ? <span className="text-muted-foreground"> ({c.pctCobrado}%)</span> : null}
                            </td>
                          ) : null}
                          <td className="px-2 py-2 whitespace-nowrap"><Semaforo tono={c.salud} /> <span className="text-[10.5px] text-muted-foreground">{c.salud === "ok" ? "Sana" : c.salud === "warn" ? "Atender" : "En riesgo"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Vacio texto="No hay cuentas activas con trabajo." />
              )}
            </Caja>
            {clienteSel ? <DrillCliente c={clienteSel} canFin={datos.canFin} onCerrar={() => setCliente(null)} /> : null}
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
              Salud = entregas al día + sin correcciones estancadas{datos.canFin ? " + cartera sana" : ""}. El trabajo de cada cuenta se gestiona en su ficha.
            </p>
          </>
        ) : null}

        {caso === "finanzas" && datos.canFin ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3">{datos.kpisFinanzas.map((k) => <KpiTile key={k.l} k={k} />)}</div>
            <div className="mt-2.5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
              <Landmark className="size-6 shrink-0 text-muted-foreground" />
              <div className="min-w-52 flex-1">
                <p className="text-[12.5px] font-semibold">El detalle vive en el Centro Finanzas</p>
                <p className="text-[11px] text-muted-foreground">Cartera por edades, meta mensual, gastos, Siigo y por facturar ya están en Facturación → Resumen. Aquí solo el pulso — sin duplicar.</p>
              </div>
              <Link href="/facturacion" className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-muted">Abrir Centro Finanzas →</Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── piezas ──────────────────────────────────────────────────────────────────

function KpiFila({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
      {kpis.map((k) => <KpiTile key={k.l} k={k} />)}
    </div>
  );
}

function KpiTile({ k }: { k: Kpi }) {
  const bueno = k.dir === 1 ? !k.inv : k.dir === -1 ? !!k.inv : null;
  const sparkTono = bueno === null ? "var(--rs-dim)" : bueno ? "var(--rs2)" : "var(--rs-bad)";
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-2.5 py-2">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">{k.l}</p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <b className="text-lg tabular-nums tracking-tight">{k.v}</b>
        {k.d && k.dir === 2 ? <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-bold text-muted-foreground">{k.d}</span> : null}
        {k.d && (k.dir === 1 || k.dir === -1) ? (
          <span className={cn(
            "whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-bold",
            bueno ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400",
          )}>
            {k.dir === 1 ? "▲" : "▼"} {k.d.replace("-", "").replace("+", "")}
          </span>
        ) : null}
        {k.d && k.dir === 0 ? <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-bold text-muted-foreground">{k.d}</span> : null}
      </p>
      {k.sp ? <Spark v={k.sp} tono={sparkTono} /> : null}
    </div>
  );
}

function Caja({ titulo, hint, children, className }: { titulo: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-border bg-card p-3.5", className)}>
      <h3 className="text-[12.5px] font-semibold">{titulo}</h3>
      {hint ? <p className="mb-2.5 mt-0.5 text-[10.5px] text-muted-foreground">{hint}</p> : <div className="mb-2.5" />}
      {children}
    </section>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p className="py-4 text-center text-[11.5px] text-muted-foreground">{texto}</p>;
}

function Th({ children, r }: { children: React.ReactNode; r?: boolean }) {
  return <th className={cn("px-2 py-1.5 font-bold", r && "text-right")}>{children}</th>;
}

function Pill({ tono, children }: { tono: "warn" | "ok" | "bad"; children: React.ReactNode }) {
  return (
    <span className={cn(
      "rounded-full px-2 py-px text-[10.5px] font-semibold tabular-nums",
      tono === "warn" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      tono === "ok" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
      tono === "bad" && "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    )}>
      {children}
    </span>
  );
}

function Semaforo({ tono }: { tono: "ok" | "warn" | "bad" }) {
  return (
    <span
      aria-label={tono === "ok" ? "Sana" : tono === "warn" ? "Atender" : "En riesgo"}
      className={cn(
        "mr-0.5 inline-block size-2 rounded-full align-[-0.5px]",
        tono === "ok" && "bg-emerald-500", tono === "warn" && "bg-amber-500", tono === "bad" && "bg-rose-500",
      )}
    />
  );
}

function FilasBarra({ filas, color }: { filas: FilaBarra[]; color: string }) {
  const max = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <div className="flex flex-col gap-1.5">
      {filas.map((f) => (
        <div key={f.label} className="flex items-center gap-2 text-[11.5px]">
          <span className="w-40 flex-none truncate sm:w-48" title={f.label}>{f.label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full" style={{ width: `${(f.valor / max) * 100}%`, background: color }} />
          </span>
          <span className="w-12 flex-none text-right text-[11px] tabular-nums text-muted-foreground">{f.valor}{f.sufijo ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

function FilaPersonaBarra({ p, max, valor, sufijo, color, onClick }: { p: PersonaReporte; max: number; valor: number; sufijo?: string; color: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-mx-1 flex items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11.5px] transition-colors hover:bg-muted/60">
      <span className="flex w-32 flex-none items-center gap-1.5 truncate sm:w-40">
        <UserAvatar initials={p.ini} color={p.color} size="sm" className="size-4.5" />
        <span className="truncate">{p.nombre.split(" ")[0]}</span>
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full" style={{ width: `${(valor / max) * 100}%`, background: color }} />
      </span>
      <span className="w-12 flex-none text-right text-[11px] tabular-nums text-muted-foreground">{valor}{sufijo ?? ""}</span>
    </button>
  );
}

function FilasCumplimiento({ filas, onPersona }: { filas: FilaCumplimiento[]; onPersona: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {filas.map((r) => {
        const t = Math.max(1, r.ok + r.tarde + r.venc);
        const tone = r.pct === null ? "text-muted-foreground" : r.pct >= 85 ? "text-emerald-600 dark:text-emerald-400" : r.pct >= 60 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400";
        return (
          <button key={r.id} type="button" onClick={() => onPersona(r.id)} title={`${r.ok} a tiempo · ${r.tarde} tarde · ${r.venc} vencidas`} className="-mx-1 flex items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11.5px] transition-colors hover:bg-muted/60">
            <span className="flex w-32 flex-none items-center gap-1.5 truncate sm:w-40">
              <UserAvatar initials={r.ini} color={r.color} size="sm" className="size-4.5" />
              <span className="truncate">{r.nombre.split(" ")[0]}</span>
            </span>
            <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="h-full" style={{ width: `${(r.ok / t) * 100}%`, background: "var(--rs2)" }} />
              <span className="h-full" style={{ width: `${(r.tarde / t) * 100}%`, background: "var(--rs3)" }} />
              <span className="h-full" style={{ width: `${(r.venc / t) * 100}%`, background: "var(--rs-bad)" }} />
            </span>
            <span className="hidden w-20 flex-none text-right text-[10.5px] tabular-nums text-muted-foreground sm:block">{r.ok}·{r.tarde}·{r.venc}</span>
            <span className={cn("w-10 flex-none text-right text-[11.5px] font-bold tabular-nums", tone)}>{r.pct === null ? "—" : `${r.pct}%`}</span>
          </button>
        );
      })}
    </div>
  );
}

function KpiMini({ v, l }: { v: string; l: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2.5 py-2">
      <b className="block text-base tabular-nums">{v}</b>
      <span className="text-[10px] text-muted-foreground">{l}</span>
    </div>
  );
}

function DrillPersona({ p, cumpl, canCumpl, onCerrar }: { p: PersonaReporte; cumpl: FilaCumplimiento | null; canCumpl: boolean; onCerrar: () => void }) {
  return (
    <div className="rounded-xl border border-primary/50 bg-card p-3.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="mb-2.5 flex items-center gap-2.5">
        <UserAvatar initials={p.ini} color={p.color} size="sm" className="size-7" />
        <p className="flex-1 text-[13px] font-bold">{p.nombre}</p>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">en el periodo</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
      </div>
      <div className="mb-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiMini v={`${p.horas} h`} l="registradas" />
        <KpiMini v={String(p.tareasCerradas)} l="tareas cerradas" />
        {canCumpl ? <KpiMini v={p.pctATiempo === null ? "—" : `${p.pctATiempo}%`} l="a tiempo" /> : null}
        <KpiMini v={String(p.piezas)} l="piezas trabajadas" />
      </div>
      {canCumpl && cumpl ? (
        <p className="mb-2.5 text-[11.5px] text-muted-foreground">
          Con fecha en el periodo: <b className="text-emerald-600 dark:text-emerald-400">{cumpl.ok} a tiempo</b> · <b className="text-amber-600 dark:text-amber-400">{cumpl.tarde} tarde</b> · <b className="text-rose-600 dark:text-rose-400">{cumpl.venc} vencidas</b>
        </p>
      ) : null}
      {p.porProyecto.length ? (
        <>
          <h4 className="mb-1.5 text-[11.5px] font-semibold">Sus horas por proyecto</h4>
          <FilasBarra filas={p.porProyecto} color="var(--rs2)" />
        </>
      ) : (
        <Vacio texto="Sin horas registradas en el periodo." />
      )}
    </div>
  );
}

function DrillCliente({ c, canFin, onCerrar }: { c: FilaCliente; canFin: boolean; onCerrar: () => void }) {
  return (
    <div className="mt-2.5 rounded-xl border border-primary/50 bg-card p-3.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="text-lg" aria-hidden>{c.emoji}</span>
        <p className="flex-1 text-[13px] font-bold">{c.nombre}</p>
        <Pill tono={c.salud === "ok" ? "ok" : c.salud}>{c.salud === "ok" ? "Cuenta sana" : c.salud === "warn" ? "Atender" : "En riesgo"}</Pill>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
      </div>
      <div className="mb-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiMini v={`${c.hechos}/${c.total}`} l="videos entregados" />
        <KpiMini v={String(c.correcciones)} l="correcciones abiertas" />
        <KpiMini v={`${c.horas} h`} l="horas del periodo" />
        {canFin ? <KpiMini v={c.pctCobrado === null ? "—" : `${c.pctCobrado}%`} l="cobrado de lo facturado" /> : null}
      </div>
      <p className="text-[11.5px] text-muted-foreground">{c.salud === "ok" ? "✓" : "⚠"} {c.motivo}</p>
      <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <Link href={`/clientes/${c.id}`} className="rounded-md border border-border px-2.5 py-1 text-[11.5px] font-medium text-foreground hover:bg-muted">Abrir la ficha del cliente →</Link>
        El semáforo dice el porqué; el trabajo se gestiona en la ficha.
      </p>
    </div>
  );
}

// ── CSV del caso visible ────────────────────────────────────────────────────
function exportarCsv(caso: CasoKey, d: ReporteDatos) {
  const esc = (x: string | number) => `"${String(x).replaceAll('"', '""')}"`;
  const fila = (xs: (string | number)[]) => xs.map(esc).join(";");
  let nombre = caso;
  let lineas: string[] = [];
  if (caso === "estudio") {
    lineas = [fila(["Indicador", "Valor", "Delta"]), ...d.kpis.map((k) => fila([k.l, k.v, k.d ?? ""]))];
  } else if (caso === "entregas") {
    lineas = [
      fila(["Proyecto", "Piezas", "Aprobadas", "En curso", "Correcciones", "Versiones/pieza", "Días a aprobar"]),
      ...d.tablaEntregas.map((f) => fila([f.label, f.piezas, f.aprobadas, f.enCurso, f.correcciones, f.versionesTxt, f.diasTxt])),
    ];
  } else if (caso === "equipo") {
    lineas = [
      fila(["Persona", "Horas", "Tareas cerradas", "% a tiempo", "Piezas trabajadas", "Carga actual"]),
      ...d.personas.map((p) => fila([p.nombre, p.horas, p.tareasCerradas, p.pctATiempo ?? "", p.piezas, p.carga])),
    ];
  } else if (caso === "clientes") {
    lineas = [
      fila(["Cliente", "Videos hechos", "Videos total", "Correcciones", "Horas", ...(d.canFin ? ["Cobrado/facturado", "% cobrado"] : []), "Salud", "Motivo"]),
      ...d.clientes.map((c) => fila([c.nombre, c.hechos, c.total, c.correcciones, c.horas, ...(d.canFin ? [c.dineroTxt ?? "", c.pctCobrado ?? ""] : []), c.salud, c.motivo])),
    ];
  } else {
    lineas = [fila(["Indicador", "Valor", "Detalle"]), ...d.kpisFinanzas.map((k) => fila([k.l, k.v, k.d ?? ""]))];
    nombre = "finanzas";
  }
  // BOM para que Excel abra el UTF-8 con tildes bien.
  const blob = new Blob(["﻿" + lineas.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `reportes-${nombre}-${d.periodo.etiqueta.replaceAll(" ", "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
