import { CalendarOff, X } from "lucide-react";
import { db } from "@/lib/db";
import { UserAvatar } from "@/components/user-avatar";
import { crearAusencia, eliminarAusencia } from "./ausencias-actions";
import { AusenciaForm } from "./ausencias-form";

// ── Panel de AUSENCIAS (Ajustes → Equipo) ───────────────────────────────────
// Autocontenido: trae sus datos y pinta. Lo vigente y lo futuro arriba; lo pasado reciente
// abajo en gris, porque «¿estaba de vacaciones esa semana?» es una pregunta que se hace
// mirando hacia atrás.

const TIPO_META: Record<string, { label: string; chip: string }> = {
  VACACIONES: { label: "Vacaciones", chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  INCAPACIDAD: { label: "Incapacidad", chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  PERMISO: { label: "Permiso", chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  OTRO: { label: "Ausencia", chip: "bg-muted text-muted-foreground" },
};

const FMT = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" });
const dia = (d: Date) => FMT.format(d).replace(".", "");

export async function AusenciasPanel() {
  const hace60 = new Date(Date.now() - 60 * 86_400_000);
  const [equipo, ausencias] = await Promise.all([
    db.user.findMany({
      where: { active: true, isSystemBot: false, isGuest: false, role: { isNot: { key: "cliente" } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.absence.findMany({
      where: { endDate: { gte: hace60 } },
      orderBy: { startDate: "asc" },
      select: { id: true, tipo: true, startDate: true, endDate: true, nota: true, user: { select: { name: true, initials: true, avatarColor: true } } },
    }),
  ]);

  const hoy = new Date();
  const vigentes = ausencias.filter((a) => a.endDate >= hoy);
  const pasadas = ausencias.filter((a) => a.endDate < hoy).reverse();

  const Fila = ({ a, pasada }: { a: (typeof ausencias)[number]; pasada?: boolean }) => {
    const meta = TIPO_META[a.tipo] ?? TIPO_META.OTRO;
    const rango = a.startDate.getTime() === a.endDate.getTime() ? dia(a.startDate) : `${dia(a.startDate)} – ${dia(a.endDate)}`;
    return (
      <li className={`flex items-center gap-2.5 px-3 py-2 text-sm ${pasada ? "opacity-60" : ""}`}>
        <UserAvatar initials={a.user.initials} color={a.user.avatarColor} size="sm" className="size-6 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{a.user.name}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${meta.chip}`}>{meta.label}</span>
        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{rango}</span>
        {a.nota ? <span className="hidden max-w-40 shrink-0 truncate text-[11px] text-muted-foreground sm:inline" title={a.nota}>{a.nota}</span> : null}
        <form action={eliminarAusencia.bind(null, a.id)}>
          <button type="submit" title="Quitar" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><X className="size-3.5" /></button>
        </form>
      </li>
    );
  };

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Vacaciones, incapacidades y permisos. Registrar una ausencia hace tres cosas solas: encoge la capacidad real en la
        Carga del equipo y en las sugerencias de plantilla, exime del cumplimiento las tareas que venzan dentro, y le avisa
        a la persona.
      </p>

      <AusenciaForm equipo={equipo} accion={crearAusencia} />

      {vigentes.length ? (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {vigentes.map((a) => <Fila key={a.id} a={a} />)}
        </ul>
      ) : (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted-foreground">
          <CalendarOff className="size-4 shrink-0" /> Nadie tiene ausencias vigentes ni programadas.
        </p>
      )}

      {pasadas.length ? (
        <>
          <p className="mb-1.5 mt-5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Últimos 60 días</p>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {pasadas.map((a) => <Fila key={a.id} a={a} pasada />)}
          </ul>
        </>
      ) : null}
    </div>
  );
}
