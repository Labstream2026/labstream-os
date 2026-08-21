import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { completeMyTask } from "@/app/(app)/mis-tareas/actions";
import { esNoAutorizado } from "@/lib/authz-error";

// ── Reenvío de «marcar tarea hecha» sin conexión (modo offline, Camino B — Fase 2) ──
// La cola local manda aquí, con la cookie de sesión, la orden de completar una tarea que se marcó
// sin servidor. SOLO el sentido → HECHA se sincroniza offline: es de un solo sentido y de baja
// contención, y completeMyTask ya es IDEMPOTENTE (el guardián `completedAt` hace que reenviar
// «hecha» sea un no-op —no re-notifica ni re-registra—). REABRIR/degradar sigue solo-online,
// porque eso SOBRESCRIBE estado y podría pisar el cambio de otra persona.
//
// Códigos: 200 = hecha (o ya lo estaba). 422 = rechazo permanente (no existe, bloqueada por
// dependencias, sin permiso) → la cola lo saca y avisa. Otro throw → 500 → reintento.

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { id: taskId } = await params;
  try {
    const r = await completeMyTask(taskId);
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  } catch (err) {
    if (esNoAutorizado(err as Error & { digest?: string })) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 422 });
    }
    throw err; // transitorio → 500 → la cola reintenta
  }
}
