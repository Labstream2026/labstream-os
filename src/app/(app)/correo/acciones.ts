"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { backfillCuenta, descargarAdjunto, marcarEnServidor, moverMensaje, sincronizarCuenta } from "@/lib/correo/imap";
import { esDominioAgrupable } from "@/lib/correo/hilos";
import { userCanAccessClient } from "@/lib/client-access";
import { enviarDesdeCuenta, probarConexion } from "@/lib/correo/enviar";
import { sanearSaliente, extraerInlines, textoDeHtml, htmlDeTexto, type ParteInline } from "@/lib/correo/redactar";
import { firmaDeCuenta } from "@/lib/correo/firma";
import { textoPlano } from "@/lib/correo/sanitizar";
import { canAccessProject, PROJECT_ACCESS_SELECT } from "@/lib/project-access";

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

// Vista previa FLOTANTE de un hilo (al posar el ratón en la fila): el comienzo del último
// mensaje, en texto plano. No marca nada como leído — mirar de reojo no es abrir.
export async function previaCorreo(mensajeId: string): Promise<{ texto: string } | null> {
  const session = await sesionEquipo();
  if (!session) return null;
  const m = await db.mailMessage.findFirst({
    where: { id: mensajeId, account: { userId: session.id } },
    select: { textBody: true, htmlBody: true },
  });
  if (!m) return null;
  const texto = (m.textBody?.trim() || (m.htmlBody ? textoPlano(m.htmlBody, 700) : "")).slice(0, 700);
  return { texto: texto || "(sin contenido)" };
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
 * nuevo, responder (en hilo, con References completo) y reenviar (cita el original). El cuerpo
 * llega como HTML del redactor: se sanea, sus imágenes se vuelven partes CID (GIFs de la
 * biblioteca incluidos) y la firma —con su imagen en alta calidad— se anexa al final.
 */
export async function enviarCorreoForm(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "El correo es solo para el equipo." };
  const cuenta = await db.mailAccount.findUnique({ where: { userId: session.id }, select: { id: true, email: true } });
  if (!cuenta) return { ok: false, error: "Conecta tu buzón primero." };

  const para = String(fd.get("para") ?? "").trim();
  const cc = String(fd.get("cc") ?? "").trim();
  let asunto = String(fd.get("asunto") ?? "").trim().slice(0, 300);
  const htmlCrudo = String(fd.get("html") ?? "").trim();
  const textoCrudo = String(fd.get("texto") ?? "").trim();
  const responderAId = String(fd.get("responderAId") ?? "").trim() || null;
  const reenviarDeId = String(fd.get("reenviarDeId") ?? "").trim() || null;

  if (!para || !listaValida(para)) return { ok: false, error: "El destinatario no parece una dirección válida." };
  if (cc && !listaValida(cc)) return { ok: false, error: "Hay una dirección inválida en CC." };
  // El redactor manda `html`; `texto` queda como respaldo (borradores viejos, sin JS).
  let html = htmlCrudo ? sanearSaliente(htmlCrudo) : htmlDeTexto(textoCrudo);
  if (!textoDeHtml(html).trim() && !/<img\b/i.test(html)) return { ok: false, error: "El mensaje está vacío." };

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
  let original: { id: string; uid: bigint; folder: string; projectId: string | null } | null = null;
  let projectId: string | null = null;
  let cita = ""; // el original citado (respuestas): va DESPUÉS de la firma, como en Gmail
  const origenId = responderAId ?? reenviarDeId;
  if (origenId) {
    const orig = await db.mailMessage.findUnique({
      where: { id: origenId },
      select: {
        id: true, uid: true, folder: true, messageId: true, inReplyTo: true, threadKey: true, projectId: true,
        fromName: true, fromEmail: true, toList: true, subject: true, date: true, textBody: true, attachments: true,
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
      projectId = orig.projectId; // la respuesta hereda el proyecto del hilo
      // La respuesta CITA el original plegado, como en cualquier cliente de correo: el hilo
      // técnico (References) ya existía — esto es lo que VE el humano del otro lado.
      const fechaR = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(orig.date);
      cita = `<br><div style="color:#71717a;font-size:13px">El ${htmlDeTexto(fechaR)}, ${htmlDeTexto(orig.fromName || orig.fromEmail || "")} escribió:</div><blockquote>${htmlDeTexto((orig.textBody ?? "").slice(0, 50_000))}</blockquote>`;
    } else {
      // Reenviar: el original citado en el cuerpo, al estilo de siempre — Y con sus
      // ADJUNTOS originales (se bajan del servidor y viajan de nuevo; antes se perdían).
      asunto = asunto || `Fwd: ${orig.subject}`;
      const fecha = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(orig.date);
      html += `<br><br><div>---------- Mensaje reenviado ----------<br>De: ${htmlDeTexto(`${orig.fromName ?? ""} <${orig.fromEmail ?? ""}>`)}<br>Fecha: ${htmlDeTexto(fecha)}<br>Asunto: ${htmlDeTexto(orig.subject)}<br>Para: ${htmlDeTexto(orig.toList)}</div><blockquote>${htmlDeTexto((orig.textBody ?? "").slice(0, 100_000))}</blockquote>`;

      const metaAdjuntos = ((orig.attachments as { indice: number; nombre?: string; bytes?: number }[] | null) ?? []).filter((a) => typeof a?.indice === "number");
      for (const a of metaAdjuntos) {
        const r = await descargarAdjunto(orig.id, a.indice, session.id);
        if ("error" in r) {
          if (orig.folder === "ENVIADOS") break; // los enviados locales no guardan adjuntos
          return { ok: false, error: `No se pudo traer el adjunto «${a.nombre ?? a.indice}» del original: ${r.error}` };
        }
        total += r.contenido.length;
        if (total > MAX_ADJUNTOS_BYTES) return { ok: false, error: "Con los adjuntos del original se superan los 15 MB. Reenvía sin ellos o comparte un enlace." };
        adjuntos.push({ nombre: r.nombre, mime: r.mime, contenido: r.contenido });
      }
    }
  }

  // Firma: la corporativa de plantilla, la personalizada o la institucional — la compone
  // el MISMO helper de la vista previa, con la imagen INCRUSTADA en alta calidad.
  const firma = await firmaDeCuenta(cuenta.id);
  html += firma.html + cita;

  // Imágenes del cuerpo (pegadas o de la biblioteca de GIFs) → partes CID.
  const extraccion = await extraerInlines(html, async (id) => {
    const g = await db.mailGif.findUnique({ where: { id }, select: { nombre: true, mime: true, bytes: true } });
    return g ? { nombre: g.nombre, mime: g.mime, contenido: Buffer.from(g.bytes) } : null;
  });
  if (extraccion.error) return { ok: false, error: extraccion.error };
  const inlines: ParteInline[] = [...extraccion.inlines, ...firma.inlines];

  const r = await enviarDesdeCuenta({
    accountId: cuenta.id,
    nombreRemitente: session.name ?? "Labstream",
    para,
    cc: cc || null,
    asunto: asunto || "(sin asunto)",
    texto: textoDeHtml(extraccion.html),
    html: extraccion.html,
    inlines,
    enRespuestaA,
    referencias,
    adjuntos,
    projectId,
  });
  if (!r.ok) return r;

  if (original && original.folder !== "ENVIADOS") {
    await db.mailMessage.update({ where: { id: original.id }, data: { answered: true } }).catch(() => {});
    void marcarEnServidor(cuenta.id, original.uid, "\\Answered", { folder: original.folder }).catch(() => {});
  }
  // El borrador del que salió este envío ya cumplió: se va.
  const borradorId = String(fd.get("borradorId") ?? "").trim();
  if (borradorId) await db.mailDraft.deleteMany({ where: { id: borradorId, accountId: cuenta.id } }).catch(() => {});
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

// ── Posponer (solo local: MailPlus no tiene el concepto) ──
// Los presets se calculan AQUÍ y en hora de Bogotá — el navegador de cada quien no decide
// qué significa «mañana a las 9».
export async function posponerCorreos(ids: string[], preset: "tarde" | "manana" | "lunes" | "quitar"): Promise<void> {
  const session = await sesionEquipo();
  if (!session) return;
  const msgs = await misMensajes(ids, session.id);
  if (!msgs.length) return;

  let hasta: Date | null = null;
  if (preset !== "quitar") {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    const a = (ymd: string, h: string) => new Date(`${ymd}T${h}:00.000-05:00`); // Bogotá no tiene DST
    const dia = (n: number) => {
      const d = new Date(`${hoy}T12:00:00.000-05:00`);
      d.setUTCDate(d.getUTCDate() + n);
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
    };
    if (preset === "tarde") hasta = new Date(Date.now() + 3 * 3600_000);
    else if (preset === "manana") hasta = a(dia(1), "09:00");
    else {
      // El próximo lunes a las 9 (si hoy es lunes, el de la semana entrante).
      const dow = new Date(`${hoy}T12:00:00.000-05:00`).getUTCDay();
      hasta = a(dia(((8 - dow) % 7) || 7), "09:00");
    }
  }
  await db.mailMessage.updateMany({ where: { id: { in: msgs.map((m) => m.id) } }, data: { snoozedUntil: hasta } });
  revalidatePath("/correo");
}

// ── Borradores: autoguardado del compositor ──
export async function guardarBorrador(input: {
  id?: string | null;
  para: string; cc: string; asunto: string; texto: string;
  responderAId?: string | null; reenviarDeId?: string | null;
}): Promise<{ id: string } | null> {
  const session = await sesionEquipo();
  if (!session) return null;
  const cuenta = await db.mailAccount.findUnique({ where: { userId: session.id }, select: { id: true } });
  if (!cuenta) return null;
  const data = {
    para: input.para.slice(0, 500),
    cc: input.cc.slice(0, 500),
    asunto: input.asunto.slice(0, 300),
    texto: input.texto.slice(0, 100_000),
    responderAId: input.responderAId ?? null,
    reenviarDeId: input.reenviarDeId ?? null,
  };
  if (input.id) {
    // El candado de siempre: solo borradores de la propia cuenta.
    const r = await db.mailDraft.updateMany({ where: { id: input.id, accountId: cuenta.id }, data });
    if (r.count === 1) return { id: input.id };
  }
  const d = await db.mailDraft.create({ data: { accountId: cuenta.id, ...data }, select: { id: true } });
  return { id: d.id };
}

export async function eliminarBorrador(id: string): Promise<void> {
  const session = await sesionEquipo();
  if (!session) return;
  await db.mailDraft.deleteMany({ where: { id, account: { userId: session.id } } });
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

// ── Segmentar por EMPRESA: dominio → cliente («@pepsico.com es Pepsico») ──
// Global (todo el equipo ve igual) y con BACKFILL: lo ya sincronizado de ese dominio queda
// etiquetado de una vez, en todas las bandejas. Los dominios gratuitos se rechazan.
export async function agruparDominioCliente(clientId: string, domain: string): Promise<{ ok: boolean; error?: string; etiquetados?: number }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "Sin sesión." };
  if (!(await userCanAccessClient(clientId, session))) return { ok: false, error: "No puedes tocar ese cliente." };
  const d = domain.trim().toLowerCase().replace(/^@/, "");
  if (!esDominioAgrupable(d)) return { ok: false, error: "Ese dominio no se puede agrupar (correo gratuito o formato inválido)." };

  await db.clientMailDomain.upsert({
    where: { domain: d },
    create: { domain: d, clientId, createdById: session.id },
    update: { clientId },
  });
  // Backfill: TODO lo ya sincronizado de ese dominio (en todas las cuentas) queda del cliente.
  // Solo lo sin etiquetar: un match exacto de miembro no se pisa.
  const r = await db.mailMessage.updateMany({
    where: { fromEmail: { endsWith: `@${d}`, mode: "insensitive" }, clientId: null },
    data: { clientId },
  });
  const cliente = await db.client.findUnique({ where: { id: clientId }, select: { name: true } });
  await logActivity({
    action: "correo.dominio",
    summary: `agrupó el dominio @${d} bajo ${cliente?.name ?? "un cliente"} (${r.count} correos etiquetados)`,
    clientId,
    entityType: "correo",
    silent: true,
  });
  revalidatePath("/correo");
  return { ok: true, etiquetados: r.count };
}

export async function quitarDominioCliente(domain: string): Promise<void> {
  const session = await sesionEquipo();
  if (!session) return;
  const d = await db.clientMailDomain.delete({ where: { domain: domain.trim().toLowerCase() }, select: { domain: true } }).catch(() => null);
  if (d) await logActivity({ action: "correo.dominio", summary: `quitó la agrupación del dominio @${d.domain}`, entityType: "correo", silent: true });
  // Lo ya etiquetado se queda: quitar la regla frena lo FUTURO, no reescribe la historia.
  revalidatePath("/correo");
}

// ── Silenciar un remitente: lo suyo entra directo al Archivo DE LA APP ──
// Para el ruido automático (notificaciones, robots). Solo local a propósito: el webmail lo
// sigue mostrando — esta es la bandeja del equipo sin ruido, no una regla del servidor.
export async function silenciarRemitente(fromEmail: string, on: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "Sin sesión." };
  const cuenta = await db.mailAccount.findUnique({ where: { userId: session.id }, select: { id: true } });
  if (!cuenta) return { ok: false, error: "Conecta tu buzón primero." };
  const e = fromEmail.trim().toLowerCase();
  if (!RE_MAIL.test(e)) return { ok: false, error: "Remitente inválido." };

  if (on) {
    await db.mailRule.upsert({
      where: { accountId_fromEmail: { accountId: cuenta.id, fromEmail: e } },
      create: { accountId: cuenta.id, fromEmail: e, archivar: true },
      update: { archivar: true },
    });
    // Lo que YA está en Recibidos de ese remitente se archiva (localmente) de una vez.
    await db.mailMessage.updateMany({
      where: { accountId: cuenta.id, folder: "INBOX", fromEmail: { equals: e, mode: "insensitive" } },
      data: { folder: "ARCHIVO" },
    });
  } else {
    // Quitar el silencio: si la regla también asignaba proyecto, se conserva esa parte.
    const regla = await db.mailRule.findUnique({ where: { accountId_fromEmail: { accountId: cuenta.id, fromEmail: e } }, select: { projectId: true } });
    if (regla?.projectId) {
      await db.mailRule.update({ where: { accountId_fromEmail: { accountId: cuenta.id, fromEmail: e } }, data: { archivar: false } });
    } else {
      await db.mailRule.deleteMany({ where: { accountId: cuenta.id, fromEmail: e, projectId: null } });
    }
  }
  revalidatePath("/correo");
  return { ok: true };
}

// ── Traer HISTORIAL viejo (una tanda de ~300 por pulsación, hasta 1 año atrás) ──
export async function sincronizarHistorico(): Promise<{ ok: boolean; error?: string; traidos?: number }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "Sin sesión." };
  const cuenta = await db.mailAccount.findUnique({ where: { userId: session.id }, select: { id: true } });
  if (!cuenta) return { ok: false, error: "No hay buzón conectado." };
  const r = await backfillCuenta(cuenta.id, 365, 300);
  revalidatePath("/correo");
  return { ok: !r.error, error: r.error ?? undefined, traidos: r.traidos };
}

