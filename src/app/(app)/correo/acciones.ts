"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { marcarEnServidor, moverMensaje, sincronizarCuenta } from "@/lib/correo/imap";
import { enviarDesdeCuenta, probarConexion } from "@/lib/correo/enviar";

// ── Acciones del correo personal ────────────────────────────────────────────
// Todas parten de la MISMA verdad: la cuenta es la del usuario de la sesión y nada más. No
// existe «leer el buzón de otro» ni por id: el where siempre pasa por session.id.

async function sesionEquipo() {
  const session = await getSession();
  if (!session || session.role === "cliente" || session.role === "demo") return null;
  return session;
}

export async function conectarCorreo(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "El correo es solo para el equipo." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const usuario = String(formData.get("usuario") ?? "").trim() || email;
  const password = String(formData.get("password") ?? "");
  const imapHost = String(formData.get("imapHost") ?? "").trim();
  const smtpHost = String(formData.get("smtpHost") ?? "").trim();
  const imapPort = Number.parseInt(String(formData.get("imapPort") ?? "993"), 10) || 993;
  const smtpPort = Number.parseInt(String(formData.get("smtpPort") ?? "587"), 10) || 587;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Ese correo no parece una dirección válida." };
  if (!password) return { ok: false, error: "Falta la contraseña." };
  if (!imapHost || !smtpHost) return { ok: false, error: "Falta el servidor de correo." };

  const passwordEnc = encryptSecret(password);
  const cfg = { imapHost, imapPort, smtpHost, smtpPort, username: usuario, passwordEnc, tlsRelaxed: true };

  // Se prueba ANTES de guardar: una credencial mala se rechaza aquí con su motivo, no se
  // descubre mañana con la bandeja vacía.
  const prueba = await probarConexion(cfg);
  if (!prueba.ok) return { ok: false, error: prueba.error };

  const cuenta = await db.mailAccount.upsert({
    where: { userId: session.id },
    create: { userId: session.id, email, ...cfg },
    // Reconectar con otra credencial NO borra la bandeja ya sincronizada.
    update: { email, ...cfg, syncError: null },
  });

  await logActivity({
    action: "correo.conectar",
    summary: `conectó su buzón de correo (${email})`,
    entityType: "correo",
    entityId: cuenta.id,
    silent: true,
  });

  // Primera tanda pequeña y en línea: quien conecta ve su bandeja llegar, no una pantalla
  // vacía con una promesa. El resto lo trae el cron y las próximas visitas.
  await sincronizarCuenta(cuenta.id, { max: 60 });
  revalidatePath("/correo");
  return { ok: true };
}

export async function desconectarCorreo(): Promise<{ ok: boolean }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false };
  // El cascade se lleva la bandeja local. En el servidor no se toca nada: el buzón real
  // sigue intacto en MailPlus — esto solo desconecta la app.
  await db.mailAccount.delete({ where: { userId: session.id } }).catch(() => {});
  await logActivity({ action: "correo.desconectar", summary: "desconectó su buzón de correo", entityType: "correo", silent: true });
  revalidatePath("/correo");
  return { ok: true };
}

export async function sincronizarAhora(): Promise<{ ok: boolean; error?: string }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false };
  const cuenta = await db.mailAccount.findUnique({ where: { userId: session.id }, select: { id: true } });
  if (!cuenta) return { ok: false, error: "No hay buzón conectado." };
  const r = await sincronizarCuenta(cuenta.id, { max: 120 });
  revalidatePath("/correo");
  return { ok: !r.error, error: r.error ?? undefined };
}

