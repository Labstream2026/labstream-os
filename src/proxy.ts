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
// - /invitacion: el usuario cliente fija su contraseña desde el enlace de invitación (token firmado);
//   aún no tiene sesión, así que debe ser pública.
// - /api/proposal-img: imágenes de propuesta (portada/carrusel) para el portal del cliente.
// - /api/cron: trabajos programados del NAS (protegidos por CRON_SECRET, no por sesión).
// - /api/review-media: video de Drive proxiado para el portal de revisión (token firmado).
// - /api/files-asset: archivo de proyecto servido por token firmado (lo usa el portal).
// - /api/openclaw: webhook inverso de OpenClaw (entrega imágenes/archivos al chat); usa
//   OPENCLAW_INBOUND_TOKEN, no la sesión del navegador.
// - /api/v1: API intermedia para servicios externos; se autentica por AppKey (Authorization:
//   Bearer) en cada ruta vía withApiKey(), NO por la cookie de sesión. Por eso debe quedar fuera
//   del redirect a /login (si no, una petición con Bearer recibiría el HTML del login).
// - /subir + /api/upload: portal PÚBLICO de subida del cliente (token firmado); el cliente sube su
//   material sin cuenta, así que la página y su endpoint deben quedar fuera del redirect a /login.
// - /api/calendar/feed: feed de suscripción de calendario (webcal/ics de solo lectura). Lo lee el
//   servidor de Google/Apple/Outlook SIN cookie; se autentica por el token secreto de la URL.
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/review", "/cotizacion", "/p", "/invitacion", "/subir", "/api/proposal-img", "/api/cron", "/api/review-media", "/api/files-asset", "/api/upload", "/api/whatsapp", "/api/openclaw", "/api/v1", "/api/calendar/feed"];

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

  // Las rutas públicas con su propia autenticación (Bearer en /api/v1, tokens en webhooks/cron)
  // NO dependen de la cookie de sesión: se cortocircuitan ANTES de verifyToken, para que un
  // NEXTAUTH_SECRET roto/ausente (que hace LANZAR a verifyToken) no devuelva 500 en TODA la API.
  // /login se excluye del atajo porque sí necesita saber si hay sesión (para redirigir si ya entró).
  if (isPublic && pathname !== "/login") return NextResponse.next();

  // Un secreto de sesión inválido no debe tumbar la app entera: si verifyToken lanza, se trata
  // como "sin sesión" (el usuario va a /login) en vez de propagar un 500.
  let session: Awaited<ReturnType<typeof verifyToken>>;
  try {
    session = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    session = null;
  }

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
