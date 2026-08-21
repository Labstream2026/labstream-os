import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { logTime } from "@/app/(app)/proyectos/[id]/actions";
import { esNoAutorizado } from "@/lib/authz-error";

// ── Reenvío de «registrar horas» apuntadas sin conexión (modo offline, Camino B — Fase 2) ──
// La cola local manda aquí un registro de tiempo con la cookie de sesión. El `clientId` lo generó
// el cliente: logTime hace create-si-no-existe por ese id, así que reenviar nunca duplica horas.
// Reusa el MISMO control de acceso (ensureAccessVia "registrar_horas") del server action.
//
// logTime LANZA en error. Distinguimos con cuidado para no PERDER un registro válido:
//   · permiso (esNoAutorizado) o «Horas inválidas» → rechazo PERMANENTE → 422 (la cola lo saca).
//   · cualquier otro throw (BD caída, etc.) → se propaga → 500 → la cola REINTENTA luego.

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { id: taskId } = await params;
  let body: { clientId?: string; hours?: string | number; note?: string; spentOn?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Cuerpo inválido" }, { status: 400 });
  }

  const fd = new FormData();
  if (body?.clientId) fd.set("clientId", String(body.clientId));
  fd.set("hours", String(body?.hours ?? ""));
  if (body?.note) fd.set("note", String(body.note));
  if (body?.spentOn) fd.set("spentOn", String(body.spentOn));

  try {
    await logTime(taskId, "", fd);
  } catch (err) {
    const e = err as Error & { digest?: string };
    if (esNoAutorizado(e) || /horas inválidas/i.test(e.message ?? "")) {
      return NextResponse.json({ ok: false, error: e.message || "No se pudo registrar" }, { status: 422 });
    }
    throw err; // fallo transitorio: que salga 500 y la cola reintente
  }
  return NextResponse.json({ ok: true });
}
