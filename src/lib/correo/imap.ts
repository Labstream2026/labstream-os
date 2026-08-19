import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { textoPlano } from "./sanitizar";
import { claveHilo, clienteDeRemitente } from "./hilos";

// ── El motor IMAP del correo personal ───────────────────────────────────────
// MailPlus corre en este mismo NAS, así que todo esto habla con la LAN: conectar por mensaje
// no es elegante, pero es barato y NO deja sockets vivos entre peticiones — en un contenedor
// que se redespliega a diario, una conexión persistente solo sería un recurso que se filtra.
//
// La sincronización es INCREMENTAL por UID: se guarda la marca de agua (lastUid) y solo se
// piden los mensajes nuevos. Si el servidor cambia uidValidity, todos los UIDs guardados dejan
// de significar nada: se tira la bandeja local y se resincroniza — es el contrato de IMAP.
//
// Los ADJUNTOS no se guardan: en la bandeja solo vive su ficha (nombre, tamaño). Al pedirlos
// se vuelve a bajar el mensaje del servidor — en LAN eso cuesta menos que llenarnos Postgres
// de binarios que casi nadie abre dos veces.

const DIAS_INICIALES = 60; // primera sincronización: lo más reciente de estos días
const MAX_FUENTE = 6 * 1024 * 1024; // por encima, solo la ficha (ábrelo en el webmail)
const MAX_TEXTO = 200_000;
const MAX_HTML = 400_000;
const MAX_ADJUNTO = 30 * 1024 * 1024;

type Cuenta = {
  id: string;
  email: string;
  imapHost: string;
  imapPort: number;
  username: string;
  passwordEnc: string;
  tlsRelaxed: boolean;
};

export function clienteImap(c: Cuenta): ImapFlow {
  return new ImapFlow({
    host: c.imapHost,
    port: c.imapPort,
    secure: c.imapPort === 993,
    auth: { user: c.username, pass: decryptSecret(c.passwordEnc) },
    // tlsRelaxed: el certificado del NAS no coincide al entrar por IP de LAN.
    tls: { rejectUnauthorized: !c.tlsRelaxed },
    logger: false,
  });
}

/** Errores de red/credencial en cristiano, para pintarlos en la pestaña tal cual. */
export function errorEnEspanol(e: unknown, host: string): string {
  const err = e as { authenticationFailed?: boolean; code?: string; message?: string };
  if (err?.authenticationFailed) return "El servidor rechazó el usuario o la contraseña.";
  const code = err?.code ?? "";
  if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "ECONNRESET"].includes(code)) {
    return `No se pudo conectar con ${host}. ¿El servicio de correo está encendido?`;
  }
  return err?.message?.slice(0, 200) || "Error desconocido hablando con el servidor de correo.";
}

const listaDe = (a: AddressObject | AddressObject[] | undefined): string => {
  const objs = Array.isArray(a) ? a : a ? [a] : [];
  return objs
    .flatMap((o) => o.value)
    .map((v) => (v.name ? `${v.name} <${v.address ?? ""}>` : (v.address ?? "")))
    .filter(Boolean)
    .join(", ")
    .slice(0, 500);
};

