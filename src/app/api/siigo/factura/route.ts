import { NextResponse, type NextRequest } from "next/server";
import { getSession, hasPermission } from "@/lib/auth";
import { facturaDetalleSiigo } from "@/lib/siigo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Detalle de UNA factura de Siigo (ítems y pagos) para el panel de la tabla de Finanzas.
// Misma llave que la página (ver_finanzas); solo lectura, con la caché corta del conector.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role === "cliente" || session.role === "demo" || !hasPermission(session, "ver_finanzas")) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id") || "";
  const detalle = await facturaDetalleSiigo(id);
  if (!detalle) return new NextResponse("No se pudo leer esa factura", { status: 404 });
  return NextResponse.json(detalle, { headers: { "Cache-Control": "private, max-age=300" } });
}
