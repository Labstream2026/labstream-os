import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/session";

// Protección de rutas (Next 16 "proxy", antes "middleware").
// Rutas públicas (sin sesión):
// - /login: pantalla de acceso.
// - /api/auth: arranque/retorno de SSO (login + callback de Authentik). DEBEN ser
//   públicas o el usuario sin sesión nunca puede iniciar el flujo OIDC.
// - /review: portal de cliente (fase 5).
// - /cotizacion: vista pública de cotización para el cliente (token firmado).
// - /p: vista pública de una propuesta para el cliente (token firmado).
// - /api/proposal-img: imágenes de propuesta (portada/carrusel) para el portal del cliente.
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/review", "/cotizacion", "/p", "/api/proposal-img"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const session = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }

  if (session && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
