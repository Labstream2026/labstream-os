import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { persistNote, type NoteSaveInput } from "@/lib/note-save";

// ── Red de seguridad del editor de notas ──
// El autoguardado normal (server action) espera 700 ms tras la última tecla. Si en ese
// intervalo se cierra la pestaña, se cambia de app o se navega a otra ruta, ese tramo se
// perdía. El editor manda aquí el último borrador con `navigator.sendBeacon`, que el
// navegador entrega aunque la página ya se esté yendo (no se puede esperar respuesta, por
// eso NO es un server action: sendBeacon necesita una URL).
//
// La sesión viaja en la cookie (sendBeacon la incluye por ser mismo origen) y las reglas de
// permisos/acceso son las mismas: todo pasa por `persistNote`.
//
// Conflicto: aquí no hay a quién preguntar (la pestaña ya no existe), así que se guarda en
// modo "keep-both" — se escribe lo que el usuario acababa de escribir y la versión que había
// en el servidor queda debajo, fechada. Nunca se pierde texto de ningún lado.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  let body: NoteSaveInput;
  try {
    body = (await req.json()) as NoteSaveInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Cuerpo inválido" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false }, { status: 400 });
  // Sin texto no hay nada que salvar (evita crear notas vacías al cerrar la pestaña).
  if (!(body.content ?? "").trim() && !(body.title ?? "").trim()) return NextResponse.json({ ok: true, skipped: true });

  const r = await persistNote(session, body, "keep-both");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
