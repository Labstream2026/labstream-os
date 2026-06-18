// Login con Authentik (OIDC, authorization code flow). Gateado por env:
// AUTHENTIK_ISSUER / AUTHENTIK_CLIENT_ID / AUTHENTIK_CLIENT_SECRET.
// Sin esas 3 → solo email+contraseña. Mapea usuarios por email (como la otra app).

const ISSUER = process.env.AUTHENTIK_ISSUER;
const CLIENT_ID = process.env.AUTHENTIK_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTHENTIK_CLIENT_SECRET;

export const authentikEnabled = Boolean(ISSUER && CLIENT_ID && CLIENT_SECRET);

// Dominios permitidos para ALTA automática (JIT) de usuarios nuevos vía SSO. Acepta lista
// separada por comas en AUTHENTIK_PROVISION_DOMAIN. Por defecto, los dos dominios del
// equipo (el de la marca y el del NAS), para que el primer ingreso con cualquiera de los
// dos cree el usuario tomando su correo de Authentik.
const PROVISION_DOMAINS = (process.env.AUTHENTIK_PROVISION_DOMAIN || "labstreamsas.com,labstream.co")
  .split(",")
  .map((d) => d.trim().replace(/^@/, "").toLowerCase())
  .filter(Boolean);

// Compat: primer dominio (algunos sitios lo muestran como referencia).
export const PROVISION_DOMAIN = PROVISION_DOMAINS[0] ?? "labstreamsas.com";

// ¿Se puede crear automáticamente un usuario con este correo? (dominio permitido)
export function isProvisionableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return PROVISION_DOMAINS.includes(domain);
}

// Exigir email_verified del IdP solo si se activa explícitamente (Authentik es un IdP
// interno de confianza y a menudo no marca el correo como verificado para cuentas creadas
// por el admin; exigirlo rompía logins válidos). OIDC_REQUIRE_EMAIL_VERIFIED=true para
// volver a exigirlo.
export const REQUIRE_EMAIL_VERIFIED = process.env.OIDC_REQUIRE_EMAIL_VERIFIED === "true";

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

export async function authorizeUrl(redirectUri: string, state: string, nonce: string): Promise<string> {
  const d = await discovery();
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set("client_id", CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("nonce", nonce); // anti-replay: el IdP lo devuelve dentro del id_token
  return u.toString();
}

export async function exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string; idToken: string | null }> {
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
  const json = (await res.json()) as { access_token: string; id_token?: string };
  return { accessToken: json.access_token, idToken: json.id_token ?? null };
}

// Decodifica los claims del id_token (payload del JWT) SIN verificar la firma. El id_token
// llega por canal DIRECTO servidor→servidor (TLS) desde el token endpoint con cliente
// confidencial (client_secret), así que el canal ya es de confianza; aquí solo leemos
// `nonce` (ligar el token a ESTE login → anti-replay) y `exp` (rechazar expirados). La
// verificación de firma por JWKS queda como endurecimiento futuro (requiere probar el SSO).
export function decodeIdTokenClaims(idToken: string | null): { nonce?: string; exp?: number; email_verified?: boolean } | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as { nonce?: string; exp?: number; email_verified?: boolean };
  } catch {
    return null;
  }
}

export type OidcUser = { email: string; name: string; sub: string; emailVerified: boolean | null };

export async function fetchUserinfo(accessToken: string): Promise<OidcUser> {
  const d = await discovery();
  const res = await fetch(d.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("OIDC userinfo falló");
  const u = (await res.json()) as { email: string; name?: string; preferred_username?: string; sub: string; email_verified?: boolean };
  return {
    email: u.email,
    name: u.name || u.preferred_username || u.email,
    sub: u.sub,
    emailVerified: typeof u.email_verified === "boolean" ? u.email_verified : null,
  };
}
