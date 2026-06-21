import { NextResponse } from "next/server";
import { vapidPublicKey } from "@/lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Clave pública VAPID para que el navegador se suscriba al Web Push.
export async function GET() {
  return NextResponse.json({ key: vapidPublicKey() });
}
