"use client";

import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────────────────────
// RACI de Labstream
//
// Matriz didáctica e interactiva de "quién hace qué" en un proyecto audiovisual.
// RACI = Responsable · Aprobador (Accountable) · Consultado · Informado. Es el
// estándar que usan Asana, Atlassian, Smartsheet, Miro o TeamGantt para repartir
// responsabilidades. Aquí está adaptado al flujo real de Labstream (comercial →
// preproducción → rodaje → postproducción → entrega) y a los cargos del equipo.
//
// Regla de oro: UNA sola "A" (Aprobador) por fila, y siempre al menos una "R".
// ──────────────────────────────────────────────────────────────────────────────

type Letter = "R" | "A" | "C" | "I";

// Estilos por letra: pastilla sólida (en la matriz) y suave (tarjetas explicativas).
const LETTER: Record<Letter, { name: string; sub: string; solid: string; soft: string }> = {
  R: {
    name: "Responsable",
    sub: "ejecuta el trabajo",
    solid: "bg-emerald-500 text-white",
    soft: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
  },
  A: {
    name: "Aprobador",
    sub: "rinde cuentas · solo 1",
    solid: "bg-amber-500 text-white",
    soft: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900",
  },
  C: {
    name: "Consultado",
    sub: "se le pregunta antes",
    solid: "bg-violet-500 text-white",
    soft: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-900",
  },
  I: {
    name: "Informado",
    sub: "se mantiene al tanto",
    solid: "bg-sky-500 text-white",
    soft: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-900",
  },
};

// Orden en que se muestran las letras cuando se agrupan (mando primero al que decide).
const ORDER: Letter[] = ["A", "R", "C", "I"];

// Cargos del equipo (columnas). Calcados de los roles reales de Labstream.
type Role = { key: string; label: string; emoji: string };
const ROLES: Role[] = [
  { key: "cliente", label: "Cliente", emoji: "🤝" },
  { key: "gerencia", label: "Gerencia", emoji: "👔" },
  { key: "ventas", label: "Ventas", emoji: "💼" },
  { key: "productor", label: "Productor", emoji: "🎯" },
  { key: "director", label: "Director", emoji: "🎬" },
  { key: "camara", label: "Cámara", emoji: "📹" },
  { key: "edicion", label: "Edición", emoji: "✂️" },
  { key: "diseno", label: "Diseño", emoji: "🎨" },
  { key: "community", label: "Community", emoji: "📱" },
];
const ROLE_LABEL: Record<string, Role> = Object.fromEntries(ROLES.map((r) => [r.key, r]));

// Cada actividad asigna a cada cargo una letra ("RA" = Responsable y Aprobador a la vez).
type Cell = "R" | "A" | "C" | "I" | "RA";
type Activity = { id: string; name: string; note?: string; a: Partial<Record<string, Cell>> };
type Phase = { key: string; name: string; emoji: string; activities: Activity[] };

