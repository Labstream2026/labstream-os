import { NextResponse, type NextRequest } from "next/server";
import { authentikEnabled, authorizeUrl } from "@/lib/oidc";
import { safeNext } from "@/lib/safe-next";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Misma base que el callback (NEXTAUTH_URL → origin) para que el redirect_uri
  // del authorize coincida EXACTO con el del token exchange; si no, Authentik rechaza.
  const base = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  if (!authentikEnabled) {
    return NextResponse.redirect(new URL("/login?error=sso", base));
  }
  const state = globalThis.crypto.randomUUID();
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const redirectUri = `${base}/api/auth/oidc/callback`;
  const url = await authorizeUrl(redirectUri, state);

  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };
  const res = NextResponse.redirect(url);
  res.cookies.set("oidc_state", state, cookieOpts);
  // Guardamos el destino para retomarlo tras el callback (sin confiar en el query del proveedor).
  res.cookies.set("oidc_next", next, cookieOpts);
  return res;
}