// ── Firma del usuario (HTML corto + imagen en alta calidad) ──
export async function guardarFirma(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "Sin sesión." };
  const cuenta = await db.mailAccount.findUnique({ where: { userId: session.id }, select: { id: true } });
  if (!cuenta) return { ok: false, error: "Conecta tu buzón primero." };

  const html = sanearSaliente(String(fd.get("firmaHtml") ?? "").trim()).slice(0, 4000) || null;
  const quitarImagen = String(fd.get("quitarImagen") ?? "") === "1";

  let imagen: Uint8Array<ArrayBuffer> | null | undefined = quitarImagen ? null : undefined;
  let mime: string | null | undefined = quitarImagen ? null : undefined;
  const archivo = fd.get("imagen");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > 500 * 1024) return { ok: false, error: "La imagen de la firma no debe pasar de 500 KB (súbela a 2× de tamaño para que se vea nítida, pero optimizada)." };
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(archivo.type)) return { ok: false, error: "La firma acepta PNG, JPG, WebP o GIF." };
    imagen = new Uint8Array(await archivo.arrayBuffer());
    mime = archivo.type.toLowerCase();
  }

  await db.mailAccount.update({
    where: { id: cuenta.id },
    // Guardar la personalizada te CAMBIA a la personalizada: la plantilla queda suelta.
    data: { signatureHtml: html, signatureTemplateId: null, ...(imagen !== undefined ? { signatureImage: imagen, signatureImageMime: mime } : {}) },
  });
  revalidatePath("/correo");
  return { ok: true };
}

