import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sweepReminders } from "@/lib/reminders";
import { sweepDeliverableSla } from "@/lib/deliverable-sla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Devuelve las notificaciones recientes del usuario + cuántas sin leer. La campana
// lo consulta cada pocos segundos (polling) para enterarse de nuevas sin recargar.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ items: [], unread: 0 }, { status: 401 });

  // Barrido de recordatorios "a lomo" del sondeo de la campana: mientras alguien use la app,
  // los recordatorios suenan casi al minuto, sin cron adicional. Trae throttle interno (30 s)
  // y reclamo atómico, así que llamarlo en cada poll es barato y seguro. Fire-and-forget.
  void sweepReminders().catch(() => {});
  // Barrido de SLA de entregables (pre-aprobaciones/correcciones vencidas), mismo patrón.
  void sweepDeliverableSla().catch(() => {});

  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        actor: { select: { name: true, initials: true, avatarColor: true, avatarUrl: true } },
        // Responsable: colorea el aviso cuando no hay actor (avisos del sistema).
        subject: { select: { name: true, initials: true, avatarColor: true, avatarUrl: true } },
      },
    }),
    db.notification.count({ where: { userId: session.id, read: false } }),
  ]);

  return new NextResponse(
    JSON.stringify({
      unread,
      items: rows.map((n) => ({
        id: n.id,
        type: n.type,
        category: n.category,
        priority: n.priority,
        groupKey: n.groupKey,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
        actor: n.actor
          ? { name: n.actor.name, initials: n.actor.initials, color: n.actor.avatarColor, url: n.actor.avatarUrl }
          : null,
        // Responsable (para colorear los avisos del sistema con su color).
        subject: n.subject
          ? { name: n.subject.name, initials: n.subject.initials, color: n.subject.avatarColor, url: n.subject.avatarUrl }
          : null,
      })),
    }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}
