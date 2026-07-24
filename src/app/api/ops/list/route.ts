import { NextResponse, type NextRequest } from "next/server";
import { opsSession } from "@/lib/ops-access";
import { opsReady, listOps } from "@/lib/nas-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Listado EN VIVO de una carpeta de Operaciones_LAB para el explorador.
export async function GET(req: NextRequest) {
  const session = await opsSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });
  if (!(await opsReady())) return NextResponse.json({ error: "Operaciones_LAB no está disponible" }, { status: 503 });

  const path = new URL(req.url).searchParams.get("path") || "";
  try {
    const { dirs, files, truncated } = await listOps(path);
    return NextResponse.json({ path, dirs, files, truncated });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return NextResponse.json({ error: "La carpeta ya no existe (¿movida desde el NAS?)" }, { status: 404 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo listar" }, { status: 400 });
  }
}
