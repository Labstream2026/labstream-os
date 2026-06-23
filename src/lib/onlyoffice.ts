import { SignJWT, jwtVerify } from "jose";
import { extOf } from "@/lib/storage";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

// Integración con el Document Server de OnlyOffice (edición colaborativa de documentos).
// La configuración vive en la BD (Configuración → Integraciones); si no hay fila, se cae a
// las variables de entorno ONLYOFFICE_* (compatibilidad con despliegues previos).
//
// OnlyOffice necesita TRES caminos de red:
//  - navegador → Document Server (docsUrl, público).
//  - Document Server → la app, para descargar el doc y enviar el callback (callbackBase). El
//    dominio público de la app suele NO ser alcanzable entre contenedores (NAT/TLS) → usar la
//    IP LAN del NAS, p.ej. http://192.168.0.22:3100.
//  - app → Document Server, para bajar el doc editado al guardar (internalUrl), p.ej.
//    http://192.168.0.22:8088. Si falta, da "No se ha podido guardar".

export type OnlyOfficeConfig = {
  enabled: boolean;
  docsUrl: string; // público (navegador), sin barra final
  jwtSecret: string; // secreto compartido con el Document Server (puede ser "")
  callbackBase: string; // la app vista desde el contenedor de OnlyOffice
  internalUrl: string; // el Document Server visto desde el contenedor de la app ("" si no)
};

const stripSlash = (s: string) => s.replace(/\/+$/, "");

// Caché en proceso (se limpia al guardar desde Configuración). `undefined` = no leído aún.
let _cache: OnlyOfficeConfig | undefined;
export function clearOnlyOfficeCache() {
  _cache = undefined;
}

export async function getOnlyOfficeConfig(): Promise<OnlyOfficeConfig> {
  if (_cache !== undefined) return _cache;
  const row = await db.onlyOfficeSettings.findUnique({ where: { id: "default" } }).catch(() => null);
  const docsUrl = stripSlash(row?.docsUrl || process.env.ONLYOFFICE_DOCS_URL || "");
  const jwtSecret = row?.jwtSecretEnc ? decryptSecret(row.jwtSecretEnc) : process.env.ONLYOFFICE_JWT_SECRET || "";
  const callbackBase = stripSlash(
    row?.callbackBase || process.env.ONLYOFFICE_CALLBACK_BASE || process.env.NEXTAUTH_URL || "http://localhost:3200",
  );
  const internalUrl = stripSlash(row?.internalUrl || process.env.ONLYOFFICE_INTERNAL_URL || "");
  // Activo si hay docsUrl Y (no hay fila → env; hay fila → su bandera enabled).
  const enabled = Boolean(docsUrl) && (row ? row.enabled : true);
  _cache = { enabled, docsUrl, jwtSecret, callbackBase, internalUrl };
  return _cache;
}

// ¿Está OnlyOffice conectado (hay Document Server configurado y activo)?
export async function onlyofficeReady(): Promise<boolean> {
  return (await getOnlyOfficeConfig()).enabled;
}

const WORD = ["doc", "docx", "odt", "rtf", "txt"];
const CELL = ["xls", "xlsx", "ods", "csv"];
const SLIDE = ["ppt", "pptx", "odp"];
// PDF: el Document Server lo abre en su visor-editor de PDF (ver, anotar, rellenar
// formularios) con documentType "pdf", y su ConvertService lo convierte a txt para "Copiar".
const PDF = ["pdf"];

export function officeType(name: string): "word" | "cell" | "slide" | "pdf" | null {
  const e = extOf(name);
  if (WORD.includes(e)) return "word";
  if (CELL.includes(e)) return "cell";
  if (SLIDE.includes(e)) return "slide";
  if (PDF.includes(e)) return "pdf";
  return null;
}

// ¿Es un documento de Office editable? Por TIPO de archivo (no consulta la BD para poder
// usarse en render síncrono). Si OnlyOffice no está conectado, la página del editor avisa.
export function isEditableOffice(name: string) {
  return officeType(name) !== null;
}

