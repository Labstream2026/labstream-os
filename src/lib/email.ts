import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

// Envío de correo con TRES orígenes de configuración, por prioridad:
//  1) BD (MailSettings, fila "default") — SMTP editable desde Configuración → Integraciones,
//     sin tocar el .env ni redesplegar. Pensado para Synology MailPlus.
//  2) Resend (API HTTP por 443) por env RESEND_API_KEY — esquiva el bloqueo de puertos SMTP.
//  3) SMTP por env (SMTP_*) — relay externo o MailPlus.
// Sin ninguna config, el envío queda deshabilitado (no rompe nada).

// ── SMTP por entorno (respaldo) ──
const ENV_HOST = process.env.SMTP_HOST;
const ENV_USER = process.env.SMTP_USER;
const ENV_PASSWORD = process.env.SMTP_PASSWORD;
const ENV_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const ENV_SECURE = process.env.SMTP_SECURE === "true" || ENV_PORT === 465;
const ENV_REJECT_UNAUTHORIZED = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false";

// ── Resend (API HTTP por 443) ──
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Remitente Resend (EXIGE dominio verificado). Orden: RESEND_FROM → SMTP_FROM → SMTP_USER.
const ENV_FROM = process.env.RESEND_FROM || process.env.SMTP_FROM || (ENV_USER ? `Labstream <${ENV_USER}>` : "");

export type MailProvider = "smtp" | "resend" | "none";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  rejectUnauthorized: boolean;
};

export type MailConfig =
  | { provider: "smtp"; enabled: true; smtp: SmtpConfig }
  | { provider: "resend"; enabled: true; from: string }
  | { provider: "none"; enabled: false };

// Cache breve de la config (evita leer la BD en cada correo de un envío masivo).
let cfgCache: { at: number; cfg: MailConfig } | null = null;
const CFG_TTL_MS = 15_000;

// Resuelve la configuración efectiva: BD primero, luego env. Cacheada ~15s.
export async function getMailConfig(force = false): Promise<MailConfig> {
  if (!force && cfgCache && Date.now() - cfgCache.at < CFG_TTL_MS) return cfgCache.cfg;
  let cfg: MailConfig = { provider: "none", enabled: false };

  // 1) BD (tiene prioridad si está activa y completa).
  try {
    const row = await db.mailSettings.findUnique({ where: { id: "default" } });
    if (row?.enabled && row.host && row.username && row.passwordEnc) {
      const from = row.fromEmail
        ? `${row.fromName || "Labstream OS"} <${row.fromEmail}>`
        : `${row.fromName || "Labstream OS"} <${row.username}>`;
      cfg = {
        provider: "smtp",
        enabled: true,
        smtp: {
          host: row.host,
          port: row.port,
          secure: row.secure,
          user: row.username,
          password: decryptSecret(row.passwordEnc),
          from,
          rejectUnauthorized: row.rejectUnauthorized,
        },
      };
    }
  } catch {
    /* sin BD disponible → cae a env */
  }

  // 2) Env: Resend.
  if (cfg.provider === "none" && RESEND_API_KEY) {
    cfg = { provider: "resend", enabled: true, from: ENV_FROM };
  }
  // 3) Env: SMTP.
  if (cfg.provider === "none" && ENV_HOST && ENV_USER && ENV_PASSWORD) {
    cfg = {
      provider: "smtp",
      enabled: true,
      smtp: { host: ENV_HOST, port: ENV_PORT, secure: ENV_SECURE, user: ENV_USER, password: ENV_PASSWORD, from: ENV_FROM, rejectUnauthorized: ENV_REJECT_UNAUTHORIZED },
    };
  }

  cfgCache = { at: Date.now(), cfg };
  return cfg;
}

// Invalida la cache (tras guardar la config desde la UI).
export function clearMailConfigCache() {
  cfgCache = null;
}

// ¿Está el correo configurado y activo? (BD o env). Para gating de UI/acciones.
export async function isEmailEnabled(): Promise<boolean> {
  return (await getMailConfig()).enabled;
}

