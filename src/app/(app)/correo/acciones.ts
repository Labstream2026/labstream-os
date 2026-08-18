"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { marcarEnServidor, sincronizarCuenta } from "@/lib/correo/imap";
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

export async function enviarCorreo(input: {
  para: string;
  asunto: string;
  texto: string;
  /** id del mensaje al que se responde (para hilo + marcar respondido). */
  responderAId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "El correo es solo para el equipo." };
  const cuenta = await db.mailAccount.findUnique({ where: { userId: session.id }, select: { id: true } });
  if (!cuenta) return { ok: false, error: "Conecta tu buzón primero." };

  const para = input.para.trim();
  const texto = input.texto.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return { ok: false, error: "El destinatario no parece una dirección válida." };
  if (!texto) return { ok: false, error: "El mensaje está vacío." };

  // Responder en hilo: el original tiene que ser de ESTA cuenta — el id viene del navegador
  // y sin este candado serviría para leer Message-IDs ajenos.
  let enRespuestaA: string | null = null;
  let original: { id: string; uid: bigint; folder: string } | null = null;
  if (input.responderAId) {
    const orig = await db.mailMessage.findUnique({
      where: { id: input.responderAId },
      select: { id: true, uid: true, folder: true, messageId: true, account: { select: { id: true } } },
    });
    if (!orig || orig.account.id !== cuenta.id) return { ok: false, error: "Ese mensaje no existe." };
    enRespuestaA = orig.messageId;
    original = orig;
  }

  const r = await enviarDesdeCuenta({
    accountId: cuenta.id,
    nombreRemitente: session.name ?? "Labstream",
    para,
    asunto: input.asunto.trim().slice(0, 300) || "(sin asunto)",
    texto,
    enRespuestaA,
  });
  if (!r.ok) return r;

  if (original && original.folder === "INBOX") {
    await db.mailMessage.update({ where: { id: original.id }, data: { answered: true } }).catch(() => {});
    void marcarEnServidor(cuenta.id, original.uid, "\\Answered").catch(() => {});
  }
  revalidatePath("/correo");
  return { ok: true };
}