// ── Elegir la firma: una plantilla del estudio (con tu nombre/cargo) o volver a la básica ──
export async function elegirFirma(input: { templateId: string | null; nombre?: string; cargo?: string }): Promise<{ ok: boolean; error?: string }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "Sin sesión." };
  const cuenta = await db.mailAccount.findUnique({ where: { userId: session.id }, select: { id: true } });
  if (!cuenta) return { ok: false, error: "Conecta tu buzón primero." };

  if (input.templateId) {
    const existe = await db.mailSignatureTemplate.findUnique({ where: { id: input.templateId }, select: { id: true } });
    if (!existe) return { ok: false, error: "Esa plantilla ya no existe." };
  }
  await db.mailAccount.update({
    where: { id: cuenta.id },
    data: {
      signatureTemplateId: input.templateId,
      signatureName: input.nombre?.trim().slice(0, 120) || null,
      signatureRole: input.cargo?.trim().slice(0, 120) || null,
      // Elegir plantilla (o la básica) suelta la personalizada como firma activa; el HTML
      // propio se conserva por si vuelve.
    },
  });
  revalidatePath("/correo");
  return { ok: true };
}

// ── Plantillas de FIRMA del estudio (estructurar la corporativa una sola vez) ──
export async function guardarPlantillaFirma(fd: FormData): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "Sin sesión." };

  const id = String(fd.get("id") ?? "").trim() || null;
  const nombre = String(fd.get("nombre") ?? "").trim().slice(0, 80);
  const html = sanearSaliente(String(fd.get("html") ?? "").trim()).slice(0, 20_000);
  if (!nombre) return { ok: false, error: "Ponle un nombre a la plantilla (p. ej. «Labstream 2026»)." };
  if (!textoDeHtml(html).trim()) return { ok: false, error: "La plantilla está vacía. Usa {{nombre}} y {{cargo}} donde va cada dato." };

  let imagen: Uint8Array<ArrayBuffer> | undefined;
  let mime: string | undefined;
  const archivo = fd.get("imagen");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > 500 * 1024) return { ok: false, error: "La imagen no debe pasar de 500 KB (súbela a 2× de tamaño, optimizada)." };
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(archivo.type)) return { ok: false, error: "PNG, JPG, WebP o GIF." };
    imagen = new Uint8Array(await archivo.arrayBuffer());
    mime = archivo.type.toLowerCase();
  }
  const quitarImagen = String(fd.get("quitarImagen") ?? "") === "1";

  const data = {
    nombre,
    html,
    ...(imagen ? { imageBytes: imagen, imageMime: mime } : quitarImagen ? { imageBytes: null, imageMime: null } : {}),
  };
  const fila = id
    ? await db.mailSignatureTemplate.update({ where: { id }, data }).catch(() => null)
    : await db.mailSignatureTemplate.create({ data: { ...data, createdById: session.id } });
  if (!fila) return { ok: false, error: "Esa plantilla ya no existe." };

  await logActivity({ action: "correo.firma", summary: `${id ? "actualizó" : "creó"} la plantilla de firma «${nombre}»`, entityType: "correo", silent: true });
  revalidatePath("/correo");
  return { ok: true, id: fila.id };
}

