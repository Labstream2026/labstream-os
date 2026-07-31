import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushToUser, webPushEnabled } from "@/lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manda un push de prueba A UNO MISMO. Existe porque la entrega real no se puede verificar de
// otra forma decente: el service worker enseña una notificación SIEMPRE (hasta con carga
// vacía), así que cualquier «prueba silenciosa» contra la suscripción de otra persona le haría
// sonar el teléfono. Con esto cada quien comprueba su propio navegador, y el equipo deja de
// depender de «activa el push y espera a que pase algo para saber si funcionó».
//
// Solo con sesión y solo al propio userId: no es una vía para notificar a nadie más.
export async function POST() {
  const session = await getSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });
  if (!webPushEnabled()) {
    return NextResponse.json({ ok: false, motivo: "El servidor no tiene el push configurado (claves VAPID)." }, { status: 503 });
  }

  const suscripciones = await db.pushSubscription.count({ where: { userId: session.id } });
  if (!suscripciones) {
    return NextResponse.json({ ok: false, motivo: "Este navegador no está suscrito todavía." }, { status: 409 });
  }

  const r = await sendPushToUser(session.id, {
    title: "Prueba de avisos ✓",
    body: "Si estás leyendo esto fuera de la app, el push te funciona.",
    url: "/ajustes?s=notificaciones",
    tag: "labstream-prueba", // una prueba reemplaza a la anterior: probar tres veces no apila tres
  });

  return NextResponse.json({ ok: r.enviados > 0, ...r });
}
