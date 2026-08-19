import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { clienteImap, errorEnEspanol } from "./imap";
import { claveHilo } from "./hilos";

// ── Enviar correo con la identidad de la persona ────────────────────────────
// Sale por el SMTP de SU cuenta (MailPlus), no por el relay de notificaciones de la app: el
// destinatario ve «Diana Ruiz <diana.ruiz@labstreamsas.com>», responde ahí, y todo cuadra.
//
// COMPONER y DESPACHAR van separados a propósito: componer pasa al hacer clic en «Enviar»
// (la firma y los adjuntos quedan congelados en el crudo MIME), despachar pasa cuando el
// mensaje de verdad sale — 15 segundos después, o a la hora programada. Entre uno y otro
// vive la cola de salida (MailOutbox) y el botón «Deshacer».
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

export type EntradaCorreo = {
  nombreRemitente: string;
  para: string;
  cc?: string | null;
  asunto: string;
  texto: string;
  /** Cuerpo HTML (redactor con formato). Si viene, el mensaje sale multipart: HTML + texto. */
  html?: string | null;
  /** Partes INCRUSTADAS (imágenes/GIFs del cuerpo y de la firma), referidas por cid: en el HTML. */
  inlines?: { cid: string; nombre: string; mime: string; contenido: Buffer }[];
  // Para responder EN HILO: el Message-ID del original y su cadena References completa —
  // con solo el id del padre, Gmail del otro lado partiría hilos largos en dos.
  enRespuestaA?: string | null;
  referencias?: string | null;
  adjuntos?: { nombre: string; mime: string; contenido: Buffer }[];
};

export type CorreoCompuesto = {
  crudo: Buffer;
  /** Generado AL COMPONER y fijado en el crudo: el hilo y la copia local usan el mismo. */
  messageId: string | null;
};

/** Compone el MIME UNA sola vez: ese mismo crudo se envía por SMTP y se APPENDea a Enviados
 *  — byte a byte lo que recibió el destinatario, no una reconstrucción. */
export async function componerCorreo(emailCuenta: string, input: EntradaCorreo): Promise<CorreoCompuesto | { error: string }> {
  const referencias = [input.referencias, input.enRespuestaA].filter(Boolean).join(" ").trim() || undefined;
  // Las incrustadas van como adjuntos con cid + disposición inline; las normales, como siempre.
  const attachments = [
    ...(input.inlines ?? []).map((p) => ({
      filename: p.nombre,
      content: p.contenido,
      contentType: p.mime,
      cid: p.cid,
      contentDisposition: "inline" as const,
    })),
    ...(input.adjuntos ?? []).map((a) => ({ filename: a.nombre, content: a.contenido, contentType: a.mime })),
  ];
  const opciones = {
    from: { name: input.nombreRemitente, address: emailCuenta },
    to: input.para,
    ...(input.cc ? { cc: input.cc } : {}),
    subject: input.asunto,
    text: input.texto,
    ...(input.html ? { html: input.html } : {}),
    ...(input.enRespuestaA ? { inReplyTo: input.enRespuestaA, references: referencias } : {}),
    ...(attachments.length ? { attachments } : {}),
  };
  try {
    const mime = new MailComposer(opciones).compile();
    // El Message-ID se genera AHORA (no al enviar): queda dentro del crudo, y la copia local
    // hila con el mismo id aunque el despacho pase minutos (o días) después.
    const messageId = mime.messageId() || null;
    const crudo = await mime.build();
    return { crudo, messageId };
  } catch {
    return { error: "No se pudo componer el mensaje." };
  }
}

/** DESPACHA un mensaje ya compuesto: SMTP → copia local en «Enviados» → APPEND al servidor.
 *  Si el SMTP falla, no salió nada (reintentable). Después del SMTP ya nada falla hacia el
 *  usuario: el correo salió, lo demás solo se degrada. */
