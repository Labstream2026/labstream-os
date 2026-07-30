"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, CalendarClock, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { MenuBarra, MenuGrupo, MenuOpcion } from "@/components/ui/barra-menu";
import { bulkSetStatus, bulkPostpone, bulkToMyDay, type ResultadoLote } from "./bulk-actions";

// ── Marcar varias tareas y actuar sobre todas (extra 8) ────────────────────────
// «Posponer nueve tareas una semana» eran nueve gestos: abrir el selector de fecha de cada fila,
// elegir el día, esperar. Con la casilla en la fila, uno.
//
// Mismo patrón que la selección de /revisiones (casilla en la fila + barra flotante abajo), para
// que se aprenda una sola vez.

type Ctx = {
  ids: Set<string>;
  marcadas: Set<string>;
  toggle: (id: string) => void;
};
const SeleccionCtx = React.createContext<Ctx | null>(null);

export function SeleccionProvider({
  ids,
  statusOptions,
  children,
}: {
  // Ids de las tareas VISIBLES ahora mismo. Lo marcado se resuelve contra esta lista, así que si
  // una tarea deja de estar a la vista (otro filtro, otra pestaña) simplemente no entra en el lote
  // — sin tener que limpiar el estado en un efecto.
  ids: string[];
  statusOptions: { value: string; label: string }[];
  children: React.ReactNode;
}) {
  const [marcadas, setMarcadas] = React.useState<Set<string>>(() => new Set());
  const visibles = React.useMemo(() => new Set(ids), [ids]);
  const toggle = React.useCallback((id: string) => {
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const ctx = React.useMemo(() => ({ ids: visibles, marcadas, toggle }), [visibles, marcadas, toggle]);
  const enLote = React.useMemo(() => [...marcadas].filter((id) => visibles.has(id)), [marcadas, visibles]);

  // El aviso del resultado vive AQUÍ y no en la barra: al terminar se quitan las marcas, y si el
  // aviso viviera dentro de la barra se iría con ella justo cuando hay algo que decir.
  const [aviso, setAviso] = React.useState<{ ok: boolean; text: string } | null>(null);

  return (
    <SeleccionCtx.Provider value={ctx}>
      {children}
      {enLote.length || aviso ? (
        <BarraLote
          ids={enLote}
          statusOptions={statusOptions}
          onLimpiar={() => setMarcadas(new Set())}
          aviso={aviso}
          setAviso={setAviso}
        />
      ) : null}
    </SeleccionCtx.Provider>
  );
}

// Casilla de una fila. Devuelve null si la página no está envuelta por el proveedor (p. ej. la
// pestaña de Completadas, donde el lote no aplica).
export function CasillaTarea({ id }: { id: string }) {
  const ctx = React.useContext(SeleccionCtx);
  if (!ctx) return null;
  const marcada = ctx.marcadas.has(id);
  return (
    <label
      className={cn(
        "flex size-4 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors",
        marcada
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-transparent hover:border-primary/60",
      )}
      title={marcada ? "Quitar de la selección" : "Marcar para cambiar estado, posponer o llevar a Mi día en lote"}
    >
      <input
        type="checkbox"
        checked={marcada}
        onChange={() => ctx.toggle(id)}
        className="absolute size-4 cursor-pointer opacity-0"
        aria-label={marcada ? "Quitar de la selección" : "Marcar esta tarea"}
      />
      <Check className="size-3" />
    </label>
  );
}

function BarraLote({
  ids,
  statusOptions,
  onLimpiar,
  aviso,
  setAviso,
}: {
  ids: string[];
  statusOptions: { value: string; label: string }[];
  onLimpiar: () => void;
  aviso: { ok: boolean; text: string } | null;
  setAviso: (a: { ok: boolean; text: string } | null) => void;
}) {
  const router = useRouter();
  const [pendiente, empezar] = React.useTransition();

  function correr(fn: () => Promise<ResultadoLote>, verbo: string) {
    setAviso(null);
    empezar(async () => {
      const r = await fn();
      if (!r.ok) {
        setAviso({ ok: false, text: r.error ?? "No se pudo completar." });
        return;
      }
      // Se dice el número REAL, y por qué se quedaron fuera las demás: una tarea bloqueada o
      // una cuya fecha fija otra persona se omite, y callarlo haría creer que sí se movió.
      const cola = r.omitidas > 0 ? ` · ${r.omitidas} sin cambiar (bloqueadas o de otra persona)` : "";
      setAviso({ ok: true, text: `${verbo} ${r.hechas} ${r.hechas === 1 ? "tarea" : "tareas"}${cola}.` });
      onLimpiar();
      router.refresh();
    });
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-4">
      <div className="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {ids.length === 0 ? (
          // Sin nada marcado la barra solo existe para dejar leído el resultado.
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className={cn("text-sm", aviso?.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              {aviso?.text}
            </span>
            <button
              type="button"
              onClick={() => setAviso(null)}
              className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {ids.length} {ids.length === 1 ? "marcada" : "marcadas"}
            </span>

            <MenuBarra etiqueta="Posponer" icono={<CalendarClock />} titulo="Empujar la fecha de entrega">
              <MenuGrupo>Empujar la entrega</MenuGrupo>
              <MenuOpcion marca={false} onClick={() => correr(() => bulkPostpone(ids, 1), "Pospuestas")}>Un día</MenuOpcion>
              <MenuOpcion marca={false} onClick={() => correr(() => bulkPostpone(ids, 7), "Pospuestas")} pista="+7 d">Una semana</MenuOpcion>
              <MenuOpcion marca={false} onClick={() => correr(() => bulkPostpone(ids, 30), "Pospuestas")} pista="+30 d">Un mes</MenuOpcion>
              <MenuGrupo>Traer para acá</MenuGrupo>
              <MenuOpcion marca={false} onClick={() => correr(() => bulkPostpone(ids, -1), "Adelantadas")}>Un día antes</MenuOpcion>
              <MenuOpcion marca={false} onClick={() => correr(() => bulkPostpone(ids, -7), "Adelantadas")}>Una semana antes</MenuOpcion>
            </MenuBarra>

            {statusOptions.length ? (
              <MenuBarra etiqueta="Estado" titulo="Cambiar el estado de todas">
                <MenuGrupo>Ponerlas en</MenuGrupo>
                {statusOptions.map((o) => (
                  <MenuOpcion key={o.value} marca={false} onClick={() => correr(() => bulkSetStatus(ids, o.value), "Cambiadas")}>
                    {o.label}
                  </MenuOpcion>
                ))}
              </MenuBarra>
            ) : null}

            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => bulkToMyDay(ids), "Llevadas a Mi día")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
              title="Añadirlas al enfoque de hoy"
            >
              <Star className="size-3.5" /> A Mi día
            </button>

            {pendiente ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}

            <button
              type="button"
              onClick={onLimpiar}
              className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Quitar la selección"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {ids.length > 0 && aviso ? (
          <p className={cn("border-t border-border px-3 py-2 text-xs", aviso.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
            {aviso.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
