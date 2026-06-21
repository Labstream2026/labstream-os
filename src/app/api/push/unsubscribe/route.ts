import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elimina la suscripción Web Push (al desactivar avisos o cambiar de navegador).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint: string | undefined = body?.endpoint;
  if (endpoint) {
    await db.pushSubscription.deleteMany({ where: { endpoint, userId: session.id } });
  }
  return NextResponse.json({ ok: true });
}
