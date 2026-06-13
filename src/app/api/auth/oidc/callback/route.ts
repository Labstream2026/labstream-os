import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { authentikEnabled, exchangeCode, fetchUserinfo, PROVISION_DOMAIN } from "@/lib/oidc";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const roleInclude = { role: { include: { permissions: { include: { permission: true } } } } } as const;

export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  const fail = (e: string) => {
    const r = NextResponse.redirect(new URL(`/login?error=${e}`, base));
    r.cookies.delete("oidc_state");
    return r;
  };

  if (!authentikEnabled) return fail("sso");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = req.cookies.get("oidc_state")?.value;
  if (!code || !state || !expected || state !== expected) return fail("state");

  try {
    const redirectUri = `${base}/api/auth/oidc/callback`;
    const accessToken = await exchangeCode(code, redirectUri);
    const info = await fetchUserinfo(accessToken);
    const email = info.email.toLowerCase();

    let user = await db.user.findUnique({ where: { email }, include: roleInclude });

    if (!user) {
      if (!email.endsWith(`@${PROVISION_DOMAIN}`)) return fail("dominio");
      const role = await db.role.findUnique({ where: { key: "editor" } });
      if (!role) return fail("rol");
      const initials = info.name
        .split(" ")
        .map((s) => s[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      user = await db.user.create({
        data: { email, name: info.name, roleId: role.id, initials, avatarColor: "slate" },
        include: roleInclude,
      });
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

    const res = NextResponse.redirect(new URL("/", base));
    res.cookies.delete("oidc_state");
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