export async function despacharCorreo(
  accountId: string,
  comp: CorreoCompuesto,
  meta: {
    nombreRemitente: string;
    para: string;
    cc?: string | null;
    asunto: string;
    texto: string;
    /** HTML para la copia LOCAL: firma por URL y data:/GIF vivos — no el de alambre con cid:
     *  (los enviados locales no guardan las partes, así que un cid: aquí es una imagen rota). */
    htmlLocal?: string | null;
    enRespuestaA?: string | null;
    referencias?: string | null;
    projectId?: string | null;
    adjuntosMeta?: { nombre: string; mime: string; bytes: number }[];
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cuenta = await db.mailAccount.findUnique({ where: { id: accountId } });
  if (!cuenta) return { ok: false, error: "La cuenta de correo ya no existe." };

  try {
    // El sobre lleva TODOS los destinatarios (para + cc): el header cc sin sobre es un
    // mensaje que dice tener copia pero no la entrega.
    const destinos = [meta.para, ...(meta.cc ?? "").split(",").map((s) => s.trim()).filter(Boolean)];
    await transporte(cuenta).sendMail({ envelope: { from: cuenta.email, to: destinos }, raw: comp.crudo });
  } catch (e) {
    return { ok: false, error: errorEnEspanol(e, cuenta.smtpHost) };
  }

  const referencias = [meta.referencias, meta.enRespuestaA].filter(Boolean).join(" ").trim() || null;
  // Copia local (pestaña «Enviados»). El tope del HTML es generoso a propósito: aquí viven
  // las imágenes pegadas como data: (la copia local no puede bajarlas de ningún servidor).
  await db.mailMessage
    .create({
      data: {
        accountId: cuenta.id,
        uid: BigInt(Date.now()), // pseudo-UID local; los reales son del servidor
        folder: "ENVIADOS",
        messageId: comp.messageId,
        inReplyTo: meta.enRespuestaA ?? null,
        // El enviado entra al MISMO hilo que lo que responde: la conversación se ve entera.
        threadKey: claveHilo({ messageId: comp.messageId, inReplyTo: meta.enRespuestaA ?? null, references: referencias }),
        ccList: (meta.cc ?? "").slice(0, 500),
        fromName: meta.nombreRemitente,
        fromEmail: cuenta.email,
        toList: meta.para.slice(0, 500),
        subject: meta.asunto.slice(0, 500) || "(sin asunto)",
        date: new Date(),
        snippet: meta.texto.replace(/\s+/g, " ").trim().slice(0, 180),
        textBody: meta.texto.slice(0, 200_000),
        htmlBody: meta.htmlLocal ? meta.htmlLocal.slice(0, 12_000_000) : null,
        projectId: meta.projectId ?? null,
        seen: true,
        attachments: meta.adjuntosMeta?.length
          ? meta.adjuntosMeta.map((a, i) => ({ indice: i, nombre: a.nombre.slice(0, 200), mime: a.mime.slice(0, 100), bytes: a.bytes }))
          : undefined,
      },
    })
    .catch(() => {});

  // APPEND a la carpeta de enviados del servidor (mejor-esfuerzo).
  if (cuenta.sentFolder) {
    const imap = clienteImap(cuenta);
    try {
      await imap.connect();
      await imap.append(cuenta.sentFolder, comp.crudo, ["\\Seen"]);
    } catch {
      /* el correo ya salió; solo quedó fuera del webmail */
    } finally {
      await imap.logout().catch(() => {});
    }
  }

  return { ok: true };
}

/** Componer + despachar EN EL ACTO: los envíos del sistema (revisiones, videos) no pasan por
 *  la cola de deshacer — los dispara un flujo, no un dedo que puede arrepentirse. */
export async function enviarDesdeCuenta(
  input: EntradaCorreo & { accountId: string; projectId?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cuenta = await db.mailAccount.findUnique({ where: { id: input.accountId }, select: { email: true } });
  if (!cuenta) return { ok: false, error: "La cuenta de correo ya no existe." };
  const comp = await componerCorreo(cuenta.email, input);
  if ("error" in comp) return { ok: false, error: comp.error };
  return despacharCorreo(input.accountId, comp, {
    nombreRemitente: input.nombreRemitente,
    para: input.para,
    cc: input.cc,
    asunto: input.asunto,
    texto: input.texto,
    htmlLocal: input.html,
    enRespuestaA: input.enRespuestaA,
    referencias: input.referencias,
    projectId: input.projectId,
    adjuntosMeta: input.adjuntos?.map((a) => ({ nombre: a.nombre, mime: a.mime, bytes: a.contenido.length })),
  });
}