// La marca de leído la dispara el LECTOR al montarse (client), no el render de la página: el
// prefetch de Next visita enlaces que nadie abrió, y marcaría leído medio buzón por asomarse.
export async function marcarLeidoCorreo(mensajeId: string): Promise<void> {
  const session = await sesionEquipo();
  if (!session) return;
  const msg = await db.mailMessage.findUnique({
    where: { id: mensajeId },
    select: { id: true, uid: true, seen: true, folder: true, account: { select: { id: true, userId: true } } },
  });
  if (!msg || msg.account.userId !== session.id || msg.seen || msg.folder !== "INBOX") return;
  await db.mailMessage.update({ where: { id: msg.id }, data: { seen: true } });
  // Al servidor en mejor-esfuerzo: si falla, el refresco de flags del próximo sync reconcilia.
  void marcarEnServidor(msg.account.id, msg.uid, "\\Seen").catch(() => {});
  revalidatePath("/correo");
}

// Correo válido (o lista separada por comas, todas válidas).
const RE_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const listaValida = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).every((x) => RE_MAIL.test(x));

// Adjuntos al enviar: tope total de 15 MB — más que eso no es un correo, es una transferencia
// (para eso están los discos del NAS y los enlaces).
const MAX_ADJUNTOS_BYTES = 15 * 1024 * 1024;

/**
 * Envía desde el FORMULARIO del compositor (FormData por los archivos). Cubre los tres modos:
 * nuevo, responder (en hilo, con References completo) y reenviar (cita el original).
 */
export async function enviarCorreoForm(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "El correo es solo para el equipo." };
  const cuenta = await db.mailAccount.findUnique({ where: { userId: session.id }, select: { id: true, email: true } });
  if (!cuenta) return { ok: false, error: "Conecta tu buzón primero." };

  const para = String(fd.get("para") ?? "").trim();
  const cc = String(fd.get("cc") ?? "").trim();
  let asunto = String(fd.get("asunto") ?? "").trim().slice(0, 300);
  let texto = String(fd.get("texto") ?? "").trim();
  const responderAId = String(fd.get("responderAId") ?? "").trim() || null;
  const reenviarDeId = String(fd.get("reenviarDeId") ?? "").trim() || null;

  if (!para || !listaValida(para)) return { ok: false, error: "El destinatario no parece una dirección válida." };
  if (cc && !listaValida(cc)) return { ok: false, error: "Hay una dirección inválida en CC." };
  if (!texto) return { ok: false, error: "El mensaje está vacío." };

  // Adjuntos del formulario, con tope total.
  const adjuntos: { nombre: string; mime: string; contenido: Buffer }[] = [];
  let total = 0;
  for (const f of fd.getAll("archivos")) {
    if (!(f instanceof File) || f.size === 0) continue;
    total += f.size;
    if (total > MAX_ADJUNTOS_BYTES) return { ok: false, error: "Los adjuntos superan 15 MB. Para material pesado, comparte un enlace del NAS." };
    adjuntos.push({ nombre: f.name.slice(0, 200), mime: f.type || "application/octet-stream", contenido: Buffer.from(await f.arrayBuffer()) });
  }

  // Hilo y cita: el original tiene que ser de ESTA cuenta — el id viene del navegador y sin
  // este candado serviría para leer Message-IDs (y textos) ajenos.
  let enRespuestaA: string | null = null;
  let referencias: string | null = null;
  let original: { id: string; uid: bigint; folder: string } | null = null;
  const origenId = responderAId ?? reenviarDeId;
  if (origenId) {
    const orig = await db.mailMessage.findUnique({
      where: { id: origenId },
      select: {
        id: true, uid: true, folder: true, messageId: true, inReplyTo: true, threadKey: true,
        fromName: true, fromEmail: true, toList: true, subject: true, date: true, textBody: true,
        account: { select: { id: true } },
      },
    });
    if (!orig || orig.account.id !== cuenta.id) return { ok: false, error: "Ese mensaje no existe." };
    if (responderAId) {
      enRespuestaA = orig.messageId;
      // La cadena completa: la raíz del hilo + el padre. Con solo el padre, el Gmail del otro
      // lado parte los hilos largos en dos.
      referencias = [orig.threadKey, orig.messageId].filter((x, i, a) => x && a.indexOf(x) === i).join(" ");
      original = orig;
    } else {
      // Reenviar: el original citado en el cuerpo, al estilo de siempre.
      asunto = asunto || `Fwd: ${orig.subject}`;
      const fecha = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(orig.date);
      texto += `\n\n---------- Mensaje reenviado ----------\nDe: ${orig.fromName ?? ""} <${orig.fromEmail ?? ""}>\nFecha: ${fecha}\nAsunto: ${orig.subject}\nPara: ${orig.toList}\n\n${(orig.textBody ?? "").slice(0, 100_000)}`;
    }
  }

  // Firma automática: nombre + cargo reales, no un texto pegado a mano en cada correo.
  const yo = await db.user.findUnique({ where: { id: session.id }, select: { name: true, title: true } });
  texto += `\n\n—\n${yo?.name ?? session.name}${yo?.title ? ` · ${yo.title}` : ""}\nLabstream Studio · labstreamsas.com`;

  const r = await enviarDesdeCuenta({
    accountId: cuenta.id,
    nombreRemitente: session.name ?? "Labstream",
    para,
    cc: cc || null,
    asunto: asunto || "(sin asunto)",
    texto,
    enRespuestaA,
    referencias,
    adjuntos,
  });
  if (!r.ok) return r;

  if (original && original.folder !== "ENVIADOS") {
    await db.mailMessage.update({ where: { id: original.id }, data: { answered: true } }).catch(() => {});
    void marcarEnServidor(cuenta.id, original.uid, "\\Answered", { folder: original.folder }).catch(() => {});
  }
  revalidatePath("/correo");
  return { ok: true };
}

