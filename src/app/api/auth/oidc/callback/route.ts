import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { authentikEnabled, exchangeCode, fetchUserinfo, decodeIdTokenClaims, PROVISION_DOMAIN } from "@/lib/oidc";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { safeNext } from "@/lib/safe-next";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const roleInclude = { role: { include: { permissions: { include: { permission: true } } } } } as const;

// Iniciales a partir del nombre, tolerando espacios extra / nombres vacíos.
function initialsFrom(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const src = parts.length ? parts : [email];
  return src
    .map((s) => s[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  const fail = (e: string) => {
    const r = NextResponse.redirect(new URL(`/login?error=${e}`, base));
    r.cookies.delete("oidc_state");
    r.cookies.delete("oidc_nonce");
    r.cookies.delete("oidc_next");
    return r;
  };

  if (!authentikEnabled) return fail("sso");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = req.cookies.get("oidc_state")?.value;
  if (!code || !state || !expected || state !== expected) return fail("state");

  const expectedNonce = req.cookies.get("oidc_nonce")?.value;
  const next = safeNext(req.cookies.get("oidc_next")?.value);

  try {
    const redirectUri = `${base}/api/auth/oidc/callback`;
    const { accessToken, idToken } = await exchangeCode(code, redirectUri);

    // Validaciones del id_token (canal directo de confianza; sin verificar firma):
    const claims = decodeIdTokenClaims(idToken);
    // Anti-replay: si el id_token trae `nonce`, DEBE coincidir con el de esta sesión.
    // (Si el IdP no lo incluyera —misconfig— no bloqueamos el login.)
    if (claims?.nonce && claims.nonce !== expectedNonce) return fail("nonce");
    // Rechazar un id_token expirado.
    if (typeof claims?.exp === "number" && claims.exp * 1000 < Date.now()) return fail("expirado");

    const info = await fetchUserinfo(accessToken);
    const email = info.email?.trim().toLowerCase();
    if (!email) return fail("email");
    // Rechazar SOLO si el proveedor marca el email explícitamente como no verificado.
    if (info.emailVerified === false) return fail("email_no_verificado");

    let user = await db.user.findUnique({ where: { email }, include: roleInclude });

    if (!user) {
      if (!email.endsWith(`@${PROVISION_DOMAIN}`)) return fail("dominio");
      const role = await db.role.findUnique({ where: { key: "editor" } });
      if (!role) return fail("rol");
      try {
        user = await db.user.create({
          data: {
            email,
            name: info.name || email,
            roleId: role.id,
            initials: initialsFrom(info.name, email),
            avatarColor: "slate",
          },
          include: roleInclude,
        });
      } catch {
        // Carrera: otra petición creó el usuario en paralelo → reintentar lectura.
        user = await db.user.findUnique({ where: { email }, include: roleInclude });
        if (!user) return fail("oidc");
      }
    }

    if (!user.active) return fail("inactivo");

    const token = await signSession({
      id: user.id,
      email: user.email,
      name: user.name,
      title: user.title,
      role: user.role.key,
      perms: user.role.permissions.map((rp) => rp.permission.key),
      initials: user.initials,
      color: user.avatarColor,
    });

    const res = NextResponse.redirect(new URL(next, base));
    res.cookies.delete("oidc_state");
    res.cookies.delete("oidc_nonce");
    res.cookies.delete("oidc_next");
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch {
    return fail("oidc");
  }
}
