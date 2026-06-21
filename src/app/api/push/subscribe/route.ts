import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Guarda (o actualiza) la suscripción Web Push del navegador del usuario.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const sub = body?.subscription ?? body;
  const endpoint: string | undefined = sub?.endpoint;
  const p256dh: string | undefined = sub?.keys?.p256dh;
  const auth: string | undefined = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth, userAgent, userId: session.id },
    update: { p256dh, auth, userAgent, userId: session.id },
  });

  return NextResponse.json({ ok: true });
}
