import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { crearLlamado } from "./llamado/actions";

// ── La franja de HOJAS DE LLAMADO en el Calendario del proyecto ─────────────
// Lista las hojas existentes (con su termómetro de confirmaciones) y crea una nueva para
// una fecha. Vive encima del calendario porque el llamado ES un asunto de fecha.
export async function LlamadosStrip({ projectId, gestiona }: { projectId: string; gestiona: boolean }) {
  const sheets = await db.callSheet.findMany({
    where: { projectId },
    orderBy: { fecha: "desc" },
    take: 12,
    select: {
      id: true, fecha: true, titulo: true, estado: true, citacionGeneral: true,
      personas: { select: { confirmadoAt: true } },
    },
  });
  if (!sheets.length && !gestiona) return null;

  const FECHA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short" });
  const hoyYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <ClipboardList className="size-4 text-muted-foreground" /> Hojas de llamado
        </p>
        {gestiona ? (
          <form action={crearLlamado.bind(null, projectId)} className="ml-auto flex items-center gap-1.5">
            <input
              type="date" name="fecha" required defaultValue={hoyYmd}
              className="rounded-md border border-input bg-background px-2 py-1 text-[12px] tabular-nums outline-none focus:ring-2 focus:ring-ring"
              aria-label="Fecha del rodaje"
            />
            <button className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90">
              <Plus className="size-3.5" /> Nueva hoja
            </button>
          </form>
        ) : null}
      </div>
      {sheets.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {sheets.map((s) => {
            const n = s.personas.length;
            const conf = s.personas.filter((p) => p.confirmadoAt).length;
            return (
              <li key={s.id}>
                <Link
                  href={`/proyectos/${projectId}/llamado/${s.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[12.5px] hover:bg-accent"
                >
                  <span className="font-medium capitalize">{FECHA.format(s.fecha).replace(".", "")}</span>
                  {s.citacionGeneral ? <span className="tabular-nums text-muted-foreground">{s.citacionGeneral}</span> : null}
                  <span className="truncate text-muted-foreground">{s.titulo ?? "Rodaje"}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${s.estado === "ENVIADA" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                    {s.estado === "ENVIADA" ? `${conf}/${n} ✓` : "borrador"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Elige la fecha del rodaje y crea la primera: nace pre-llenada con el equipo del proyecto, el plan de equipos de ese día y la locación del evento del calendario.
        </p>
      )}
    </div>
  );
}
