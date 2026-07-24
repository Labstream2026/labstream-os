import { NextResponse, type NextRequest } from "next/server";
import { opsSession } from "@/lib/ops-access";
import { opsReady, writeOps, normalizeOpsRel } from "@/lib/nas-ops";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD = 100 * 1024 * 1024; // 100 MB por archivo (mismo tope que las server actions)
// Ejecutables/scripts: mismos bloqueos que la subida de proyectos.
const BLOCKED_EXT = /\.(exe|bat|cmd|sh|ps1|msi|scr|com|pif|jar|vbs|js|mjs|wsf|app|dmg)$/i;

// Subir archivos a una carpeta de Operaciones_LAB desde el explorador.
export async function POST(req: NextRequest) {
  const session = await opsSession({ write: true });
  if (!session) return new NextResponse("No autorizado", { status: 401 });
  if (!(await opsReady())) return NextResponse.json({ error: "Operaciones_LAB no está disponible" }, { status: 503 });

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }
  let dir: string;
  try {
    dir = normalizeOpsRel(String(fd.get("path") ?? ""));
  } catch {
    return NextResponse.json({ error: "Ruta inválida" }, { status: 400 });
  }

  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "No llegó ningún archivo" }, { status: 400 });

  const saved: string[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    if (f.size > MAX_UPLOAD || BLOCKED_EXT.test(f.name)) {
      skipped.push(f.name);
      continue;
    }
    const rel = await writeOps(dir, f.name, Buffer.from(await f.arrayBuffer()));
    saved.push(rel);
  }
  if (saved.length) {
    await logActivity({
      action: "ops.upload",
      summary: `subió ${saved.length === 1 ? `«${saved[0].split("/").pop()}»` : `${saved.length} archivos`} a Operaciones_LAB/${dir || ""}`,
      entityType: "ops",
      entityId: dir || "/",
      silent: true,
    });
  }
  return NextResponse.json({ ok: true, saved, skipped });
}
