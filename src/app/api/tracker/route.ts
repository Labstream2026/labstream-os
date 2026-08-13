import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashTrackerToken, limpiarBloques, TRACKER_PREFIX } from "@/lib/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── POST /api/tracker — el sensor de la app de escritorio sube sus lotes ──
// Autenticación por token del EQUIPO (ltk_, Authorization: Bearer): un espacio aparte de las
// llaves lsk_ a propósito — este token no abre la API, solo deja subir bloques de uso del
// device al que pertenece, y revocarlo en Ajustes lo corta al instante. La inserción es
// idempotente (unique deviceId+startedAt+app+title con skipDuplicates): el reintento de la
// cola offline no duplica nada.
//
// Payload: { device?: { hostname?, platform?, version? }, blocks: [{ s, d, a, app, t? }] }

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!raw.startsWith(TRACKER_PREFIX)) {
    return NextResponse.json({ ok: false, error: "Token del rastreador ausente o mal formado" }, { status: 401 });
  }
  const device = await db.trackerDevice.findUnique({
    where: { tokenHash: hashTrackerToken(raw) },
    select: { id: true, userId: true, revokedAt: true, name: true, user: { select: { active: true } } },
  });
  if (!device || device.revokedAt || !device.user.active) {
    return NextResponse.json({ ok: false, error: "Token revocado o desconocido" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const b = (body ?? {}) as { device?: { hostname?: unknown; platform?: unknown; version?: unknown }; blocks?: unknown };
  const bloques = limpiarBloques(b.blocks, Date.now());

  let recibidos = 0;
  if (bloques.length) {
    const r = await db.workBlock.createMany({
      data: bloques.map((x) => ({ ...x, deviceId: device.id, userId: device.userId })),
      skipDuplicates: true,
    });
    recibidos = r.count;
  }

  // Señales de vida del equipo. El HOSTNAME que manda el sensor bautiza al device la primera
  // vez (al vincular, el servidor aún no lo conocía y le puso un nombre genérico).
  const hostname = typeof b.device?.hostname === "string" ? b.device.hostname.trim().slice(0, 60) : "";
  await db.trackerDevice.update({
    where: { id: device.id },
    data: {
      lastSeenAt: new Date(),
      ...(typeof b.device?.platform === "string" ? { platform: b.device.platform.slice(0, 20) } : {}),
      ...(typeof b.device?.version === "string" ? { appVersion: b.device.version.slice(0, 20) } : {}),
      ...(hostname && device.name.startsWith("Equipo de ") ? { name: hostname } : {}),
    },
  });

  // Retención sin cron nuevo: de vez en cuando (2 % de los lotes) se poda el detalle de hace
  // más de 180 días. Los reportes miran ventanas mucho más cortas; esto solo evita crecer eterno.
  if (Math.random() < 0.02) {
    db.workBlock.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - 180 * 86_400_000) } } }).catch(() => {});
  }

  return NextResponse.json({ ok: true, recibidos, descartados: Math.max(0, (Array.isArray(b.blocks) ? b.blocks.length : 0) - bloques.length) });
}