export async function eliminarPlantillaFirma(id: string): Promise<void> {
  const session = await sesionEquipo();
  if (!session) return;
  // Las cuentas que la usaban vuelven a la institucional (FK SetNull). Queda en bitácora.
  const p = await db.mailSignatureTemplate.delete({ where: { id }, select: { nombre: true } }).catch(() => null);
  if (p) await logActivity({ action: "correo.firma", summary: `eliminó la plantilla de firma «${p.nombre}»`, entityType: "correo", silent: true });
  revalidatePath("/correo");
}

// ── Biblioteca de GIFs del estudio (compartida por todo el equipo) ──
export async function subirGif(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "Sin sesión." };
  const archivo = fd.get("gif");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Falta el archivo." };
  if (archivo.size > 3 * 1024 * 1024) return { ok: false, error: "Máximo 3 MB por GIF: uno más pesado infla cada correo que lo lleve." };
  if (!/^image\/(gif|webp|png|jpe?g)$/i.test(archivo.type)) return { ok: false, error: "Sube un GIF (o WebP/PNG/JPG)." };
  const nombre = (String(fd.get("nombre") ?? "").trim() || archivo.name.replace(/\.[a-z0-9]+$/i, "")).slice(0, 80);
  await db.mailGif.create({
    data: { nombre, mime: archivo.type.toLowerCase(), bytes: new Uint8Array(await archivo.arrayBuffer()), createdById: session.id },
  });
  revalidatePath("/correo");
  return { ok: true };
}