// Proveedor activo (para mensajes de estado / prueba).
export async function currentEmailProvider(): Promise<MailProvider> {
  return (await getMailConfig()).provider;
}

type Cached = { sig: string; transporter: nodemailer.Transporter };
const g = globalThis as unknown as { __mail?: Cached };

// Transporter SMTP reutilizable, recreado solo si cambia la configuración.
function transporter(c: SmtpConfig): nodemailer.Transporter {
  const sig = `${c.host}:${c.port}:${c.secure}:${c.user}:${c.rejectUnauthorized}`;
  if (!g.__mail || g.__mail.sig !== sig) {
    g.__mail = {
      sig,
      transporter: nodemailer.createTransport({
        host: c.host,
        port: c.port,
        secure: c.secure,
        auth: { user: c.user, pass: c.password },
        tls: { rejectUnauthorized: c.rejectUnauthorized },
      }),
    };
  }
  return g.__mail.transporter;
}

export type MailAttachment = { filename: string; content: string | Buffer; contentType?: string };

export type SendEmailOpts = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  from?: string; // override remitente (p.ej. el buzón del miembro del equipo)
  attachments?: MailAttachment[];
};

// Base pública para enlaces/imagen del logo en los correos.
const APP_URL = (process.env.NEXTAUTH_URL || process.env.ONLYOFFICE_CALLBACK_BASE || "").replace(/\/$/, "");

// Envuelve el HTML del correo en una plantilla con la marca Labstream (cabecera con el
// logo + pie). Se aplica a TODOS los correos salientes para presencia de marca uniforme.
// Usa estilos en línea y tablas (compatibilidad con clientes de correo).
function wrapEmailHtml(inner: string): string {
  const logo = APP_URL ? `<img src="${APP_URL}/brand/logo-dark.png" alt="Labstream Studio" height="26" style="height:26px;width:auto;display:block" />` : `<span style="font-weight:700;font-size:18px;color:#111">labstream</span>`;
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #ececec;border-radius:14px;overflow:hidden">
      <tr><td style="padding:18px 28px;border-bottom:1px solid #f0f0f0">${logo}</td></tr>
      <tr><td style="padding:24px 28px;color:#1a1a1a;font-size:14px;line-height:1.6">${inner}</td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0;color:#9a9a9a;font-size:11px;line-height:1.5">
        Labstream Studio · Producción de contenidos · hola@labstream.co<br/>
        Este correo se envió automáticamente desde la plataforma de Labstream.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export async function sendEmail(opts: SendEmailOpts): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getMailConfig();
  if (!cfg.enabled) return { ok: false, error: "Correo no configurado (configúralo en Integraciones o vía RESEND_API_KEY / SMTP_*)." };
  // Aplica la marca a cualquier correo con HTML (una sola vez, aquí).
  const branded: SendEmailOpts = opts.html ? { ...opts, html: wrapEmailHtml(opts.html) } : opts;
  if (cfg.provider === "resend") return sendViaResend(branded, cfg.from);
  return sendViaSmtp(branded, cfg.smtp);
}

// ── Resend: API HTTP por 443 (no usa puertos SMTP) ──
async function sendViaResend(opts: SendEmailOpts, defaultFrom: string): Promise<{ ok: boolean; error?: string }> {
  const from = opts.from || defaultFrom;
  if (!from) return { ok: false, error: "Falta el remitente (RESEND_FROM con un dominio verificado en Resend)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        reply_to: opts.replyTo,
        attachments: opts.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : Buffer.from(a.content).toString("base64"),
        })),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "error de envío (Resend)" };
  }
}

// ── SMTP: nodemailer (Synology MailPlus o relay externo) ──
async function sendViaSmtp(opts: SendEmailOpts, c: SmtpConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    await transporter(c).sendMail({
      from: opts.from || c.from,
      to: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "error de envío" };
  }
}
