import { db } from "@/lib/db";
import { getWhatsappConfig, normalizePhone, type WhatsappConfig } from "./config";
import { sendText, getMediaBase64 } from "./client";
import { transcribeOne } from "@/lib/openclaw/attachments";
import { buildAgentSession, AGENT_TOOLS, executeAgentTool } from "@/lib/openclaw/tools";
import { runAgent } from "@/lib/openclaw/agent";
import { ensureMarcebot, getOrCreateMarcebotDM } from "@/lib/marcebot/bot";
import type { ChatTurn } from "@/lib/openclaw/client";
import type { SessionUser } from "@/lib/session";

const CONTEXT_LIMIT = 14;

export type InboundMessage = {
  waMessageId: string;
  phone: string; // remoteJid o número
  text?: string | null; // texto del mensaje (si es de texto)
  mediaData?: unknown; // objeto `data` del webhook si es audio (para bajar el media)
};

// Prompt del sistema para el canal WhatsApp. Reglas iguales que el chat interno + énfasis en
// zona horaria America/Bogota, confirmación de acciones sensibles y respuestas breves.
function systemPrompt(askerName: string, askerRole: string, tz: string): string {
  const now = new Date();
  const fechaLarga = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz }).format(now);
  const hoyIso = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  return [
    "Eres Marcebot, el asistente del equipo de Labstream (productora audiovisual de Bogotá). Hablas con la persona por WHATSAPP (canal privado).",
    `Hoy es ${fechaLarga} (${hoyIso}), zona horaria ${tz}. Te escribe ${askerName} (rol: ${askerRole}).`,
    "Tienes las MISMAS herramientas que en el chat de la app (consultar y crear clientes, proyectos, tareas y recurrentes, CITAS del calendario con asistentes, NOTAS, cotizaciones, archivos, etc.) y actúas SIEMPRE con los permisos de esta persona.",
    `TODA fecha ambigua se resuelve en ${tz}: "mañana" = el día siguiente en Colombia; "el jueves" = el próximo jueves futuro; "a las 3" sin a.m./p.m. → asume horario laboral (3 p. m.) salvo que el contexto diga lo contrario, y si hay duda real, pregúntala.`,
    "Para acciones SENSIBLES o irreversibles (eliminar notas/citas, enviar mensajes a terceros, modificar eventos, acciones masivas), PIDE confirmación explícita antes de ejecutar y solo hazlo si la persona confirma ('sí, confirmo').",
    "Si te mandan una nota de voz, recibirás su transcripción: trátala como si te lo hubieran escrito. Responde en español, BREVE y claro (es WhatsApp), confirmando lo que hiciste (p. ej. «Listo, creé la cita con Zahid el jueves 25 a las 3:00 p. m.»). Las fechas que crees en formato YYYY-MM-DD.",
  ].join(" ");
}

// Procesa un mensaje entrante de WhatsApp: dedupe → autoriza → (audio→transcribe) → corre el
// MISMO agente (sesión separada de WhatsApp) → responde por WhatsApp. Best-effort: nunca lanza.
export async function processWhatsappInbound(msg: InboundMessage): Promise<void> {
  const cfg = getWhatsappConfig();
  if (!cfg) return;
  try {
    const norm = normalizePhone(msg.phone);
    if (!norm) return;

    // Autorización: solo números vinculados a un usuario activo CON permiso de comandar.
    const candidates = await db.user.findMany({
      where: { active: true, whatsappCommand: true, whatsappPhone: { not: null } },
      select: { id: true, name: true, whatsappPhone: true },
    });
    const user = candidates.find((u) => normalizePhone(u.whatsappPhone) === norm);
    if (!user) {
      // Número no autorizado para comandar (o solo recibe notificaciones): se ignora en silencio.
      return;
    }

    // Idempotencia: registra el turno entrante con el id de WhatsApp (único). Si ya existía
    // (webhook reenviado), Prisma lanza P2002 → es un duplicado → no reprocesar.
    let turnId: string;
    try {
      const created = await db.whatsappMessage.create({
        data: { userId: user.id, role: "user", content: "", waMessageId: msg.waMessageId },
        select: { id: true },
      });
      turnId = created.id;
    } catch {
      return; // duplicado (ya procesado)
    }

    // Resuelve el texto: audio → transcripción; si no, el texto recibido.
    let text = (msg.text ?? "").trim();
    if (!text && msg.mediaData) {
      const media = await getMediaBase64(cfg, msg.mediaData);
      if (media) text = (await transcribeOne(media.buffer, "voz.ogg", media.mime)).trim();
    }
    if (!text) {
      await db.whatsappMessage.update({ where: { id: turnId }, data: { content: "(mensaje sin texto)" } }).catch(() => null);
      await sendText(cfg, norm, "No entendí el mensaje. ¿Me lo escribes o me mandas una nota de voz?");
      return;
    }
    await db.whatsappMessage.update({ where: { id: turnId }, data: { content: text } }).catch(() => null);

    // Contexto: últimos turnos de ESTA conversación de WhatsApp (sesión separada del chat app).
    const history = await db.whatsappMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: CONTEXT_LIMIT,
      select: { role: true, content: true },
    });
    const turns: ChatTurn[] = history
      .reverse()
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

    const session: SessionUser | null = await buildAgentSession(user.id);
    let reply: string;
    if (!session) {
      reply = "Tu usuario no está activo. Revisa con el administrador.";
    } else {
      const bot = await ensureMarcebot();
      // Canal para entregar archivos si el agente usa send_file/send_quote (llegan a su DM in-app).
      const dmChannelId = await getOrCreateMarcebotDM(user.id, user.name);
      const messages: ChatTurn[] = [{ role: "system", content: systemPrompt(session.name, session.role, cfg.timezone) }, ...turns];
      const r = await runAgent(messages, AGENT_TOOLS, (name, args) =>
        executeAgentTool(name, args, session, { channelId: dmChannelId, botId: bot.id, source: "whatsapp" }),
      );
      reply = r.ok ? r.reply : "No pude completar la acción. Inténtalo de nuevo o revísalo en la app.";
    }

    await db.whatsappMessage.create({ data: { userId: user.id, role: "assistant", content: reply } }).catch(() => null);
    await sendText(cfg, norm, reply);
  } catch {
    // Best-effort: ante cualquier fallo, intenta avisar de forma amable (sin tecnicismos).
    try {
      const c: WhatsappConfig | null = getWhatsappConfig();
      if (c) await sendText(c, normalizePhone(msg.phone), "Tuve un problema procesando tu mensaje. Inténtalo de nuevo en un momento.");
    } catch {
      /* nada */
    }
  }
}
