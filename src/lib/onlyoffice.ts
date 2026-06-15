import { SignJWT, jwtVerify } from "jose";
import { extOf } from "@/lib/storage";

// Integración con el Document Server OnlyOffice del NAS (https://docs.labstreamsas.com).
// Gateado por env ONLYOFFICE_DOCS_URL; firma de config opcional con ONLYOFFICE_JWT_SECRET.
export const DOCS_URL = (process.env.ONLYOFFICE_DOCS_URL || "").replace(/\/$/, "");
const JWT_SECRET = process.env.ONLYOFFICE_JWT_SECRET || "";
export const onlyofficeEnabled = Boolean(DOCS_URL);

// URL con la que el Document Server (OnlyOffice) DESCARGA el documento y envía el
// callback. OJO: es la app vista DESDE el contenedor de OnlyOffice, no desde el
// navegador. Como app y OnlyOffice están en redes Docker distintas, el dominio
// público (NEXTAUTH_URL = https://os.labstreamsas.com) suele NO ser alcanzable
// (NAT loopback / TLS) → "Error de descarga". Configura ONLYOFFICE_CALLBACK_BASE
// con una dirección que el contenedor SÍ alcance: la IP LAN del NAS, p.ej.
// http://192.168.1.50:3200, o el nombre de servicio si comparten red Docker.
export const APP_BASE = (
  process.env.ONLYOFFICE_CALLBACK_BASE ||
  process.env.NEXTAUTH_URL ||
  "http://localhost:3200"
).replace(/\/$/, "");

// Dirección del Document Server alcanzable DESDE el contenedor de la app, para
// descargar el archivo editado al guardar. Igual que arriba pero al revés: el
// dominio público (docs.labstreamsas.com) no es alcanzable entre contenedores
// → "No se ha podido guardar". Configura ONLYOFFICE_INTERNAL_URL con la IP LAN
// del NAS y el puerto de OnlyOffice, p.ej. http://192.168.1.50:8088.
export const DOCS_INTERNAL_URL = (process.env.ONLYOFFICE_INTERNAL_URL || "").replace(/\/$/, "");

const WORD = ["doc", "docx", "odt", "rtf", "txt"];
const CELL = ["xls", "xlsx", "ods", "csv"];
const SLIDE = ["ppt", "pptx", "odp"];

export function officeType(name: string): "word" | "cell" | "slide" | null {
  const e = extOf(name);
  if (WORD.includes(e)) return "word";
  if (CELL.includes(e)) return "cell";
  if (SLIDE.includes(e)) return "slide";
  return null;
}

export function isEditableOffice(name: string) {
  return onlyofficeEnabled && officeType(name) !== null;
}

export type EditorConfig = {
  document: {
    fileType: string;
    key: string;
    title: string;
    url: string;
    permissions: { edit: boolean; download: boolean };
  };
  documentType: "word" | "cell" | "slide";
  editorConfig: {
    mode: "edit" | "view";
    callbackUrl: string;
    lang: string;
    user: { id: string; name: string };
  };
  token?: string;
};

export function buildConfig(opts: {
  attachmentId: string;
  name: string;
  version: number;
  fileUrl: string;
  callbackUrl: string;
  canEdit: boolean;
  user: { id: string; name: string };
}): EditorConfig {
  const type = officeType(opts.name) ?? "word";
  return {
    document: {
      fileType: extOf(opts.name),
      key: `${opts.attachmentId}_${opts.version}`, // debe cambiar cuando cambia el archivo
      title: opts.name,
      url: opts.fileUrl,
      permissions: { edit: opts.canEdit, download: true },
    },
    documentType: type,
    editorConfig: {
      mode: opts.canEdit ? "edit" : "view",
      callbackUrl: opts.callbackUrl,
      lang: "es",
      user: opts.user,
    },
  };
}

export async function signConfig(config: EditorConfig): Promise<EditorConfig> {
  if (!JWT_SECRET) return config;
  const token = await new SignJWT(config as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(JWT_SECRET));
  return { ...config, token };
}

// Verifica el JWT que el Document Server envía en el callback (body.token o header).
// SIN secreto configurado NO se acepta el callback: aceptarlo permitiría a cualquiera
// sobrescribir archivos (fs.writeFile desde una url arbitraria) y forzar SSRF.
export async function verifyCallbackToken(token: string | undefined): Promise<boolean> {
  if (!JWT_SECRET || !token) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    return true;
  } catch {
    return false;
  }
}

// El callback solo puede descargar el archivo editado desde el propio Document
// Server. Evita SSRF: la url debe apuntar al host público (ONLYOFFICE_DOCS_URL) o
// al interno (ONLYOFFICE_INTERNAL_URL); cualquier otro host se rechaza.
export function isAllowedDocsUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).host;
    const allowed = [DOCS_URL, DOCS_INTERNAL_URL]
      .filter(Boolean)
      .map((u) => new URL(u).host);
    return allowed.includes(host);
  } catch {
    return false;
  }
}

// Reescribe la url que envía OnlyOffice (normalmente con el host público) hacia
// la dirección interna alcanzable por el contenedor de la app, conservando ruta
// y query. Si no hay URL interna configurada, se deja igual.
export function internalDocsFetchUrl(url: string): string {
  if (!DOCS_INTERNAL_URL) return url;
  try {
    const u = new URL(url);
    const internal = new URL(DOCS_INTERNAL_URL);
    u.protocol = internal.protocol;
    u.host = internal.host; // host incluye el puerto
    return u.toString();
  } catch {
    return url;
  }
}
