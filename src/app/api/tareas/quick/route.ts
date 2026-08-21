import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { quickAddTask } from "@/app/(app)/proyectos/[id]/actions";

// ── Reenvío de «nueva tarea» creada sin conexión (modo offline, Camino B — Fase 2) ──
// La cola local (src/lib/offline/cola.ts) manda aquí, con la cookie de sesión (mismo origen),
// una tarea que se escribió sin servidor. El `id` lo generó el cliente: reenviar es idempotente
// —quickAddTask → quickCreateFromText devuelve la tarea existente si ya se creó con ese id—, así
// que un reintento nunca duplica. Reusa el MISMO control de acceso que el server action normal.
//
// Códigos: 200 = guardada (o ya existía). 422 = rechazo permanente (sin permiso / texto vacío):
// la cola lo saca y avisa. Un fallo de BD lanza y sale 500 → la cola reintenta sin perder nada.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { id?: string; text?: string; projectId?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Cuerpo inválido" }, { status: 400 });
  }
  const text = String(body?.text ?? "").trim();
  if (!text) return NextResponse.json({ ok: true, skipped: true });

  const r = await quickAddTask(text, body?.projectId ?? null, body?.id ?? null);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