function filaDe(accountId: string, uid: number, flags: Set<string>, parsed: ParsedMail, clientesCatalogo: { email: string; clientId: string }[]) {
  const texto = (parsed.text ?? "").slice(0, MAX_TEXTO);
  const html = (parsed.html || null)?.slice(0, MAX_HTML) ?? null;
  const de = parsed.from?.value?.[0];
  // mailparser entrega References como string o lista: se normaliza a una cadena.
  const references = Array.isArray(parsed.references) ? parsed.references.join(" ") : (parsed.references ?? null);
  return {
    accountId,
    uid: BigInt(uid),
    folder: "INBOX",
    messageId: parsed.messageId?.slice(0, 300) ?? null,
    inReplyTo: parsed.inReplyTo?.slice(0, 300) ?? null,
    threadKey: claveHilo({ messageId: parsed.messageId, inReplyTo: parsed.inReplyTo, references }),
    clientId: clienteDeRemitente(de?.address, clientesCatalogo),
    flagged: flags.has("\\Flagged"),
    ccList: listaDe(parsed.cc),
    fromName: de?.name?.slice(0, 200) || null,
    fromEmail: de?.address?.slice(0, 200) || null,
    toList: listaDe(parsed.to),
    subject: (parsed.subject ?? "(sin asunto)").slice(0, 500),
    date: parsed.date ?? new Date(),
    snippet: texto ? textoPlano(texto.replace(/</g, "&lt;")) : html ? textoPlano(html) : "",
    textBody: texto || null,
    htmlBody: html,
    seen: flags.has("\\Seen"),
    answered: flags.has("\\Answered"),
    attachments: parsed.attachments?.length
      ? parsed.attachments.map((a, i) => ({
          indice: i,
          nombre: (a.filename ?? `adjunto-${i + 1}`).slice(0, 200),
          mime: (a.contentType ?? "application/octet-stream").slice(0, 100),
          bytes: a.size ?? 0,
          // Content-ID de las partes INCRUSTADAS (firmas, GIFs): con él la vista resuelve
          // los <img src="cid:..."> del HTML a nuestra ruta autenticada.
          ...(a.contentId ? { cid: a.contentId.replace(/[<>]/g, "").slice(0, 200).toLowerCase() } : {}),
        }))
      : undefined,
  };
}

// Una sincronización por cuenta a la vez: la página la dispara al abrir y el cron también;
// si se cruzan, la segunda se va sin hacer nada en vez de duplicar trabajo y conexiones.
const enCurso = new Set<string>();

export async function sincronizarCuenta(accountId: string, opts?: { max?: number }): Promise<{ nuevos: number; error: string | null }> {
  if (enCurso.has(accountId)) return { nuevos: 0, error: null };
  enCurso.add(accountId);
  try {
    return await sincronizar(accountId, opts?.max ?? 120);
  } finally {
    enCurso.delete(accountId);
  }
}

// Los correos de los MIEMBROS del portal de cada cliente: contra esto se etiqueta el
// remitente. Solo usuarios con rol cliente — que un productor escriba no etiqueta nada.
async function catalogoClientes(): Promise<{ email: string; clientId: string }[]> {
  const filas = await db.clientMember.findMany({
    where: { user: { active: true, role: { key: "cliente" } } },
    select: { clientId: true, user: { select: { email: true } } },
  });
  return filas
    .filter((f) => f.user?.email)
    .map((f) => ({ email: f.user.email.toLowerCase(), clientId: f.clientId }));
}

