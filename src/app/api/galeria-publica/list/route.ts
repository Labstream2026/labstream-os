import { NextResponse, type NextRequest } from "next/server";
import { resolverEntrega } from "@/lib/galeria-entrega";
import { galeriaEnabled, galeriaReady, scanGaleria } from "@/lib/nas-galeria";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La línea de tiempo de UNA entrega, para el cliente que entra por enlace firmado y sin cuenta.
// Gemela de /api/galeria/list, con dos diferencias que son el corazón de la sala:
//
//  - La carpeta la dice el TOKEN, nunca el navegador. Aquí NO se acepta ningún `rel`: si el
//    cliente pudiera elegir carpeta, elegiría la de otro.
//  - Nunca se devuelven las carpetas de primer nivel. Esa lista es el índice de todos los
//    clientes de la empresa; el equipo la ve en /galeria, el cliente jamás.
//
// Inválido, caducado y revocado contestan lo MISMO (401 pelado): así nadie confirma a base de
// probar tokens que un enlace existió alguna vez. La pantalla sí explica el motivo, porque lo
// resuelve del lado del servidor con el mismo token.
export async function GET(req: NextRequest) {
  // El estado del montaje se mira ANTES que el token, a propósito. Con LabTem caído
  // resolverEntrega no distingue «carpeta borrada» de «disco ausente» y devuelve `sin_carpeta`
  // para las dos: un cliente con un enlace perfecto recibiría un 401 y le diríamos que su
  // enlace no sirve, cuando el problema es nuestro. Adelantar la comprobación no filtra nada
  // (el mensaje es el mismo con o sin token) y evita esa mentira.
  if (!galeriaEnabled() || !(await galeriaReady())) {
    return NextResponse.json({
      ok: true,
      ready: false,
      motivo: "no_disponible",
      mensaje: "Tu galería no está disponible en este momento. Vuelve a intentarlo en unos minutos o escríbenos.",
    });
  }

  const token = new URL(req.url).searchParams.get("t") || "";
  const entrega = await resolverEntrega(token);
  if (!entrega.ok) return new NextResponse("No autorizado", { status: 401 });

  // Escanear es lo caro de toda la sala (recorre la carpeta entera y lee EXIF). Esto es una ruta
  // pública: sin freno, recargar en bucle un enlace legítimo pone el NAS de rodillas.
  if (!rateLimit(`galeria-publica-list:${entrega.folderRel}`, 30, 60_000)) {
    return new NextResponse("Demasiadas peticiones", { status: 429, headers: { "Retry-After": "60" } });
  }

  try {
    const scan = await scanGaleria(entrega.folderRel);
    return NextResponse.json(
      { ok: true, ready: true, rel: entrega.folderRel, titulo: entrega.titulo, scan },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    // La carpeta existía cuando se firmó el enlace y ahora no se deja leer: mismo trato que un
    // NAS caído, no un error crudo en la cara del cliente.
    return NextResponse.json({
      ok: true,
      ready: false,
      motivo: "no_disponible",
      mensaje: "Tu galería no está disponible en este momento. Vuelve a intentarlo en unos minutos o escríbenos.",
    });
  }
}