export type EditorConfig = {
  document: {
    fileType: string;
    key: string;
    title: string;
    url: string;
    permissions: { edit: boolean; download: boolean };
  };
  documentType: "word" | "cell" | "slide" | "pdf";
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

// Firma la config del editor con el secreto JWT (si hay). El Document Server con JWT activo
// exige este token; el secreto debe coincidir a ambos lados.
export async function signConfig(config: EditorConfig): Promise<EditorConfig> {
  const { jwtSecret } = await getOnlyOfficeConfig();
  if (!jwtSecret) return config;
  const token = await new SignJWT(config as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(jwtSecret));
  return { ...config, token };
}

// Verifica el JWT que el Document Server envía en el callback. SIN secreto configurado NO se
// acepta el callback (evitaría que cualquiera sobrescriba archivos / SSRF).
export async function verifyCallbackToken(token: string | undefined): Promise<boolean> {
  const { jwtSecret } = await getOnlyOfficeConfig();
  if (!jwtSecret || !token) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(jwtSecret));
    return true;
  } catch {
    return false;
  }
}

// El callback solo descarga el archivo editado del propio Document Server (público o interno).
// Cualquier otro host se rechaza (anti-SSRF).
export async function isAllowedDocsUrl(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  const { docsUrl, internalUrl } = await getOnlyOfficeConfig();
  try {
    const host = new URL(url).host;
    const allowed = [docsUrl, internalUrl].filter(Boolean).map((u) => new URL(u).host);
    return allowed.includes(host);
  } catch {
    return false;
  }
}

// Reescribe la url de OnlyOffice (host público) hacia la dirección interna alcanzable por el
// contenedor de la app, conservando ruta y query. Si no hay URL interna, se deja igual.
function internalDocsFetchUrl(url: string, internalUrl: string): string {
  if (!internalUrl) return url;
  try {
    const u = new URL(url);
    const internal = new URL(internalUrl);
    u.protocol = internal.protocol;
    u.host = internal.host; // host incluye el puerto
    return u.toString();
  } catch {
    return url;
  }
}

// Descarga el documento editado del Document Server probando primero la dirección interna y
// luego la original. Lanza con detalle si todas fallan (para diagnosticar el "No se ha podido
// guardar"). Verifica res.ok para no escribir una página de error como si fuera el documento.
export async function fetchSavedDoc(url: string): Promise<Buffer> {
  const { internalUrl } = await getOnlyOfficeConfig();
  const candidates = [...new Set([internalDocsFetchUrl(url, internalUrl), url].filter(Boolean))];
  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { cache: "no-store" });
      if (!res.ok) { errors.push(`${candidate} → HTTP ${res.status}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) { errors.push(`${candidate} → vacío`); continue; }
      return buf;
    } catch (e) {
      errors.push(`${candidate} → ${e instanceof Error ? e.message : "error de red"}`);
    }
  }
  throw new Error(
    `OnlyOffice: no se pudo descargar el documento guardado. Intentos: ${errors.join(" | ")}. ` +
      `Revisa la "URL interna" del Document Server (alcanzable desde el contenedor de la app).`,
  );
}

// Convierte un documento de Office a TEXTO PLANO usando ConvertService.ashx del Document
// Server (para el botón «Copiar» de los guiones). El DS descarga el original desde sourceUrl
// (callbackBase + token), convierte a txt y devuelve una URL que bajamos (reescrita a interno
// y validada anti-SSRF).
export async function convertOfficeToText(opts: {
  fileId: string;
  name: string;
  version: number;
  sourceUrl: string;
}): Promise<string> {
  const cfg = await getOnlyOfficeConfig();
  if (!cfg.enabled) throw new Error("OnlyOffice no está configurado.");
  const base = (cfg.internalUrl || cfg.docsUrl).replace(/\/$/, "");
  const payload: Record<string, unknown> = {
    async: false,
    filetype: extOf(opts.name) || "docx",
    outputtype: "txt",
    key: `txt_${opts.fileId}_${opts.version}`,
    title: opts.name,
    url: opts.sourceUrl,
  };
  const token = cfg.jwtSecret
    ? await new SignJWT(payload as Record<string, unknown>)
        .setProtectedHeader({ alg: "HS256" })
        .sign(new TextEncoder().encode(cfg.jwtSecret))
    : "";
  const res = await fetch(`${base}/ConvertService.ashx`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(token ? { ...payload, token } : payload),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Servicio de conversión: HTTP ${res.status}.`);
  const data = (await res.json()) as { error?: number; endConvert?: boolean; fileUrl?: string };
  if (typeof data.error === "number") throw new Error(`No se pudo convertir el documento (código ${data.error}).`);
  if (!data.endConvert || !data.fileUrl) throw new Error("La conversión no terminó.");
  if (!(await isAllowedDocsUrl(data.fileUrl))) throw new Error("URL de conversión no permitida.");
  const buf = await fetchSavedDoc(data.fileUrl);
  return buf.toString("utf8").replace(/^﻿/, ""); // quita BOM inicial si lo trae
}