// ── Plantillas de correo del estudio ──
// Se guardan desde el propio redactor («Guardar lo escrito como plantilla») y las aplica
// cualquiera del equipo. El HTML entra por la MISMA allowlist del envío.
export async function guardarPlantillaCorreo(nombre: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "Sin sesión." };
  const limpio = sanearSaliente(html).slice(0, 100_000);
  const n = nombre.trim().slice(0, 80);
  if (!n) return { ok: false, error: "Ponle un nombre a la plantilla." };
  if (!textoDeHtml(limpio).trim() && !/<img\b/i.test(limpio)) return { ok: false, error: "El cuerpo está vacío: escribe el correo primero y luego guárdalo como plantilla." };
  await db.mailTemplate.create({ data: { nombre: n, html: limpio, createdById: session.id } });
  await logActivity({ action: "correo.plantilla", summary: `guardó la plantilla de correo «${n}»`, entityType: "correo", silent: true });
  revalidatePath("/correo");
  return { ok: true };
}

export async function eliminarPlantillaCorreo(id: string): Promise<void> {
  const session = await sesionEquipo();
  if (!session) return;
  const p = await db.mailTemplate.delete({ where: { id }, select: { nombre: true } }).catch(() => null);
  if (p) await logActivity({ action: "correo.plantilla", summary: `eliminó la plantilla de correo «${p.nombre}»`, entityType: "correo", silent: true });
  revalidatePath("/correo");
}