async function sincronizar(accountId: string, max: number): Promise<{ nuevos: number; error: string | null }> {
  const cuenta = await db.mailAccount.findUnique({ where: { id: accountId } });
  if (!cuenta) return { nuevos: 0, error: "La cuenta ya no existe." };
  const clientesCatalogo = await catalogoClientes();
  // Reglas de la cuenta («lo de este remitente va al proyecto X»): se aplican al llegar.
  const reglas = new Map(
    (await db.mailRule.findMany({ where: { accountId }, select: { fromEmail: true, projectId: true } })).map((r) => [r.fromEmail, r]),
  );

  const client = clienteImap(cuenta);
  let nuevos = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = typeof client.mailbox === "object" ? client.mailbox : null;
      const validez = mailbox?.uidValidity ?? null;

      // uidValidity cambió → los UIDs guardados no significan nada. Bandeja local fuera.
      let lastUid = Number(cuenta.lastUid);
      if (validez !== null && cuenta.uidValidity !== null && validez !== cuenta.uidValidity) {
        await db.mailMessage.deleteMany({ where: { accountId, folder: "INBOX" } });
        lastUid = 0;
      }

      // Qué UIDs faltan: incrementales tras la marca, o lo reciente en la primera vez.
      let uids: number[] = [];
      if (lastUid > 0) {
        uids = (await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })) || [];
        // El servidor devuelve el último mensaje aunque su UID sea ≤ la marca: fuera.
        uids = uids.filter((u) => u > lastUid);
      } else {
        const desde = new Date(Date.now() - DIAS_INICIALES * 86_400_000);
        uids = (await client.search({ since: desde }, { uid: true })) || [];
      }
      uids.sort((a, b) => a - b);
      if (uids.length > max) uids = uids.slice(-max); // lo más reciente primero en caer

      for (const uid of uids) {
        // Ficha primero (tamaño/flags/sobre): los gigantes no se bajan enteros.
        const meta = await client.fetchOne(String(uid), { uid: true, size: true, flags: true, envelope: true, internalDate: true }, { uid: true });
        // fetchOne devuelve `false` si el mensaje ya no está (y `?.` NO protege contra false).
        if (!meta || typeof meta === "boolean") continue;
        const flags = meta.flags ?? new Set<string>();

        let fila: ReturnType<typeof filaDe>;
        if ((meta.size ?? 0) > MAX_FUENTE) {
          const env = meta.envelope;
          const de = env?.from?.[0];
          fila = {
            accountId,
            uid: BigInt(uid),
            folder: "INBOX",
            messageId: env?.messageId?.slice(0, 300) ?? null,
            inReplyTo: null,
            threadKey: env?.messageId?.slice(0, 300) ?? null,
            clientId: clienteDeRemitente(de?.address, clientesCatalogo),
            flagged: flags.has("\\Flagged"),
            ccList: "",
            fromName: de?.name?.slice(0, 200) || null,
            fromEmail: de?.address?.slice(0, 200) || null,
            toList: (env?.to ?? []).map((t) => t.address ?? "").filter(Boolean).join(", ").slice(0, 500),
            subject: (env?.subject ?? "(sin asunto)").slice(0, 500),
            date: new Date(env?.date ?? meta.internalDate ?? Date.now()),
            snippet: "Mensaje demasiado pesado para la bandeja de la app.",
            textBody: `Este mensaje pesa ${Math.round((meta.size ?? 0) / 1024 / 1024)} MB y no se sincronizó. Ábrelo en el webmail de MailPlus.`,
            htmlBody: null,
            seen: flags.has("\\Seen"),
            answered: flags.has("\\Answered"),
            attachments: undefined,
          };
        } else {
          const full = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
          if (!full || typeof full === "boolean" || !full.source) continue;
          fila = filaDe(accountId, uid, flags, await simpleParser(full.source), clientesCatalogo);
        }

        // Proyecto del mensaje nuevo: manda la REGLA del remitente; sin regla, se HEREDA del
        // hilo (si alguien ya asignó la conversación a un proyecto, lo que llegue sigue ahí).
        let projectId = reglas.get((fila.fromEmail ?? "").toLowerCase())?.projectId ?? null;
        if (!projectId && fila.threadKey) {
          const hermano = await db.mailMessage.findFirst({
            where: { accountId, threadKey: fila.threadKey, projectId: { not: null } },
            select: { projectId: true },
          });
          projectId = hermano?.projectId ?? null;
        }

        // Upsert por (cuenta, carpeta, uid): resincronizar jamás duplica.
        await db.mailMessage.upsert({
          where: { accountId_folder_uid: { accountId, folder: "INBOX", uid: BigInt(uid) } },
          create: { ...fila, projectId },
          update: { seen: fila.seen, answered: fila.answered },
        });
        nuevos += 1;
        if (uid > lastUid) lastUid = uid;
      }

      // Refresco de flags de lo reciente YA guardado: si alguien leyó en el webmail, aquí
      // deja de salir como no leído. Un solo barrido por rango, barato.
      const recientes = await db.mailMessage.findMany({
        where: { accountId, folder: "INBOX" },
        orderBy: { date: "desc" },
        take: 150,
        select: { id: true, uid: true, seen: true, answered: true, flagged: true },
      });
      if (recientes.length > 1) {
        const min = recientes.reduce((m, r) => (r.uid < m ? r.uid : m), recientes[0].uid);
        const porUid = new Map(recientes.map((r) => [Number(r.uid), r]));
        for await (const msg of client.fetch(`${min}:*`, { uid: true, flags: true }, { uid: true })) {
          const fila = porUid.get(msg.uid);
          if (!fila) continue;
          const seen = msg.flags?.has("\\Seen") ?? false;
          const answered = msg.flags?.has("\\Answered") ?? false;
          const flagged = msg.flags?.has("\\Flagged") ?? false;
          if (seen !== fila.seen || answered !== fila.answered || flagged !== fila.flagged) {
            await db.mailMessage.update({ where: { id: fila.id }, data: { seen, answered, flagged } });
          }
        }
      }

      // Carpetas del servidor (una sola vez): enviados para el APPEND, y archivo/papelera
      // para que archivar aquí archive TAMBIÉN en el webmail — una sola verdad del buzón.
      let { sentFolder, archiveFolder, trashFolder } = cuenta;
      if (!sentFolder || !archiveFolder || !trashFolder) {
        const carpetas = await client.list();
        sentFolder ??=
          carpetas.find((f) => f.specialUse === "\\Sent")?.path ??
          carpetas.find((f) => /sent|enviad/i.test(f.path))?.path ??
          null;
        archiveFolder ??=
          carpetas.find((f) => f.specialUse === "\\Archive")?.path ??
          carpetas.find((f) => /archive|archivo/i.test(f.path))?.path ??
          null;
        trashFolder ??=
          carpetas.find((f) => f.specialUse === "\\Trash")?.path ??
          carpetas.find((f) => /trash|deleted|papelera|eliminad/i.test(f.path))?.path ??
          null;
      }

      await db.mailAccount.update({
        where: { id: accountId },
        data: { lastUid: BigInt(lastUid), uidValidity: validez, lastSyncAt: new Date(), syncError: null, sentFolder, archiveFolder, trashFolder },
      });
    } finally {
      lock.release();
    }
    return { nuevos, error: null };
  } catch (e) {
    const error = errorEnEspanol(e, cuenta.imapHost);
    await db.mailAccount.update({ where: { id: accountId }, data: { syncError: error, lastSyncAt: new Date() } }).catch(() => {});
    return { nuevos, error };
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Baja UN adjunto directo del servidor (no se guardan en la base). `userId` es el candado:
 * el mensaje tiene que ser de la cuenta de quien lo pide, siempre.
 */
export async function descargarAdjunto(
  mensajeId: string,
  indice: number,
  userId: string,
): Promise<{ nombre: string; mime: string; contenido: Buffer } | { error: string; status: number }> {
  const msg = await db.mailMessage.findUnique({
    where: { id: mensajeId },
    select: { uid: true, folder: true, attachments: true, account: true },
  });
  if (!msg || msg.account.userId !== userId) return { error: "No encontrado", status: 404 };
  // El mensaje puede vivir archivado o en la papelera: se busca en SU carpeta del servidor.
  const carpeta = carpetaServidor(msg.account, msg.folder);
  if (!carpeta) return { error: "Los enviados no guardan adjuntos", status: 404 };

  const client = clienteImap(msg.account);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(carpeta);
    try {
      const full = await client.fetchOne(String(msg.uid), { uid: true, source: true }, { uid: true });
      if (!full || typeof full === "boolean" || !full.source) return { error: "El mensaje ya no está en el servidor", status: 404 };
      const parsed = await simpleParser(full.source);
      const adj = parsed.attachments?.[indice];
      if (!adj) return { error: "Ese adjunto no existe", status: 404 };
      if ((adj.size ?? adj.content.length) > MAX_ADJUNTO) return { error: "Adjunto demasiado grande: bájalo desde el webmail", status: 413 };
      return {
        nombre: adj.filename ?? `adjunto-${indice + 1}`,
        mime: adj.contentType ?? "application/octet-stream",
        contenido: adj.content,
      };
    } finally {
      lock.release();
    }
  } catch (e) {
    return { error: errorEnEspanol(e, msg.account.imapHost), status: 502 };
  } finally {
    await client.logout().catch(() => {});
  }
}

