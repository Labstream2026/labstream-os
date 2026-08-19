import Link from "next/link";
import { Hourglass } from "lucide-react";
import { db } from "@/lib/db";
import { ventanaHoyBogota, minutosTxt } from "@/lib/cierre/datos";

// El empujón hacia «Cerrar el día»: aparece SOLO cuando el sensor midió hoy más de lo que
// está anotado (≥ 1 h de diferencia) y ya es tarde en Bogotá (desde las 4 pm) — cerrar el
// día a las 9 am no tiene sentido y el aviso sería ruido perpetuo. Autoservicio del propio
// usuario: nada de permisos.

export async function AvisoCierre({ userId }: { userId: string }) {
  const ahora = new Date();
  const horaBogota = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hour12: false }).format(ahora));
  if (horaBogota < 16) return null;

  const { desde, hasta, noon } = ventanaHoyBogota(ahora);
  const [medido, anotado] = await Promise.all([
    db.workBlock.aggregate({ where: { userId, startedAt: { gte: desde, lt: hasta } }, _sum: { seconds: true } }),
    db.timeEntry.aggregate({ where: { userId, spentOn: noon }, _sum: { minutes: true } }),
  ]);
  const restante = Math.round((medido._sum.seconds ?? 0) / 60) - (anotado._sum.minutes ?? 0);
  if (restante < 60) return null;

  return (
    <Link
      href="/mis-tareas/cierre"
      className="mt-3 flex w-fit items-center gap-2.5 rounded-xl border border-amber-300/70 bg-amber-50 px-3.5 py-2 text-sm shadow-sm transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:hover:bg-amber-500/15"
    >
      <Hourglass className="size-4 text-amber-600 dark:text-amber-400" />
      <span>
        <span className="font-semibold">Te faltan {minutosTxt(restante)} del día por anotar</span>
        <span className="text-muted-foreground"> — el sensor las midió, reparte y cierra →</span>
      </span>
    </Link>
  );
}
