import Link from "next/link";
import { IconMarcebot } from "@/components/icons";
import { Megaphone, Clock, Target, AlertTriangle, Briefcase, AlertCircle, UserPlus, Package, Clapperboard, CircleCheck, Mail, Timer, Receipt, CalendarDays, type LucideIcon } from "lucide-react";
import { db } from "@/lib/db";
import { getUserPendientes, getTeamSummary, getUserChases, getTeamEscalation, getLeadEscalations, chaseCount, openStatusKeys, hasActionable, vocativo, type Gender, type UserChases } from "@/lib/marcebot";
import { bogotaTime, bogotaShortDate } from "@/lib/marcebot/time";

const ADMIN_ROLES = ["admin", "gerente", "productor"];

// Tarjeta de Marcebot en el Inicio: resumen EN VIVO (se recalcula al cargar la página,
// no solo cada hora). Reutiliza las mismas consultas que el cron.
export async function MarcebotCard({ userId, name, roleKey }: { userId: string; name: string; roleKey: string }) {
  const openKeys = await openStatusKeys();
  const isAdmin = ADMIN_ROLES.includes(roleKey);
  const [u, p, chases, leadEsc, team, esc, mentions] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { gender: true } }),
    getUserPendientes(userId, openKeys),
    getUserChases(userId),
    getLeadEscalations(userId, openKeys),
    isAdmin ? getTeamSummary(openKeys) : Promise.resolve(null),
    isAdmin ? getTeamEscalation(openKeys) : Promise.resolve(null),
    // @menciones sin leer: si alguien te etiquetó en un chat, Marcebot te lo dice aquí y al
    // tocar te lleva al chat (el enlace ya apunta a /chat/<canal>).
    db.notification.findMany({
      where: { userId, type: "mention", read: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, body: true, link: true },
    }),
  ]);
  const voc = vocativo(u?.gender as Gender);
  const firstName = name.split(" ")[0];
  const chaseGroups: { label: string; Icon: LucideIcon; items: UserChases[keyof UserChases] }[] = [
    { label: "Por pre-aprobar", Icon: CircleCheck, items: chases.reviewsPending },
    { label: "Seguimiento al cliente", Icon: Mail, items: chases.clientWaiting },
    { label: "Sin material", Icon: Package, items: chases.noMaterial },
    { label: "Comercial por cerrar", Icon: Briefcase, items: chases.proposals },
    { label: "Por cobrar", Icon: Receipt, items: chases.invoices },
  ].filter((g) => g.items.length > 0);
  const showActionable = hasActionable(p) || chaseCount(chases) > 0 || leadEsc.length > 0;

  // Chips DESPLEGABLES: tocar el chip abre la lista completa de esos pendientes, y cada
  // uno enlaza a su detalle (la tarea en su proyecto, o Mis tareas si es personal). Antes
  // el chip solo navegaba a la lista general y no se veía CUÁLES eran.
  const taskHref = (t: { projectId: string | null }) => (t.projectId ? `/proyectos/${t.projectId}?tab=tareas` : "/mis-tareas");
  const groups: { key: string; label: string; Icon: LucideIcon; tone: string; items: { id: string; text: string; href: string }[]; more: { label: string; href: string } }[] = [];
  if (p.overdue.length) groups.push({
    key: "overdue",
    label: `${p.overdue.length} atrasada${p.overdue.length === 1 ? "" : "s"}`,
    Icon: AlertCircle,
    tone: "text-rose-700 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-300",
    items: p.overdue.map((t) => ({ id: t.id, text: `${t.title}${t.due ? ` — venció ${bogotaShortDate(t.due)}` : ""}${t.project ? ` · ${t.project}` : ""}`, href: taskHref(t) })),
    more: { label: "Ver en Mis tareas →", href: "/mis-tareas" },
  });
  if (p.today.length) groups.push({
    key: "today",
    label: `${p.today.length} para hoy`,
    Icon: Clock,
    tone: "text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300",
    items: p.today.map((t) => ({ id: t.id, text: `${t.title}${t.project ? ` · ${t.project}` : ""}`, href: taskHref(t) })),
    more: { label: "Ver en Mis tareas →", href: "/mis-tareas" },
  });
  if (p.eventsToday.length) groups.push({
    key: "events",
    label: `${p.eventsToday.length} cita${p.eventsToday.length === 1 ? "" : "s"}`,
    Icon: CalendarDays,
    tone: "text-sky-700 bg-sky-50 dark:bg-sky-500/10 dark:text-sky-300",
    items: p.eventsToday.map((e) => ({ id: e.id, text: `${bogotaTime(e.start)} — ${e.title}`, href: "/calendario" })),
    more: { label: "Ver calendario →", href: "/calendario" },
  });
  if (p.shootsToday.length) groups.push({
    key: "shoots",
    label: `${p.shootsToday.length} rodaje${p.shootsToday.length === 1 ? "" : "s"}`,
    Icon: Clapperboard,
    tone: "text-violet-700 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-300",
    items: p.shootsToday.map((t) => ({ id: t.id, text: `${t.title}${t.project ? ` · ${t.project}` : ""}`, href: taskHref(t) })),
    more: { label: "Ver calendario →", href: "/calendario" },
  });

  return (
    <section className="mt-8">
      <div className="overflow-hidden rounded-2xl border border-[#F47A20]/30 bg-gradient-to-br from-[#F47A20]/10 to-card shadow-sm">
        <div className="flex items-start gap-4 p-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#F47A20]/15"><IconMarcebot className="size-6" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="font-semibold">Marcebot</p>
              <span className="text-xs text-muted-foreground">tu copiloto del día</span>
            </div>

            {/* Te etiquetaron: aparece siempre que haya menciones sin leer (clic → al chat). */}
            {mentions.length ? (
              <div className="mt-3 rounded-xl border border-rose-300/50 bg-rose-50/70 p-3 dark:border-rose-500/25 dark:bg-rose-500/10">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300"><Megaphone className="size-4" /> Te etiquetaron</p>
                <ul className="mt-1 space-y-0.5">
                  {mentions.map((m) => (
                    <li key={m.id}>
                      <Link href={m.link ?? "/chat"} className="block truncate text-sm text-foreground hover:underline">
                        {m.title}{m.body ? ` — “${m.body}”` : ""}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {showActionable ? (
              <>
                <p className="mt-1 text-sm">
                  ¡Hola, {voc}! Esto es lo que tienes en el radar, {firstName}:
                </p>
                {groups.length ? (
                  <div className="mt-3 space-y-1.5">
                    {groups.map((g) => (
                      <details key={g.key} className="group/pend">
                        <summary className={`inline-flex cursor-pointer list-none items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80 ${g.tone}`}>
                          <g.Icon className="size-3.5" />
                          {g.label}
                          <span className="text-[10px] opacity-70 transition-transform group-open/pend:rotate-90">›</span>
                        </summary>
                        <ul className="mt-1.5 space-y-1 rounded-lg border border-border/60 bg-card/70 p-2 pl-3">
                          {g.items.map((it) => (
                            <li key={it.id}>
                              <Link href={it.href} className="block truncate text-sm text-foreground/90 hover:text-primary hover:underline" title="Abrir el detalle">
                                • {it.text}
                              </Link>
                            </li>
                          ))}
                          <li>
                            <Link href={g.more.href} className="text-xs font-medium text-primary hover:underline">{g.more.label}</Link>
                          </li>
                        </ul>
                      </details>
                    ))}
                  </div>
                ) : null}

                {p.imminent.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {p.imminent.slice(0, 1).map((e) => (
                      <li key={e.id} className="flex items-center gap-1.5 text-[#F47A20]"><Clock className="size-4 shrink-0" /> «{e.title}» arranca a las {bogotaTime(e.start)}</li>
                    ))}
                  </ul>
                ) : null}

                {chaseGroups.length ? (
                  <div className="mt-3 rounded-xl border border-[#F47A20]/20 bg-[#F47A20]/5 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-[#F47A20]"><Target className="size-4" /> Para perseguir</p>
                    <div className="mt-1.5 space-y-1.5">
                      {chaseGroups.map((g) => (
                        <div key={g.label} className="text-sm">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><g.Icon className="size-3.5" />{g.label} ({g.items.length})</span>
                          <ul className="mt-0.5 space-y-0.5">
                            {g.items.slice(0, 2).map((it) => (
                              <li key={it.id} className="truncate text-muted-foreground">• {it.title} — {it.detail}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {leadEsc.length ? (
                  <div className="mt-3 rounded-xl border border-rose-300/40 bg-rose-50/60 p-3 dark:border-rose-500/20 dark:bg-rose-500/5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300"><AlertTriangle className="size-4 shrink-0" /> Atrasos en {leadEsc.length === 1 ? "tu proyecto" : "tus proyectos"} — a empujar</p>
                    <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                      {leadEsc.slice(0, 3).map((e) => (
                        <li key={e.project} className="truncate">
                          • {e.project}: {e.byPerson.slice(0, 3).map((bp) => `${bp.name} (${bp.count})`).join(" · ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : mentions.length ? null : (
              <p className="mt-1 text-sm">
                ¡Vas al día, {voc}! 🎉 No tienes pendientes urgentes. Disfruta tu jornada.
              </p>
            )}

            {team ? (
              <div className="mt-4 rounded-xl border border-border bg-card/60 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Briefcase className="size-4" /> Resumen del equipo</p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1"><AlertCircle className="size-3.5 text-rose-500" /> {team.overdueTotal} atrasada{team.overdueTotal === 1 ? "" : "s"}</span>
                  {team.unassigned.length ? <span className="inline-flex items-center gap-1"><UserPlus className="size-3.5" /> {team.unassigned.length} sin responsable</span> : null}
                  {team.deliveries.length ? <span className="inline-flex items-center gap-1"><Package className="size-3.5" /> {team.deliveries.length} entrega{team.deliveries.length === 1 ? "" : "s"} esta semana</span> : null}
                  {team.shoots.length ? <span className="inline-flex items-center gap-1"><Clapperboard className="size-3.5" /> {team.shoots.length} rodaje{team.shoots.length === 1 ? "" : "s"}</span> : null}
                </div>
                {team.byPerson.length ? (
                  <p className="mt-1.5 truncate text-xs text-muted-foreground">
                    Más atrasados: {team.byPerson.slice(0, 3).map((b) => `${b.name} (${b.count})`).join(" · ")}
                  </p>
                ) : null}
                {esc && (esc.awaitingInternal || esc.awaitingClient || esc.staleTasks || esc.proposalsOpen || esc.invoicesOverdue) ? (
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {esc.awaitingInternal ? <span className="inline-flex items-center gap-1"><CircleCheck className="size-3.5" /> {esc.awaitingInternal} por pre-aprobar</span> : null}
                    {esc.awaitingClient ? <span className="inline-flex items-center gap-1"><Mail className="size-3.5" /> {esc.awaitingClient} sin respuesta</span> : null}
                    {esc.staleTasks ? <span className="inline-flex items-center gap-1"><Timer className="size-3.5" /> {esc.staleTasks} estancadas</span> : null}
                    {esc.proposalsOpen ? <span className="inline-flex items-center gap-1"><Briefcase className="size-3.5" /> {esc.proposalsOpen} propuestas</span> : null}
                    {esc.invoicesOverdue ? <span className="inline-flex items-center gap-1"><Receipt className="size-3.5" /> {esc.invoicesOverdue} por cobrar</span> : null}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
