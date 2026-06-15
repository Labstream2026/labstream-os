import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Devuelve las notificaciones recientes del usuario + cuántas sin leer. La campana
// lo consulta cada pocos segundos (polling) para enterarse de nuevas sin recargar.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ items: [], unread: 0 }, { status: 401 });

  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.notification.count({ where: { userId: session.id, read: false } }),
  ]);

  return new NextResponse(
    JSON.stringify({
      unread,
      items: rows.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
    }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}