export async function eliminarGif(id: string): Promise<void> {
  const session = await sesionEquipo();
  if (!session) return;
  // Cualquiera del equipo puede curar la biblioteca (es compartida); queda en la bitácora.
  const g = await db.mailGif.delete({ where: { id }, select: { nombre: true } }).catch(() => null);
  if (g) await logActivity({ action: "correo.gif", summary: `quitó «${g.nombre}» de la biblioteca de GIFs`, entityType: "correo", silent: true });
  revalidatePath("/correo");
}

// ── Asignar un hilo a un PROYECTO ──
// Asignar EXPONE el hilo en la sección Correo de ese proyecto (los correos son personales;
// esta es la decisión explícita de compartirlos con ese equipo). `regla` además deja
// programado que TODO lo futuro de ese remitente caiga solo en el proyecto.
export async function asignarProyectoHilo(
  ids: string[],
  projectId: string | null,
  opts?: { reglaRemitente?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const session = await sesionEquipo();
  if (!session) return { ok: false, error: "Sin sesión." };
  const msgs = await db.mailMessage.findMany({
    where: { id: { in: [...new Set(ids)].slice(0, 100) }, account: { userId: session.id } },
    select: { id: true, account: { select: { id: true } } },
  });
  if (!msgs.length) return { ok: false, error: "Ese hilo no existe." };

  if (projectId) {
    // El proyecto tiene que existir y el usuario poder VERLO (no asignar a ciegas por id).
    const proyecto = await db.project.findUnique({ where: { id: projectId }, select: PROJECT_ACCESS_SELECT });
    if (!proyecto || !canAccessProject(proyecto, session)) return { ok: false, error: "No puedes asignar a ese proyecto." };
  }

  await db.mailMessage.updateMany({ where: { id: { in: msgs.map((m) => m.id) } }, data: { projectId } });

  // Regla opcional: lo próximo de este remitente cae solo (o se borra la regla al desasignar).
  const remitente = opts?.reglaRemitente?.trim().toLowerCase() || null;
  if (remitente && RE_MAIL.test(remitente)) {
    const accountId = msgs[0].account.id;
    if (projectId) {
      await db.mailRule.upsert({
        where: { accountId_fromEmail: { accountId, fromEmail: remitente } },
        create: { accountId, fromEmail: remitente, projectId },
        update: { projectId },
      });
    } else {
      await db.mailRule.deleteMany({ where: { accountId, fromEmail: remitente } });
    }
  }

  if (projectId) {
    await logActivity({
      action: "correo.proyecto",
      summary: `asignó un hilo de correo al proyecto`,
      projectId,
      entityType: "correo",
      silent: true,
    });
    revalidatePath(`/proyectos/${projectId}`);
  }
  revalidatePath("/correo");
  return { ok: true };
}