// El RACI base de Labstream. En cada fila hay exactamente UN aprobador (A o RA).
const PHASES: Phase[] = [
  {
    key: "comercial",
    name: "Comercial / Preventa",
    emoji: "💼",
    activities: [
      { id: "brief", name: "Brief y requerimientos", note: "El cliente nos cuenta qué necesita; Ventas se asegura de capturarlo completo.", a: { cliente: "R", ventas: "A", productor: "C", gerencia: "I" } },
      { id: "cotizacion", name: "Cotización y propuesta", note: "Ventas arma la cotización con apoyo de Producción/Dirección; Gerencia la aprueba.", a: { ventas: "R", gerencia: "A", productor: "C", director: "C", cliente: "I" } },
      { id: "cierre", name: "Cierre del negocio", a: { ventas: "R", gerencia: "A", cliente: "C", productor: "I" } },
    ],
  },
  {
    key: "preproduccion",
    name: "Preproducción",
    emoji: "🗒️",
    activities: [
      { id: "concepto", name: "Concepto creativo y guion", note: "La idea y el guion son del Director: los crea y responde por ellos.", a: { director: "RA", productor: "C", diseno: "C", cliente: "C", gerencia: "I" } },
      { id: "plan", name: "Plan de rodaje y cronograma", a: { productor: "RA", director: "C", camara: "C", cliente: "I" } },
      { id: "logistica", name: "Locaciones, casting y logística", a: { productor: "RA", director: "C", camara: "I", cliente: "I" } },
      { id: "presupuesto", name: "Presupuesto de producción", a: { productor: "R", gerencia: "A", ventas: "C", director: "I" } },
    ],
  },
  {
    key: "produccion",
    name: "Producción / Rodaje",
    emoji: "🎬",
    activities: [
      { id: "direccion", name: "Dirección en el set", a: { director: "RA", productor: "C", camara: "C", cliente: "I" } },
      { id: "captura", name: "Captura: cámara, luz y sonido", note: "En el set el Director aprueba la toma; Cámara la ejecuta.", a: { camara: "R", director: "A", productor: "C", diseno: "I" } },
      { id: "coordinacion", name: "Coordinación y logística en set", a: { productor: "RA", director: "C", camara: "C", cliente: "I" } },
    ],
  },
  {
    key: "postproduccion",
    name: "Postproducción",
    emoji: "✂️",
    activities: [
      { id: "edicion", name: "Edición y montaje", a: { edicion: "R", director: "A", productor: "C", cliente: "I" } },
      { id: "diseno", name: "Diseño, motion y color", a: { diseno: "R", director: "A", edicion: "C", productor: "I" } },
      { id: "revision", name: "Revisión interna (pre-aprobación)", note: "Antes de mostrarle al cliente, el equipo revisa internamente. Es bloqueante.", a: { director: "R", productor: "A", edicion: "C", diseno: "C", gerencia: "I" } },
    ],
  },
  {
    key: "entrega",
    name: "Entrega y cierre",
    emoji: "📦",
    activities: [
      { id: "aprobacion", name: "Aprobación del cliente", note: "Aquí el CLIENTE es quien aprueba: nada se entrega sin su visto bueno.", a: { cliente: "A", productor: "R", director: "C", ventas: "I" } },
      { id: "entrega-final", name: "Entrega final", a: { productor: "RA", edicion: "C", diseno: "C", cliente: "I" } },
      { id: "publicacion", name: "Publicación y redes", a: { community: "R", productor: "A", diseno: "C", cliente: "I" } },
      { id: "facturacion", name: "Cierre y facturación", a: { ventas: "R", gerencia: "A", productor: "C", cliente: "I" } },
    ],
  },
];

// "RA" → ["R","A"]; cualquier otra letra → una sola.
function letters(cell: Cell | undefined): Letter[] {
  if (!cell) return [];
  return cell === "RA" ? ["R", "A"] : [cell];
}

// Texto didáctico para una asignación concreta (cargo + letra + actividad).
function explain(letter: Letter, roleLabel: string, activity: string): string {
  switch (letter) {
    case "R":
      return `${roleLabel} ejecuta el trabajo de «${activity}». Es quien lo saca adelante.`;
    case "A":
      return `${roleLabel} rinde cuentas por «${activity}»: aprueba y responde por el resultado. Solo puede haber un Aprobador.`;
    case "C":
      return `Se consulta a ${roleLabel} antes de cerrar «${activity}»: aporta criterio o información, pero no ejecuta.`;
    case "I":
      return `${roleLabel} se mantiene informado del avance de «${activity}», sin participar en la ejecución.`;
  }
}

// Pastilla con la(s) letra(s) de una celda. Vacía → punto tenue (no participa).
function CellBadges({ cell, dim }: { cell: Cell | undefined; dim?: boolean }) {
  const ls = letters(cell);
  if (ls.length === 0) return <span className="text-muted-foreground/30">·</span>;
  return (
    <span className="inline-flex gap-0.5">
      {ls.map((l) => (
        <span
          key={l}
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-md text-xs font-bold transition-opacity",
            LETTER[l].solid,
            dim && "opacity-25",
          )}
        >
          {l}
        </span>
      ))}
    </span>
  );
}

