import Link from "next/link";
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
  const chaseGroups: { label: string; items: UserChases[keyof UserChases] }[] = [
    { label: "✅ Por pre-aprobar", items: chases.reviewsPending },
    { label: "📨 Seguimiento al cliente", items: chases.clientWaiting },
    { label: "📦 Sin material", items: chases.noMaterial },
    { label: "💼 Comercial por cerrar", items: chases.proposals },
    { label: "🧾 Por cobrar", items: chases.invoices },
  ].filter((g) => g.items.length > 0);
  const showActionable = hasActionable(p) || chaseCount(chases) > 0 || leadEsc.length > 0;

  const pills: { label: string; tone: string; href: string }[] = [];
  if (p.overdue.length) pills.push({ label: `🔴 ${p.overdue.length} atrasada${p.overdue.length === 1 ? "" : "s"}`, tone: "text-rose-700 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-300", href: "/mis-tareas" });
  if (p.today.length) pills.push({ label: `🟡 ${p.today.length} para hoy`, tone: "text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300", href: "/mis-tareas" });
  if (p.eventsToday.length) pills.push({ label: `📅 ${p.eventsToday.length} cita${p.eventsToday.length === 1 ? "" : "s"}`, tone: "text-sky-700 bg-sky-50 dark:bg-sky-500/10 dark:text-sky-300", href: "/calendario" });
  if (p.shootsToday.length) pills.push({ label: `🎬 ${p.shootsToday.length} rodaje${p.shootsToday.length === 1 ? "" : "s"}`, tone: "text-violet-700 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-300", href: "/calendario" });

  return (
    <section className="mt-8">
      <div className="overflow-hidden rounded-2xl border border-[#F47A20]/30 bg-gradient-to-br from-[#F47A20]/10 to-card shadow-sm">
        <div className="flex items-start gap-4 p-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#F47A20]/15 text-2xl">🤖</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="font-semibold">Marcebot</p>
              <span className="text-xs text-muted-foreground">tu copiloto del día</span>
            </div>

            {/* Te etiquetaron: aparece siempre que haya menciones sin leer (clic → al chat). */}
            {mentions.length ? (
              <div className="mt-3 rounded-xl border border-rose-300/50 bg-rose-50/70 p-3 dark:border-rose-500/25 dark:bg-rose-500/10">
                <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">📣 Te etiquetaron</p>
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
                {pills.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pills.map((pill) => (
                      <Link key={pill.label} href={pill.href} className={`rounded-full px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80 ${pill.tone}`}>
                        {pill.label}
                      </Link>
                    ))}
                  </div>
                ) : null}

                {(p.imminent.length > 0 || p.overdue.length > 0 || p.eventsToday.length > 0) ? (
                  <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {p.imminent.slice(0, 1).map((e) => (
                      <li key={e.id} className="text-[#F47A20]">⏰ "{e.title}" arranca a las {bogotaTime(e.start)}</li>
                    ))}
                    {p.overdue.slice(0, 2).map((t) => (
                      <li key={t.id} className="truncate">🔴 {t.title}{t.due ? ` — venció ${bogotaShortDate(t.due)}` : ""}</li>
                    ))}
                    {p.eventsToday.slice(0, 2).map((e) => (
                      <li key={e.id} className="truncate">📅 {bogotaTime(e.start)} — {e.title}</li>
                    ))}
                  </ul>
                ) : null}

                {chaseGroups.length ? (
                  <div className="mt-3 rounded-xl border border-[#F47A20]/20 bg-[#F47A20]/5 p-3">
                    <p className="text-xs font-semibold text-[#F47A20]">🎯 Para perseguir</p>
                    <div className="mt-1.5 space-y-1.5">
                      {chaseGroups.map((g) => (
                        <div key={g.label} className="text-sm">
                          <span className="text-xs font-medium text-muted-foreground">{g.label} ({g.items.length})</span>
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
                    <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">🚨 Atrasos en {leadEsc.length === 1 ? "tu proyecto" : "tus proyectos"} — a empujar</p>
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
                <p className="text-xs font-semibold text-muted-foreground">👔 Resumen del equipo</p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>🔴 {team.overdueTotal} atrasada{team.overdueTotal === 1 ? "" : "s"}</span>
                  {team.unassigned.length ? <span>🆕 {team.unassigned.length} sin responsable</span> : null}
                  {team.deliveries.length ? <span>📦 {team.deliveries.length} entrega{team.deliveries.length === 1 ? "" : "s"} esta semana</span> : null}
                  {team.shoots.length ? <span>🎬 {team.shoots.length} rodaje{team.shoots.length === 1 ? "" : "s"}</span> : null}
                </div>
                {team.byPerson.length ? (
                  <p className="mt-1.5 truncate text-xs text-muted-foreground">
                    Más atrasados: {team.byPerson.slice(0, 3).map((b) => `${b.name} (${b.count})`).join(" · ")}
                  </p>
                ) : null}
                {esc && (esc.awaitingInternal || esc.awaitingClient || esc.staleTasks || esc.proposalsOpen || esc.invoicesOverdue) ? (
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {esc.awaitingInternal ? <span>✅ {esc.awaitingInternal} por pre-aprobar</span> : null}
                    {esc.awaitingClient ? <span>📨 {esc.awaitingClient} sin respuesta</span> : null}
                    {esc.staleTasks ? <span>🐢 {esc.staleTasks} estancadas</span> : null}
                    {esc.proposalsOpen ? <span>💼 {esc.proposalsOpen} propuestas</span> : null}
                    {esc.invoicesOverdue ? <span>🧾 {esc.invoicesOverdue} por cobrar</span> : null}
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
