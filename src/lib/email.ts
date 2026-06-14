import nodemailer from "nodemailer";

// Email vía SMTP de Synology MailPlus. Gateado por env: sin SMTP_HOST/USER/PASSWORD
// el envío queda deshabilitado (no rompe nada). Los correos salen del buzón
// Synology del equipo (@labstreamsas.com).
const HOST = process.env.SMTP_HOST;
const USER = process.env.SMTP_USER;
const PASSWORD = process.env.SMTP_PASSWORD;
const PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SECURE = process.env.SMTP_SECURE === "true" || PORT === 465;
const FROM = process.env.SMTP_FROM || (USER ? `Labstream <${USER}>` : "");

export const emailEnabled = Boolean(HOST && USER && PASSWORD);

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
  if (!emailEnabled) return { ok: false, error: "Email no configurado (faltan SMTP_*)." };
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
