import { SignJWT, jwtVerify } from "jose";
import { extOf } from "@/lib/storage";

// Integración con el Document Server OnlyOffice del NAS (https://docs.labstreamsas.com).
// Gateado por env ONLYOFFICE_DOCS_URL; firma de config opcional con ONLYOFFICE_JWT_SECRET.
export const DOCS_URL = (process.env.ONLYOFFICE_DOCS_URL || "").replace(/\/$/, "");
const JWT_SECRET = process.env.ONLYOFFICE_JWT_SECRET || "";
export const onlyofficeEnabled = Boolean(DOCS_URL);

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
export async function verifyCallbackToken(token: string | undefined): Promise<boolean> {
  if (!JWT_SECRET) return true; // si el server no usa JWT, no verificamos
  if (!token) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    return true;
  } catch {
    return false;
  }
}
