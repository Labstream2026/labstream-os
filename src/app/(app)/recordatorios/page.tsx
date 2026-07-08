import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { IconRecordatorios } from "@/components/icons";
import { RemindersClient, type ReminderRow } from "./reminders-client";

export const dynamic = "force-dynamic";

// Recordatorios: avisos puntuales o recurrentes, propios o para un compañero. Superficie
// interna del equipo (el portal del cliente y el usuario demo no la ven).
export default async function RecordatoriosPage() {
  const session = await getSession();
  if (!session || session.role === "cliente" || session.role === "demo") redirect("/");

  const [reminders, team] = await Promise.all([
    // Los míos: los que me suenan a mí y los que yo dejé (a quien sea).
    db.reminder.findMany({
      where: { OR: [{ forUserId: session.id }, { createdById: session.id }] },
      orderBy: [{ active: "desc" }, { nextFireAt: "asc" }],
      take: 200,
      include: {
        forUser: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
    }),
    // Destinatarios posibles: el equipo (sin bots ni portal del cliente/demo).
    db.user.findMany({
      where: { active: true, isSystemBot: false, role: { key: { notIn: ["cliente", "demo"] } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const isAdmin = session.role === "admin";
  const rows: ReminderRow[] = reminders.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    frequency: r.frequency,
    weekdays: r.weekdays,
    dayOfMonth: r.dayOfMonth,
    timeOfDay: r.timeOfDay,
    nextFireAtIso: r.nextFireAt.toISOString(),
    lastFiredAtIso: r.lastFiredAt?.toISOString() ?? null,
    active: r.active,
    forUser: r.forUser,
    createdBy: r.createdBy,
    task: r.task,
    canManage: r.forUserId === session.id || r.createdById === session.id || isAdmin,
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        icon={<IconRecordatorios />}
        title="Recordatorios"
        description="Avisos puntuales o recurrentes, para ti o para alguien del equipo. No son tareas: te suenan cuando toca (campana, push y Marcebot)."
      />
      <RemindersClient rows={rows} team={team} meId={session.id} />
    </div>
  );
}
