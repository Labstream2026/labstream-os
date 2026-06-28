import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { registerClient, authorizeUrl, genPkce, genState } from "@/lib/higgsfield-oauth";
import { encryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inicia el flujo OAuth de Higgsfield: registra un cliente, genera PKCE+state, los guarda en una
// cookie cifrada de vida corta y redirige a la pantalla de login/consentimiento de Higgsfield.
// Solo admins. El retorno cae en /api/higgsfield/callback.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const base = (process.env.NEXTAUTH_URL || req.nextUrl.origin).replace(/\/$/, "");
  if (!session || session.role !== "admin") return NextResponse.redirect(new URL("/login", base));
  const redirectUri = `${base}/api/higgsfield/callback`;
  let clientId: string;
  try {
    clientId = await registerClient(redirectUri);
  } catch {
    return NextResponse.redirect(new URL("/configuracion/higgsfield?estado=error", base));
  }
  const { verifier, challenge } = genPkce();
  const state = genState();
  const res = NextResponse.redirect(authorizeUrl({ clientId, redirectUri, challenge, state }));
  res.cookies.set("hf_oauth", encryptSecret(JSON.stringify({ clientId, verifier, state })), {
    httpOnly: true,
    secure: true,
    sameSite: "lax", // permite enviar la cookie en el redirect de vuelta de Higgsfield
    path: "/",
    maxAge: 600,
  });
  return res;
}
