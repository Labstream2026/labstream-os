import { NextResponse } from "next/server";
import { authentikEnabled, authorizeUrl } from "@/lib/oidc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function baseUrl() {
  return process.env.NEXTAUTH_URL || "http://localhost:3200";
}

export async function GET() {
  const base = baseUrl();
  if (!authentikEnabled) {
    return NextResponse.redirect(new URL("/login?error=sso", base));
  }
  const state = globalThis.crypto.randomUUID();
  const redirectUri = `${base}/api/auth/oidc/callback`;
  const url = await authorizeUrl(redirectUri, state);

  const res = NextResponse.redirect(url);
  res.cookies.set("oidc_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
