import { db } from "@/lib/db";
import { hasPermission } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";
import { canAccessProject } from "@/lib/project-access";
import { getTaskLabels } from "@/lib/workflow-labels";
import { tone } from "@/lib/colors";
import { TeamTasksBoard, type TeamTask } from "./team-tasks-board";
import { capacidadSemana, festivosDeVentana, repartirCarga, semanasDesde, type EventoCarga } from "@/lib/carga/semanal";

// Compilado de TAREAS DEL EQUIPO para el Inicio: todas las tareas ABIERTAS (estado no "hecho")
// agrupadas por responsable, interactivo (reasignar + cambiar fecha de entrega). Respeta la
// privacidad: solo muestra tareas de proyectos accesibles (admin ve todo). El que lo llama
// debe gatear con ver_reportes (igual que Desempeño del equipo).
export async function TeamTasks({ session }: { session: SessionUser | null }) {
  const { statuses } = await getTaskLabels();
  const openKeys = statuses.filter((s) => !s.isDone).map((s) => s.key);
  const statusMetaMap = new Map(statuses.map((s) => [s.key, { label: s.label, chip: tone(s.color).chip }]));

  const projAccess = { id: true, name: true, emoji: true, isPrivate: true, leadId: true, members: { select: { userId: true } } } as const;
  const [team, rows] = await Promise.all([
    db.user.findMany({
      where: { active: true, isSystemBot: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, initials: true, avatarColor: true, weeklyCapacityHours: true, role: { select: { key: true } } },
    }),
    db.task.findMany({
      where: { status: { in: openKeys } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 1000,
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        dueDate: true,
        dueTime: true,
        assigneeId: true,
        isPrivate: true,
        ownerId: true,
        projectId: true,
        estimatedMinutes: true,
        project: { select: projAccess },
      },
    }),
  ]);

  // Citas y rodajes de la ventana (4 semanas): encogen la capacidad real de cada semana.
  // Quien DECLINÓ la invitación no está comprometido y no descuenta.
  const semanas = semanasDesde(new Date(), 4);
  const finVentana = new Date(`${semanas[semanas.length - 1]}T12:00:00.000Z`);
  finVentana.setUTCDate(finVentana.getUTCDate() + 7);
  const eventosDb = await db.calendarEvent.findMany({
    where: { start: { gte: new Date(`${semanas[0]}T00:00:00.000Z`), lt: finVentana } },
    select: { start: true, end: true, allDay: true, attendees: { select: { userId: true, status: true } } },
  });
  const eventos: EventoCarga[] = eventosDb.flatMap((e) =>
    e.attendees
      .filter((a) => a.status !== "DECLINED")
      .map((a) => ({ userId: a.userId, start: e.start, end: e.end, allDay: e.allDay })),
  );
  // Ausencias que tocan la ventana: encogen la capacidad real (una semana de vacaciones = 0 h).
  const ausenciasDb = await db.absence.findMany({
    where: { endDate: { gte: new Date(`${semanas[0]}T00:00:00.000Z`) }, startDate: { lt: finVentana } },
    select: { userId: true, startDate: true, endDate: true },
  });
  const ymdBog = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
  const ausencias = ausenciasDb.map((a) => ({ userId: a.userId, desde: ymdBog(a.startDate), hasta: ymdBog(a.endDate) }));

  const isAdmin = session?.role === "admin";
  const mine = (t: { ownerId: string | null; assigneeId: string | null }) => t.ownerId === session?.id || t.assigneeId === session?.id;
  // Privacidad: admin ve todo; el resto solo tareas de proyectos accesibles (o personales suyas).
  const visible = rows.filter((t) => {
    if (isAdmin) return true;
    if (!t.project) return mine(t);
    if (t.isPrivate && !mine(t)) return false;
    return canAccessProject(t.project, session) || mine(t);
  });

  const tasks: TeamTask[] = visible.map((t) => {
    const meta = statusMetaMap.get(t.status);
    return {
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      projectName: t.project?.name ?? null,
      projectEmoji: t.project?.emoji ?? null,
      assigneeId: t.assigneeId,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      dueTime: t.dueTime ?? null,
      statusLabel: meta?.label ?? t.status,
      statusClass: meta?.chip ?? "bg-muted text-muted-foreground",
    };
  });

  const members = team.map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }));
  const canReassign = hasPermission(session, "editar_tareas");
  const canEditDates = hasPermission(session, "gestionar_cronograma");

  // ── CARGA DEL EQUIPO, por semana ──
  // La versión vieja sumaba TODO lo abierto (lo de mañana y lo de octubre) contra la
  // capacidad de UNA semana: todo el mundo daba 200 % y el semáforo dejó de decir nada. El
  // reparto real vive en lib/carga/semanal (probado): minutos repartidos entre inicio y
  // entrega, lo vencido amontonado en la semana actual, y capacidad encogida por festivos y
  // rodajes. Aparece TODO el equipo, incluido quien está libre — «¿quién puede tomar el
  // rodaje del martes?» se responde mirando, no preguntando por chat.
  const festivos = festivosDeVentana(semanas);
  const carga = repartirCarga(
    visible
      .filter((t) => t.assigneeId && t.estimatedMinutes)
      .map((t) => ({ assigneeId: t.assigneeId!, projectId: t.projectId, estimatedMinutes: t.estimatedMinutes!, startDate: t.startDate, dueDate: t.dueDate })),
    semanas,
    festivos,
  );
  const sinEstimar = new Map<string, number>();
  for (const t of visible) {
    if (t.assigneeId && !t.estimatedMinutes) sinEstimar.set(t.assigneeId, (sinEstimar.get(t.assigneeId) ?? 0) + 1);
  }
  const nombreProyecto = new Map<string, string>();
  for (const t of visible) if (t.projectId && t.project) nombreProyecto.set(t.projectId, `${t.project.emoji ? `${t.project.emoji} ` : ""}${t.project.name}`);

  const h1 = (min: number) => Math.round((min / 60) * 10) / 10;
  const SEG_COLORES = ["bg-indigo-500", "bg-teal-600", "bg-violet-500", "bg-slate-400"];
  const etiquetaSemana = (lunes: string) => {
    const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${Number(lunes.slice(8, 10))} ${meses[Number(lunes.slice(5, 7)) - 1]}`;
  };

  const workRows = team
    .filter((u) => u.role?.key !== "cliente")
    .map((u) => {
      const porSemana = carga.get(u.id);
      const actual = porSemana?.get(semanas[0]);
      const cap = capacidadSemana(u.weeklyCapacityHours || 40, semanas[0], festivos, eventos, u.id, ausencias);
      const totalMin = actual?.totalMin ?? 0;
      // Desglose por proyecto de la semana ACTUAL: top 3 + «otros», para que la barra diga de
      // dónde viene la carga y no solo «rojo».
      const tramos = [...(actual?.porProyecto.entries() ?? [])]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([pid, min], i) => ({
          nombre: pid ? nombreProyecto.get(pid) ?? "Otro proyecto" : "Sin proyecto",
          min,
          color: SEG_COLORES[Math.min(i, SEG_COLORES.length - 1)],
        }));
      const resto = totalMin - tramos.reduce((s, t) => s + t.min, 0);
      if (resto > 1) tramos.push({ nombre: "Otros", min: resto, color: SEG_COLORES[3] });
      const siguientes = semanas.slice(1).map((lunes) => {
        const c = capacidadSemana(u.weeklyCapacityHours || 40, lunes, festivos, eventos, u.id, ausencias);
        const min = porSemana?.get(lunes)?.totalMin ?? 0;
        return { lunes, horas: h1(min), pct: c.capacidadMin > 0 ? Math.round((min / c.capacidadMin) * 100) : min > 0 ? 999 : 0 };
      });
      return {
        id: u.id,
        name: u.name,
        initials: u.initials,
        avatarColor: u.avatarColor,
        totalMin,
        cap,
        pct: cap.capacidadMin > 0 ? Math.round((totalMin / cap.capacidadMin) * 100) : totalMin > 0 ? 999 : 0,
        tramos,
        siguientes,
        unsized: sinEstimar.get(u.id) ?? 0,
      };
    })
    // Quien tiene carga primero (más apretado arriba); los libres al final, pero PRESENTES.
    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      {workRows.length ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Carga del equipo <span className="font-normal normal-case">· semana del {etiquetaSemana(semanas[0])} · sobre la capacidad real (festivos y rodajes descontados)</span>
          </p>
          <div className="space-y-4">
            {workRows.map((u) => {
              // La barra se dibuja sobre max(carga, capacidad nominal): así la línea de
              // capacidad tiene dónde estar y lo que se pasa SE VE, en vez de toparse en 100 %
              // (con el tope, un 128 % y un 300 % eran idénticos).
              const escala = Math.max(u.totalMin, u.cap.baseMin, 1);
              const linea = (u.cap.capacidadMin / escala) * 100;
              const excesoMin = Math.max(0, u.totalMin - u.cap.capacidadMin);
              const capNota =
                u.cap.capacidadMin < u.cap.baseMin
                  ? `Capacidad ${h1(u.cap.capacidadMin)} h esta semana: ${[u.cap.ausenciaDias ? `${u.cap.ausenciaDias} día${u.cap.ausenciaDias > 1 ? "s" : ""} de ausencia` : "", u.cap.festivos ? `${u.cap.festivos} festivo${u.cap.festivos > 1 ? "s" : ""}` : "", u.cap.eventosMin ? `${h1(u.cap.eventosMin)} h en rodajes/citas` : ""].filter(Boolean).join(" y ")}`
                  : null;
              return (
                <div key={u.id}>
                  <div className="mb-1 flex items-center gap-2 text-sm">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: tone(u.avatarColor ?? "slate").hex }}>{u.initials ?? "?"}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                    <span className={cnLoad(u.pct)}>
                      {u.totalMin === 0 ? "libre" : `${h1(u.totalMin)}h / ${h1(u.cap.capacidadMin)}h`}
                    </span>
                  </div>
                  <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
                    {/* Zona rayada: capacidad que esta semana NO existe (festivo, rodaje). */}
                    {u.cap.capacidadMin < u.cap.baseMin ? (
                      <div
                        className="absolute inset-y-0"
                        style={{
                          left: `${linea}%`,
                          width: `${((u.cap.baseMin - u.cap.capacidadMin) / escala) * 100}%`,
                          background: "repeating-linear-gradient(45deg, transparent, transparent 3px, hsl(var(--muted-foreground) / 0.3) 3px, hsl(var(--muted-foreground) / 0.3) 5px)",
                        }}
                      />
                    ) : null}
                    <div className="absolute inset-y-0 left-0 flex" style={{ width: `${(u.totalMin / escala) * 100}%` }}>
                      {u.tramos.map((tr, i) => (
                        <span key={i} className={`h-full ${tr.color}`} style={{ width: `${(tr.min / Math.max(u.totalMin, 1)) * 100}%` }} title={`${tr.nombre} · ${h1(tr.min)} h`} />
                      ))}
                    </div>
                    {/* La línea de capacidad: lo que la cruza es sobrecarga y SE VE. */}
                    <span className="absolute inset-y-0 z-10 w-0.5 bg-foreground" style={{ left: `calc(${Math.min(linea, 99.5)}% - 1px)` }} />
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    {u.totalMin === 0 ? (
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">Libre toda la semana</span>
                    ) : (
                      u.tramos.map((tr, i) => (
                        <span key={i} className="inline-flex items-center gap-1">
                          <span className={`size-1.5 rounded-full ${tr.color}`} /> {tr.nombre} {h1(tr.min)}h
                        </span>
                      ))
                    )}
                    {excesoMin > 30 ? <span className="font-semibold text-red-600 dark:text-red-400">· se pasa {h1(excesoMin)}h</span> : null}
                    {capNota ? <span>· {capNota}</span> : null}
                    {u.unsized ? <span>· +{u.unsized} sin estimación (no pesan)</span> : null}
                  </p>
                  {/* Las 3 semanas siguientes en números chicos: a esa distancia el detalle es
                      ruido — lo único que importa es si hay hueco. */}
                  <p className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                    {u.siguientes.map((s) => (
                      <span key={s.lunes} className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 tabular-nums ${s.horas === 0 ? "bg-muted" : s.pct > 100 ? "bg-red-100 font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300" : s.pct >= 75 ? "bg-amber-100 font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"}`}>
                        {etiquetaSemana(s.lunes)}: {s.horas === 0 ? "—" : `${s.horas}h`}
                      </span>
                    ))}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <TeamTasksBoard members={members} tasks={tasks} canReassign={canReassign} canEditDates={canEditDates} />
    </div>
  );
}

// Tono del número de carga: rojo desde 100%, ámbar desde 75%.
function cnLoad(pct: number): string {
  return pct >= 100
    ? "shrink-0 text-xs font-semibold text-red-600 dark:text-red-400"
    : pct >= 75
      ? "shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400"
      : "shrink-0 text-xs text-muted-foreground";
}
