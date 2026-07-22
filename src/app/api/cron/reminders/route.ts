import { NextResponse, type NextRequest } from "next/server";
import { sweepReminders } from "@/lib/reminders";
import { sweepDeliverableSla } from "@/lib/deliverable-sla";
import { sweepClientDigest } from "@/lib/client-digest";
import { sweepReviewProxies } from "@/lib/review-proxy";
import { cronAuthorized } from "@/lib/cron-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Barrido de recordatorios con cadencia fina (OPCIONAL). El barrido normal ya corre con el
// sondeo de la campana (~20 s con gente conectada) y con el cron de Marcebot (cada 2 h).
// Si quieres puntualidad exacta también de madrugada, programa en el NAS cada 5 min
// (el secreto es OBLIGATORIO, igual que en el resto de crons — ver lib/cron-auth):
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3200/api/cron/reminders
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    const summary = await sweepReminders({ force: true });
    const deliverableSla = await sweepDeliverableSla({ force: true }).catch((e) => ({ error: e instanceof Error ? e.message : "error" }));
    // Resumen semanal del portal del cliente (correo del viernes; se auto-limita por usuario).
    const clientDigest = await sweepClientDigest().catch((e) => ({ sent: 0, error: e instanceof Error ? e.message : "error" }));
    // Proxies de revisión: recupera los que la cola en-memoria perdió en un reinicio y
    // re-cocina los de la receta vieja (verticales borrosos). De a 2 por pasada.
    const reviewProxies = await sweepReviewProxies().catch((e) => ({ queued: 0, error: e instanceof Error ? e.message : "error" }));
    // Retención de auditoría: el registro de actividad guarda 365 días; lo más viejo se
    // purga aprovechando este cron (indexado por createdAt: barato).
    const cutoff = new Date(Date.now() - 365 * 24 * 3600 * 1000);
    const auditPurge = await db.activityLog.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => ({ count: -1 }));
    return NextResponse.json({ ok: true, ...summary, deliverableSla, clientDigest, reviewProxies, auditPurge: auditPurge.count });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
