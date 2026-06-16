import nodemailer from "nodemailer";

// Envío de correo con DOS vías, elegidas por env:
//  1) Resend (API HTTP por el puerto 443) — recomendado: esquiva el bloqueo de los
//     puertos SMTP de salida del NAS/ISP. Se activa con RESEND_API_KEY.
//  2) SMTP (nodemailer) — Synology MailPlus o cualquier relay. Se activa con SMTP_*.
// Si está RESEND_API_KEY, se usa Resend; si no, SMTP. Sin ninguna config, el envío
// queda deshabilitado (no rompe nada).

// ── SMTP (Synology MailPlus o relay externo) ──
const HOST = process.env.SMTP_HOST;
const USER = process.env.SMTP_USER;
const PASSWORD = process.env.SMTP_PASSWORD;
const PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SECURE = process.env.SMTP_SECURE === "true" || PORT === 465;
// Solo para el NAS con cert auto-firmado; con un relay externo debe ser true (default).
const REJECT_UNAUTHORIZED = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false";

// ── Resend (API HTTP por 443) ──
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Remitente. Resend EXIGE un dominio verificado (ej. no-reply@labstreamsas.com).
// Orden: RESEND_FROM → SMTP_FROM → SMTP_USER.
const FROM = process.env.RESEND_FROM || process.env.SMTP_FROM || (USER ? `Labstream <${USER}>` : "");

const smtpEnabled = Boolean(HOST && USER && PASSWORD);
const resendEnabled = Boolean(RESEND_API_KEY);
export const emailEnabled = resendEnabled || smtpEnabled;
// Útil para los paneles de estado / mensajes de prueba.
export const emailProvider: "resend" | "smtp" | "none" = resendEnabled ? "resend" : smtpEnabled ? "smtp" : "none";

type Cached = { transporter: nodemailer.Transporter } | null;
const g = globalThis as unknown as { __mail?: Cached };

function transporter(): nodemailer.Transporter {
  if (!g.__mail) {
    g.__mail = {
      transporter: nodemailer.createTransport({
        host: HOST,
        port: PORT,
        secure: SECURE,
        auth: { user: USER, pass: PASSWORD },
        tls: { rejectUnauthorized: REJECT_UNAUTHORIZED },
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

export async function sendEmail(opts: SendEmailOpts): Promise<{ ok: boolean; error?: string }> {
  if (resendEnabled) return sendViaResend(opts);
  if (smtpEnabled) return sendViaSmtp(opts);
  return { ok: false, error: "Email no configurado (falta RESEND_API_KEY o SMTP_*)." };
}

// ── Resend: API HTTP por 443 (no usa puertos SMTP) ──
async function sendViaResend(opts: SendEmailOpts): Promise<{ ok: boolean; error?: string }> {
  const from = opts.from || FROM;
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
async function sendViaSmtp(opts: SendEmailOpts): Promise<{ ok: boolean; error?: string }> {
  try {
    await transporter().sendMail({
      from: opts.from || FROM,
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
