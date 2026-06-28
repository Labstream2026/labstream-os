import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { exchangeCode, saveHiggsfieldAuth } from "@/lib/higgsfield-oauth";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Retorno del OAuth de Higgsfield: valida el state, intercambia el code por tokens y guarda el
// refresh_token (cifrado). Lo abre el navegador del admin (lleva su sesión).
export async function GET(req: NextRequest) {
  const session = await getSession();
  const base = (process.env.NEXTAUTH_URL || req.nextUrl.origin).replace(/\/$/, "");
  const done = (estado: string) => {
    const res = NextResponse.redirect(new URL(`/configuracion/higgsfield?estado=${estado}`, base));
    res.cookies.delete("hf_oauth");
    return res;
  };
  if (!session || session.role !== "admin") return NextResponse.redirect(new URL("/login", base));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const raw = req.cookies.get("hf_oauth")?.value;
  if (!code || !raw) return done("error");

  let saved: { clientId?: string; verifier?: string; state?: string };
  try {
    saved = JSON.parse(decryptSecret(raw));
  } catch {
    return done("error");
  }
  if (!saved.clientId || !saved.verifier || !saved.state || saved.state !== state) return done("error");

  const redirectUri = `${base}/api/higgsfield/callback`;
  const tok = await exchangeCode({ code, clientId: saved.clientId, redirectUri, verifier: saved.verifier });
  if (!tok.refresh_token) return done("error");

  await saveHiggsfieldAuth({
    clientId: saved.clientId,
    refreshToken: tok.refresh_token,
    connectedById: session.id,
    connectedByName: session.name,
  });
  return done("ok");
}