/** La carpeta REAL del servidor para una carpeta local. ENVIADOS es local (no se opera). */
export function carpetaServidor(
  cuenta: { sentFolder: string | null; archiveFolder: string | null; trashFolder: string | null },
  folder: string,
): string | null {
  if (folder === "INBOX") return "INBOX";
  if (folder === "ARCHIVO") return cuenta.archiveFolder;
  if (folder === "PAPELERA") return cuenta.trashFolder;
  return null;
}

/** Pone o quita \Seen/\Answered/\Flagged en el servidor, en la carpeta que toque. Mejor
 *  esfuerzo: la bandeja local ya quedó bien y el refresco de flags reconcilia. */
export async function marcarEnServidor(
  accountId: string,
  uid: bigint,
  flag: "\\Seen" | "\\Answered" | "\\Flagged",
  opts?: { quitar?: boolean; folder?: string },
): Promise<void> {
  const cuenta = await db.mailAccount.findUnique({ where: { id: accountId } });
  if (!cuenta) return;
  const carpeta = carpetaServidor(cuenta, opts?.folder ?? "INBOX");
  if (!carpeta) return;
  const client = clienteImap(cuenta);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(carpeta);
    try {
      if (opts?.quitar) await client.messageFlagsRemove(String(uid), [flag], { uid: true });
      else await client.messageFlagsAdd(String(uid), [flag], { uid: true });
    } finally {
      lock.release();
    }
  } catch {
    /* mejor-esfuerzo: el refresco de flags del próximo sync reconcilia */
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Mueve un mensaje entre carpetas EN EL SERVIDOR (archivar, papelera, restaurar) y actualiza
 * la fila local. El UID cambia al mover: se toma del uidMap (UIDPLUS) y, si el servidor no lo
 * da, se RECUPERA buscando el Message-ID en la carpeta destino — sin UID real, los adjuntos
 * de ese mensaje quedarían huérfanos. Si la carpeta de destino no existe, se crea (un buzón
 * recién estrenado no trae «Archive»).
 */
export async function moverMensaje(
  mensajeId: string,
  userId: string,
  destino: "ARCHIVO" | "PAPELERA" | "INBOX",
): Promise<{ ok: boolean; error?: string }> {
  const msg = await db.mailMessage.findUnique({
    where: { id: mensajeId },
    select: { id: true, uid: true, folder: true, messageId: true, account: true },
  });
  if (!msg || msg.account.userId !== userId) return { ok: false, error: "No encontrado" };
  if (msg.folder === "ENVIADOS") return { ok: false, error: "Los enviados locales no se mueven." };
  if (msg.folder === destino) return { ok: true };

  const cuenta = msg.account;
  const origen = carpetaServidor(cuenta, msg.folder);
  if (!origen) return { ok: false, error: "Carpeta de origen desconocida." };

  const client = clienteImap(cuenta);
  try {
    await client.connect();

    // Carpeta destino: la detectada, o se crea con nombre estándar y se recuerda.
    let destinoSrv = carpetaServidor(cuenta, destino);
    if (!destinoSrv) {
      destinoSrv = destino === "ARCHIVO" ? "Archive" : "Trash";
      await client.mailboxCreate(destinoSrv).catch(() => {}); // puede existir sin listarse
      await db.mailAccount.update({
        where: { id: cuenta.id },
        data: destino === "ARCHIVO" ? { archiveFolder: destinoSrv } : { trashFolder: destinoSrv },
      });
    }

    const lock = await client.getMailboxLock(origen);
    let nuevoUid: number | null = null;
    try {
      const r = await client.messageMove(String(msg.uid), destinoSrv, { uid: true });
      const mapa = (r && typeof r === "object" && "uidMap" in r ? (r as { uidMap?: Map<number, number> }).uidMap : undefined) ?? null;
      nuevoUid = mapa?.get(Number(msg.uid)) ?? null;
    } finally {
      lock.release();
    }

    // Sin UIDPLUS: recuperar el UID nuevo buscando el Message-ID en el destino.
    if (nuevoUid === null && msg.messageId) {
      const lock2 = await client.getMailboxLock(destinoSrv);
      try {
        const ids = (await client.search({ header: { "message-id": msg.messageId } }, { uid: true })) || [];
        if (ids.length) nuevoUid = ids[ids.length - 1];
      } finally {
        lock2.release();
      }
    }

    await db.mailMessage.update({
      where: { id: msg.id },
      // Sin UID recuperable, un pseudo-UID único conserva la fila (los adjuntos de ese
      // mensaje ya no se podrán bajar desde la app; el webmail sigue teniéndolos).
      data: { folder: destino, uid: BigInt(nuevoUid ?? Date.now()) },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorEnEspanol(e, cuenta.imapHost) };
  } finally {
    await client.logout().catch(() => {});
  }
}
