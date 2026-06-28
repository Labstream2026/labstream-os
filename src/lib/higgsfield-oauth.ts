import crypto from "node:crypto";
import { db } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// OAuth 2.0 (+PKCE) contra el MCP de Higgsfield. Da acceso con los créditos del PLAN del usuario
// (a diferencia de la Cloud API, que tiene saldo aparte). El refresh_token se guarda CIFRADO en
// HiggsfieldAuth; el access_token se obtiene por refresh y se cachea en memoria. Higgsfield puede
// ROTAR el refresh_token → se re-guarda.

const BASE = "https://mcp.higgsfield.ai";
export const HF_MCP_URL = `${BASE}/mcp`;
const REGISTER = `${BASE}/oauth2/register`;
const AUTHORIZE = `${BASE}/oauth2/authorize`;
const TOKEN = `${BASE}/oauth2/token`;
export const HF_SCOPE = "openid email offline_access";

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function genPkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}
export function genState() {
  return b64url(crypto.randomBytes(16));
}

// Registro dinámico de cliente OAuth (cliente público, sin secreto). Devuelve el client_id.
export async function registerClient(redirectUri: string): Promise<string> {
  const res = await fetch(REGISTER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Labstream OS",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: HF_SCOPE,
    }),
  });
  if (!res.ok) throw new Error(`registro OAuth de Higgsfield falló (${res.status})`);
  const j = (await res.json()) as { client_id?: string };
  if (!j.client_id) throw new Error("el registro OAuth no devolvió client_id");
  return j.client_id;
}

export function authorizeUrl(p: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: HF_SCOPE,
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE}?${q.toString()}`;
}

type TokenResp = { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; error?: string };

export async function exchangeCode(p: { code: string; clientId: string; redirectUri: string; verifier: string }): Promise<TokenResp> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: p.code,
      redirect_uri: p.redirectUri,
      client_id: p.clientId,
      code_verifier: p.verifier,
    }),
  });
  return (await res.json().catch(() => ({}))) as TokenResp;
}

// ── Persistencia (fila única "default") ──
export async function getHiggsfieldAuth() {
  return db.higgsfieldAuth.findUnique({ where: { id: "default" } });
}
export async function isHiggsfieldConnected(): Promise<boolean> {
  const a = await getHiggsfieldAuth();
  return !!(a?.refreshTokenEnc && a.clientId);
}
export async function saveHiggsfieldAuth(p: { clientId: string; refreshToken: string; connectedById?: string; connectedByName?: string }) {
  const refreshTokenEnc = encryptSecret(p.refreshToken);
  const data = {
    clientId: p.clientId,
    refreshTokenEnc,
    connectedById: p.connectedById ?? null,
    connectedByName: p.connectedByName ?? null,
    connectedAt: new Date(),
  };
  await db.higgsfieldAuth.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  _accessCache = null;
}
export async function disconnectHiggsfield() {
  await db.higgsfieldAuth.deleteMany({});
  _accessCache = null;
}

// ── Access token (refresh grant, cacheado en memoria) ──
let _accessCache: { token: string; exp: number } | null = null;

export async function getHiggsfieldAccessToken(): Promise<string | null> {
  if (_accessCache && _accessCache.exp > Date.now() + 30_000) return _accessCache.token;
  const a = await getHiggsfieldAuth();
  if (!a?.refreshTokenEnc || !a.clientId) return null;
  const refresh = decryptSecret(a.refreshTokenEnc);
  if (!refresh) return null;
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: a.clientId, scope: HF_SCOPE }),
  });
  const j = (await res.json().catch(() => ({}))) as TokenResp;
  if (!res.ok || !j.access_token) {
    // refresh inválido/revocado → desconectar para que la UI pida reconectar.
    if (res.status === 400 || res.status === 401) await disconnectHiggsfield().catch(() => {});
    return null;
  }
  // Rotación del refresh_token → re-guardar el nuevo.
  if (j.refresh_token && j.refresh_token !== refresh) {
    await db.higgsfieldAuth.update({ where: { id: "default" }, data: { refreshTokenEnc: encryptSecret(j.refresh_token) } }).catch(() => {});
  }
  const ttl = (j.expires_in ?? 3600) * 1000;
  _accessCache = { token: j.access_token, exp: Date.now() + ttl };
  return j.access_token;
}
