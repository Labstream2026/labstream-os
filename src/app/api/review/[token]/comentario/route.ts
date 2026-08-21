import { NextResponse, type NextRequest } from "next/server";
import { addReviewComment } from "@/app/review/[token]/actions";

// ── Reenvío de «comentario/corrección de revisión» dejado sin conexión (offline, Camino B — F2) ──
// El portal de revisión del cliente autoriza por TOKEN firmado (no por sesión), así que el token
// viaja en la URL. La cola local manda aquí el comentario que el cliente escribió cuando el
// servidor no respondía —incluido el dibujo/anotación (data URI en `drawingData`), que IndexedDB
// guarda sin problema—. El `clientId` lo generó el cliente: addReviewComment hace create-si-no-
// existe por ese id, así que reenviar nunca duplica ni re-avisa al equipo.
//
// La variante de FOTO (setPhotoDrawing, que escribe en el disco del servidor) NO pasa por aquí:
// esa se queda solo-online.
//
// Códigos: 200 = guardado (o ya existía). 429 = límite de ritmo → la cola REINTENTA luego. 422 =
// rechazo permanente (token caducado/revocado, estado no-cliente) → la cola lo saca y avisa.

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Cuerpo inválido" }, { status: 400 });
  }

  const fd = new FormData();
  for (const k of ["clientId", "authorName", "body", "timecode", "versionNumber", "drawingData", "isNote"]) {
    const v = body?.[k];
    if (v !== undefined && v !== null) fd.set(k, String(v));
  }

  try {
    await addReviewComment(token, fd);
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (/demasiad/i.test(msg)) {
      return NextResponse.json({ ok: false, error: msg }, { status: 429 }); // ritmo: reintentar luego
    }
    // Token caducado/revocado, enlace inválido o estado que ya no admite comentarios: reintentar
    // NO ayuda, se saca de la cola y se avisa. CUALQUIER otro error (BD caída, etc.) se propaga
    // → 500 → la cola reintenta, para no PERDER la corrección del cliente por un fallo pasajero.
    if (/inválid|no está disponible|caducad|revisión interna del equipo/i.test(msg)) {
      return NextResponse.json({ ok: false, error: msg }, { status: 422 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}
