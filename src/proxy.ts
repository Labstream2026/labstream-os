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
// - /api/cron: trabajos programados del NAS (protegidos por CRON_SECRET, no por sesión).
// - /api/review-media: video de Drive proxiado para el portal de revisión (token firmado).
// - /api/files-asset: archivo de proyecto servido por token firmado (lo usa el portal).
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/review", "/cotizacion", "/p", "/api/proposal-img", "/api/cron", "/api/review-media", "/api/files-asset", "/api/whatsapp"];

// Los callbacks de OnlyOffice (Document Server → app, en /api/docs/.../callback) se autentican
// con su PROPIO JWT (verifyCallbackToken), no con la sesión del navegador. El Document Server no
// tiene cookie de sesión: sin esta excepción el middleware lo redirige a /login, el DS sigue el
// redirect y recibe el HTML del login (200) en vez del documento → el guardado falla con "No se
// ha podido guardar" SIN error de red (por eso no aparecía nada en los logs del DS).
function isOnlyOfficeCallback(pathname: string) {
  return pathname.startsWith("/api/docs/") && pathname.endsWith("/callback");
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic =
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/")) || isOnlyOfficeCallback(pathname);

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