// ── Acciones sobre mensajes: estrella, leído/no leído, archivar, papelera ──
// Todas en lote (la barra de selección manda ids) y todas con el MISMO candado: los mensajes
// tienen que ser de la cuenta del usuario de la sesión.

async function misMensajes(ids: string[], userId: string) {
  const limpios = [...new Set(ids.filter(Boolean))].slice(0, 100);
  if (!limpios.length) return [];
  return db.mailMessage.findMany({
    where: { id: { in: limpios }, account: { userId } },
    select: { id: true, uid: true, folder: true, seen: true, flagged: true, account: { select: { id: true } } },
  });
}

export async function estrellaCorreo(mensajeId: string, on: boolean): Promise<void> {
  const session = await sesionEquipo();
  if (!session) return;
  const [msg] = await misMensajes([mensajeId], session.id);
  if (!msg) return;
  await db.mailMessage.update({ where: { id: msg.id }, data: { flagged: on } });
  if (msg.folder !== "ENVIADOS") void marcarEnServidor(msg.account.id, msg.uid, "\\Flagged", { quitar: !on, folder: msg.folder }).catch(() => {});
  revalidatePath("/correo");
}

export async function marcarLeidosCorreo(ids: string[], seen = true): Promise<void> {
  const session = await sesionEquipo();
  if (!session) return;
  const msgs = await misMensajes(ids, session.id);
  const cambiar = msgs.filter((m) => m.seen !== seen);
  if (!cambiar.length) return;
  await db.mailMessage.updateMany({ where: { id: { in: cambiar.map((m) => m.id) } }, data: { seen } });
  for (const m of cambiar) {
    if (m.folder !== "ENVIADOS") void marcarEnServidor(m.account.id, m.uid, "\\Seen", { quitar: !seen, folder: m.folder }).catch(() => {});
  }
  revalidatePath("/correo");
}

export async function moverCorreos(ids: string[], destino: "ARCHIVO" | "PAPELERA" | "INBOX"): Promise<{ ok: boolean; error?: string }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "Sin sesión." };
  const msgs = await misMensajes(ids, session.id);
  let error: string | undefined;
  // En serie a propósito: es el MISMO servidor IMAP y cada movida abre su conexión.
  for (const m of msgs) {
    const r = await moverMensaje(m.id, session.id, destino);
    if (!r.ok) error = r.error;
  }
  revalidatePath("/correo");
  return { ok: !error, error };
}
