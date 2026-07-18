import { NextResponse } from "next/server";
import { reminderPushAction } from "@/app/(app)/recordatorios/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recibe la pulsación de un botón de la notificación push (service worker): posponer 10 min
// o marcar hecho. La cookie de sesión viaja en la petición del mismo origen.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id = typeof body?.reminderId === "string" ? body.reminderId : null;
  const action = body?.action === "done" ? "done" : body?.action === "snooze" ? "snooze" : null;
  if (!id || !action) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await reminderPushAction(id, action);
  return NextResponse.json(res, { status: res.ok ? 200 : 403 });
}
