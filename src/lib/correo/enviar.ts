import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { clienteImap, errorEnEspanol } from "./imap";

// ── Enviar correo con la identidad de la persona ────────────────────────────
// Sale por el SMTP de SU cuenta (MailPlus), no por el relay de notificaciones de la app: el
// destinatario ve «Diana Ruiz <diana.ruiz@labstreamsas.com>», responde ahí, y todo cuadra.
//
// Después de enviar, el MISMO mensaje crudo se APPENDea a la carpeta de enviados del servidor:
// así el webmail de MailPlus también lo ve y no hay dos historias de lo que se mandó. Si el
// append falla, el envío NO se deshace — el correo ya salió; solo quedaría fuera del webmail.

type CuentaEnvio = {
  id: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  username: string;
  passwordEnc: string;
  tlsRelaxed: boolean;
  sentFolder: string | null;
};

function transporte(c: CuentaEnvio) {
  return nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort,
    secure: c.smtpPort === 465,
    auth: { user: c.username, pass: decryptSecret(c.passwordEnc) },
    tls: { rejectUnauthorized: !c.tlsRelaxed },
  });
}

/** Prueba IMAP y SMTP ANTES de guardar una cuenta: una credencial mala se rechaza aquí, no
 *  se descubre mañana con la bandeja vacía y un error críptico. */
export async function probarConexion(cfg: {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  passwordEnc: string;
  tlsRelaxed: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // IMAP: conectar y abrir INBOX (leer de verdad, no solo saludar).
  const imap = clienteImap({ id: "", email: "", ...cfg });
  try {
    await imap.connect();
    const lock = await imap.getMailboxLock("INBOX");
    lock.release();
  } catch (e) {
    return { ok: false, error: `IMAP: ${errorEnEspanol(e, cfg.imapHost)}` };
  } finally {
    await imap.logout().catch(() => {});
  }
  // SMTP: verify hace login sin mandar nada.
  try {
    await transporte({ id: "", email: "", sentFolder: null, ...cfg }).verify();
  } catch (e) {
    return { ok: false, error: `SMTP: ${errorEnEspanol(e, cfg.smtpHost)}` };
  }
  return { ok: true };
}

export async function enviarDesdeCuenta(input: {
  accountId: string;
  nombreRemitente: string;
  para: string;
  asunto: string;
  texto: string;
  // Para responder EN HILO: el Message-ID del original.
  enRespuestaA?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const cuenta = await db.mailAccount.findUnique({ where: { id: input.accountId } });
  if (!cuenta) return { ok: false, error: "La cuenta de correo ya no existe." };

  const opciones = {
    from: { name: input.nombreRemitente, address: cuenta.email },
    to: input.para,
    subject: input.asunto,
    text: input.texto,
    ...(input.enRespuestaA ? { inReplyTo: input.enRespuestaA, references: input.enRespuestaA } : {}),
  };

  // El mensaje se COMPONE una sola vez y ese mismo crudo se envía y se appendea: lo que hay
  // en «Enviados» es byte a byte lo que recibió el destinatario, no una reconstrucción.
  let crudo: Buffer;
  try {
    crudo = await new MailComposer(opciones).compile().build();
  } catch {
    return { ok: false, error: "No se pudo componer el mensaje." };
  }

  let messageId: string | null = null;
  try {
    const info = await transporte(cuenta).sendMail({ envelope: { from: cuenta.email, to: [input.para] }, raw: crudo });
    messageId = info.messageId ?? null;
  } catch (e) {
    return { ok: false, error: errorEnEspanol(e, cuenta.smtpHost) };
  }

  // Copia local (pestaña «Enviados») — el envío ya está hecho: de aquí en adelante nada falla
  // hacia el usuario, solo se degrada.
  await db.mailMessage
    .create({
      data: {
        accountId: cuenta.id,
        uid: BigInt(Date.now()), // pseudo-UID local; los reales son del servidor
        folder: "ENVIADOS",
        messageId,
        inReplyTo: input.enRespuestaA ?? null,
        fromName: input.nombreRemitente,
        fromEmail: cuenta.email,
        toList: input.para.slice(0, 500),
        subject: input.asunto.slice(0, 500) || "(sin asunto)",
        date: new Date(),
        snippet: input.texto.replace(/\s+/g, " ").trim().slice(0, 180),
        textBody: input.texto.slice(0, 200_000),
        seen: true,
      },
    })
    .catch(() => {});

  // APPEND a la carpeta de enviados del servidor (mejor-esfuerzo).
  if (cuenta.sentFolder) {
    const imap = clienteImap(cuenta);
    try {
      await imap.connect();
      await imap.append(cuenta.sentFolder, crudo, ["\\Seen"]);
    } catch {
      /* el correo ya salió; solo quedó fuera del webmail */
    } finally {
      await imap.logout().catch(() => {});
    }
  }

  return { ok: true };
}
