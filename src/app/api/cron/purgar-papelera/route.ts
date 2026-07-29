import { NextResponse, type NextRequest } from "next/server";
import { purgarPapelera, DIAS_PAPELERA } from "@/lib/archivos/papelera";
import { cronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vacía de verdad lo que lleva más de 30 días en la papelera de Archivos: borra los bytes del
// storage y la fila (que arrastra en cascada fotos, portadas, versiones y comentarios).
// Lo invoca el Programador del NAS una vez al día. El secreto es obligatorio también en local:
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3200/api/cron/purgar-papelera
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    const r = await purgarPapelera();
    return NextResponse.json({ ok: true, dias: DIAS_PAPELERA, ...r });
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