export function RaciMatrix() {
  // Celda seleccionada (para el panel explicativo) y resaltado por fila/columna.
  const [sel, setSel] = useState<{ actId: string; roleKey: string } | null>(null);
  const [hoverRole, setHoverRole] = useState<string | null>(null);
  const [hoverAct, setHoverAct] = useState<string | null>(null);

  const selActivity = sel ? PHASES.flatMap((p) => p.activities).find((x) => x.id === sel.actId) ?? null : null;
  const selRole = sel ? ROLE_LABEL[sel.roleKey] : null;
  const selLetters = selActivity && sel ? letters(selActivity.a[sel.roleKey]) : [];

  return (
    <div className="space-y-8">
      {/* ── Encabezado / qué es RACI ── */}
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">🧭 RACI de Labstream</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          El <b>RACI</b> deja claro <b>quién hace qué</b> en cada etapa de un proyecto, para que nada se caiga entre dos
          sillas. Por cada actividad, cada cargo cumple uno de cuatro papeles. Toca cualquier celda de la matriz para ver
          qué significa.
        </p>
      </div>

      {/* ── Las 4 letras ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["R", "A", "C", "I"] as Letter[]).map((l) => (
          <div key={l} className={cn("rounded-xl border p-4", LETTER[l].soft)}>
            <div className="flex items-center gap-2">
              <span className={cn("inline-flex size-8 items-center justify-center rounded-lg text-base font-bold", LETTER[l].solid)}>{l}</span>
              <div className="leading-tight">
                <p className="text-sm font-semibold">{LETTER[l].name}</p>
                <p className="text-xs opacity-80">{LETTER[l].sub}</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed opacity-90">
              {l === "R" && "Quien pone manos a la obra. Saca adelante la tarea. Puede haber varios."}
              {l === "A" && "Quien responde por el resultado y da el visto bueno. Debe haber uno y solo uno por tarea."}
              {l === "C" && "A quien se le pide opinión o información antes de cerrar. Conversación de ida y vuelta."}
              {l === "I" && "A quien se le avisa del avance o del resultado. Comunicación de una sola vía."}
            </p>
          </div>
        ))}
      </div>

      {/* ── Reglas de oro ── */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          "Una sola «A» por fila: un único dueño que rinde cuentas.",
          "Siempre al menos una «R»: alguien tiene que ejecutar.",
          "Pocas «C» (para no trabar la decisión), suficientes «I».",
        ].map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1.5 font-medium text-muted-foreground">
            <span className="text-amber-500">★</span>
            {t}
          </span>
        ))}
      </div>

      {/* ── Matriz (escritorio) ── */}
      <div className="hidden sm:block">
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="sticky left-0 z-10 min-w-[15rem] bg-muted/40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actividad
                </th>
                {ROLES.map((r) => (
                  <th
                    key={r.key}
                    onMouseEnter={() => setHoverRole(r.key)}
                    onMouseLeave={() => setHoverRole(null)}
                    className={cn(
                      "px-2 py-3 text-center align-bottom transition-colors",
                      hoverRole === r.key && "bg-accent",
                    )}
                  >
                    <div className="text-base leading-none">{r.emoji}</div>
                    <div className="mt-1 text-[11px] font-semibold leading-tight">{r.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PHASES.map((phase) => (
                <Fragment key={phase.key}>
                  <tr>
                    <td
                      colSpan={ROLES.length + 1}
                      className="sticky left-0 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"
                    >
                      <span className="mr-1.5">{phase.emoji}</span>
                      {phase.name}
                    </td>
                  </tr>
                  {phase.activities.map((act) => {
                    const rowOn = hoverAct === act.id;
                    return (
                      <tr
                        key={act.id}
                        onMouseEnter={() => setHoverAct(act.id)}
                        onMouseLeave={() => setHoverAct(null)}
                        className={cn("border-t border-border", rowOn && "bg-accent/40")}
                      >
                        <th
                          scope="row"
                          className={cn(
                            "sticky left-0 z-10 px-4 py-2.5 text-left text-sm font-medium transition-colors",
                            rowOn ? "bg-accent/40" : "bg-card",
                          )}
                        >
                          {act.name}
                        </th>
                        {ROLES.map((r) => {
                          const cell = act.a[r.key];
                          const isSel = sel?.actId === act.id && sel?.roleKey === r.key;
                          const colOn = hoverRole === r.key;
                          return (
                            <td
                              key={r.key}
                              onMouseEnter={() => setHoverRole(r.key)}
                              onMouseLeave={() => setHoverRole(null)}
                              onClick={() => cell && setSel(isSel ? null : { actId: act.id, roleKey: r.key })}
                              title={cell ? `${ROLE_LABEL[r.key].label} · ${act.name}` : undefined}
                              className={cn(
                                "px-2 py-2.5 text-center transition-colors",
                                cell && "cursor-pointer",
                                colOn && "bg-accent/60",
                                isSel && "bg-primary/10 ring-2 ring-inset ring-primary",
                              )}
                            >
                              <CellBadges cell={cell} dim={!!hoverRole && !colOn} />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Matriz (móvil): tarjeta por actividad ── */}
      <div className="space-y-6 sm:hidden">
        {PHASES.map((phase) => (
          <div key={phase.key}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span className="mr-1.5">{phase.emoji}</span>
              {phase.name}
            </h3>
            <div className="space-y-2">
              {phase.activities.map((act) => {
                // Un chip por cargo con papel en la actividad (el rol combinado "RA" se muestra
                // junto en el mismo chip). Orden por el papel más fuerte: A → R → C → I.
                const entries = ROLES.flatMap((r) => {
                  const ls = letters(act.a[r.key]);
                  if (!ls.length) return [];
                  const sorted = [...ls].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
                  return [{ role: r, ls: sorted, rank: ORDER.indexOf(sorted[0]) }];
                }).sort((a, b) => a.rank - b.rank);
                return (
                  <div key={act.id} className="rounded-xl border border-border bg-card p-3">
                    <p className="text-sm font-semibold">{act.name}</p>
                    {act.note ? <p className="mt-0.5 text-xs text-muted-foreground">{act.note}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {entries.map(({ role, ls }) => (
                        <span key={role.key} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", LETTER[ls[0]].soft)}>
                          {ls.map((l) => (
                            <span key={l} className={cn("inline-flex size-4 items-center justify-center rounded text-[10px] font-bold", LETTER[l].solid)}>{l}</span>
                          ))}
                          {role.emoji} {role.label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Panel explicativo de la celda seleccionada ── */}
      <div className="hidden sm:block">
        {selActivity && selRole ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {selRole.emoji} {selRole.label} · {selActivity.name}
                </p>
                <div className="mt-2 space-y-2">
                  {selLetters.map((l) => (
                    <div key={l} className="flex items-start gap-2">
                      <span className={cn("mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold", LETTER[l].solid)}>{l}</span>
                      <p className="text-sm">{explain(l, selRole.label, selActivity.name)}</p>
                    </div>
                  ))}
                </div>
                {selActivity.note ? <p className="mt-3 border-t border-primary/20 pt-2 text-xs text-muted-foreground">💡 {selActivity.note}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setSel(null)}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
            👆 Toca cualquier celda de la matriz para ver qué papel cumple ese cargo en esa actividad.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Esta es la guía base de Labstream. En cada proyecto el RACI se ajusta según el equipo asignado y el tipo de
        entregable; tómalo como punto de partida, no como camisa de fuerza.
      </p>
    </div>
  );
}
