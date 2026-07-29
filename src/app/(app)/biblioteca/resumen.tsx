import Link from "next/link";

// Franja de resumen de la Biblioteca: lo que antes había que averiguar entrando a las tres
// pestañas de una en una («¿cuánto espacio queda?», «¿hay material sin respaldo?»).
// Cada dato que se puede accionar es un enlace a la pestaña donde se arregla.

export type ResumenDato = {
  k: string;
  v: string;
  pie?: string | null;
  tono?: "ink" | "good" | "warn" | "bad";
  href?: string | null;
};

const TONO: Record<string, string> = {
  ink: "",
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

export function Resumen({ datos }: { datos: ResumenDato[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {datos.map((d) => {
        const cuerpo = (
          <>
            <p className="truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {d.k}
            </p>
            <p className={`mt-0.5 text-2xl font-bold tabular-nums tracking-tight ${TONO[d.tono ?? "ink"]}`}>{d.v}</p>
            {d.pie ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{d.pie}</p> : null}
          </>
        );
        return d.href ? (
          <Link
            key={d.k}
            href={d.href}
            className="rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
          >
            {cuerpo}
          </Link>
        ) : (
          <div key={d.k} className="rounded-xl border border-border bg-card px-4 py-3">
            {cuerpo}
          </div>
        );
      })}
    </div>
  );
}
