import { createSign } from "node:crypto";

// Token de acceso de Google para una CUENTA DE SERVICIO, firmado a mano (sin dependencias).
//
// Por qué existe: las descargas ANÓNIMAS de Drive tienen un tope diario POR ARCHIVO. El archivo
// que más revisa el equipo es justo el que primero se bloquea ("Quota exceeded"), y entonces el
// video no carga → sin segundo ni captura de fotograma. Autenticadas, las descargas pasan al cupo
// del PROYECTO de Google Cloud (1 TB/día, ~400 millones de unidades antes de cobrar; una descarga
// son 200 unidades), que a la escala del estudio es inalcanzable. El problema desaparece de raíz.
//
// Por qué a mano y no con `googleapis`/`google-auth-library`: el `npm ci` del NAS ya corta
// conexiones a ratos (ECONNRESET → deploy a medias); meter un árbol de dependencias grande por
// ~40 líneas de firma JWT empeoraría la fragilidad del despliegue sin ganar nada.
//
// Es OPCIONAL: sin `GOOGLE_SERVICE_ACCOUNT_JSON` configurado todo sigue funcionando como hoy
// (descarga anónima). Solo mejora si la credencial está puesta.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
// Solo LECTURA: aunque la credencial se filtrara, no puede modificar ni borrar nada en Drive.
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

type ServiceAccount = { client_email: string; private_key: string };

// Token cacheado en memoria: Google los emite por 1 h. Sin esto pediríamos uno en cada descarga.
let cached: { token: string; expiresAt: number } | null = null;
// Petición en curso: comparte la MISMA para que N descargas simultáneas no pidan N tokens.
let inFlight: Promise<string | null> | null = null;
// Para avisar UNA vez en el log de que la credencial funciona (y no en cada renovación horaria).
let announced = false;
// Enfriamiento tras un rechazo de Google (credencial mal pegada, API sin habilitar, reloj
// desfasado). Sin esto, con una clave inválida CADA apertura de video volvería a firmar y a
// llamar al endpoint de tokens: ruido en el log, latencia añadida a cada descarga y riesgo de que
// Google nos limite por insistir. Durante el enfriamiento se va directo al modo anónimo.
// Mismo criterio que el enfriamiento de la caché de revisión (review-cache.ts).
let lastFail = 0;
const FAIL_COOLDOWN_MS = 5 * 60_000;

// Interpreta la credencial. Acepta el JSON tal cual o en base64 (más cómodo en un .env de una
// sola línea: el JSON de Google trae saltos de línea en la clave privada y un .env los parte).
// Exportada para poder probar los formatos sin tocar el entorno: es justo donde más fácil se
// falla al pegar la clave a mano.
export function parseServiceAccount(raw: string | undefined | null): ServiceAccount | null {
  const s = raw?.trim();
  if (!s) return null;
  try {
    const text = s.startsWith("{") ? s : Buffer.from(s, "base64").toString("utf8");
    const sa = JSON.parse(text) as Partial<ServiceAccount>;
    if (!sa.client_email || !sa.private_key) return null;
    // Si el JSON viajó por un .env, los "\n" de la clave llegan escapados y `createSign` los
    // rechaza ("no start line"). Restaurarlos hace que funcione en ambos formatos.
    return { client_email: sa.client_email, private_key: sa.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

function readServiceAccount(): ServiceAccount | null {
  return parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

// Devuelve un token de acceso válido, o null si no hay credencial o Google la rechaza (en cuyo
// caso el llamador cae a la descarga anónima de siempre). NO lanza.
export async function getGoogleAccessToken(): Promise<string | null> {
  // 60 s de margen: un token a punto de expirar podría caducar a mitad de una descarga larga.
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
  if (inFlight) return inFlight;
  if (lastFail && Date.now() - lastFail < FAIL_COOLDOWN_MS) return null; // en enfriamiento
  inFlight = fetchAccessToken().finally(() => { inFlight = null; });
  return inFlight;
}

async function fetchAccessToken(): Promise<string | null> {
  const sa = readServiceAccount();
  if (!sa) return null;
  try {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(
      JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp }),
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    const signature = signer.sign(sa.private_key).toString("base64url");
    const assertion = `${header}.${claims}.${signature}`;

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!res.ok) {
      // Credencial mal pegada, API sin habilitar o reloj desfasado. Se avisa y se sigue con la
      // descarga anónima: es preferible el modo degradado a dejar la revisión sin video.
      lastFail = Date.now();
      console.error("[google-auth] Google rechazó la cuenta de servicio:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      lastFail = Date.now();
      return null;
    }
    lastFail = 0; // se recuperó: vuelve a intentarlo con normalidad
    // Aviso ÚNICO al activarse (no en cada renovación): es la forma de confirmar desde
    // `docker logs` que la credencial quedó bien pegada, sin exponer ningún secreto.
    if (!announced) {
      announced = true;
      console.log("[google-auth] cuenta de servicio activa:", sa.client_email);
    }
    cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
    return cached.token;
  } catch (e) {
    // Clave privada ilegible ("no start line" si los saltos de línea se perdieron al pegarla) o
    // red caída. Igual que arriba: enfría y sigue en anónimo.
    lastFail = Date.now();
    console.error("[google-auth] no se pudo firmar el token:", e);
    return null;
  }
}
