// Login con Authentik (OIDC, authorization code flow). Gateado por env:
// AUTHENTIK_ISSUER / AUTHENTIK_CLIENT_ID / AUTHENTIK_CLIENT_SECRET.
// Sin esas 3 → solo email+contraseña. Mapea usuarios por email (como la otra app).

const ISSUER = process.env.AUTHENTIK_ISSUER;
const CLIENT_ID = process.env.AUTHENTIK_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTHENTIK_CLIENT_SECRET;

export const authentikEnabled = Boolean(ISSUER && CLIENT_ID && CLIENT_SECRET);
export const PROVISION_DOMAIN = process.env.AUTHENTIK_PROVISION_DOMAIN || "labstreamsas.com";

function base() {
  // el issuer suele terminar en "/"; normalizamos para .well-known
  return ISSUER!.endsWith("/") ? ISSUER! : `${ISSUER!}/`;
}

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
};

let cached: Discovery | null = null;
async function discovery(): Promise<Discovery> {
  if (cached) return cached;
  const res = await fetch(new URL(".well-known/openid-configuration", base()), { cache: "no-store" });
  if (!res.ok) throw new Error("OIDC discovery falló");
  cached = (await res.json()) as Discovery;
  return cached;
}

export async function authorizeUrl(redirectUri: string, state: string): Promise<string> {
  const d = await discovery();
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set("client_id", CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const d = await discovery();
  const res = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("OIDC token exchange falló");
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export type OidcUser = { email: string; name: string; sub: string };

export async function fetchUserinfo(accessToken: string): Promise<OidcUser> {
  const d = await discovery();
  const res = await fetch(d.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("OIDC userinfo falló");
  const u = (await res.json()) as { email: string; name?: string; preferred_username?: string; sub: string };
  return { email: u.email, name: u.name || u.preferred_username || u.email, sub: u.sub };
}
