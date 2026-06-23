import { db } from "@/lib/db";
import { publishMessage, publishTyping } from "@/lib/chat-bus";
import { ensureMarcebot, MARCEBOT_NAME, type BotUser } from "@/lib/marcebot/bot";
import { askOpenClaw, type ChatTurn } from "./client";
import { getOpenClawConfig } from "./config";
import { runAgent } from "./agent";
import { buildAgentSession, AGENT_TOOLS, executeAgentTool } from "./tools";
import { buildImageParts, extractDocsText, transcribeAudio } from "./attachments";

// Alias por los que se puede etiquetar al agente en el chat (además del nombre del bot).
const ALIASES = [MARCEBOT_NAME, "IA", "Asistente"];

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ¿El texto etiqueta al bot? (@Marcebot, @IA, @Asistente). Límites de palabra como en
// detectMentionIds del chat; insensible a mayúsculas/minúsculas para los alias.
export function mentionsBot(body: string): boolean {
  if (!body || !body.includes("@")) return false;
  const re = new RegExp(`(?<![\\p{L}0-9_])@(${ALIASES.map(escRe).join("|")})(?![\\p{L}0-9_])`, "iu");
  return re.test(body);
}

// Quita la etiqueta @bot del texto para no confundir al agente.
function stripMention(body: string): string {
  return body
    .replace(new RegExp(`(?<![\\p{L}0-9_])@(${ALIASES.map(escRe).join("|")})(?![\\p{L}0-9_])`, "giu"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const CONTEXT_LIMIT = 14; // últimos mensajes del canal que se pasan como contexto

// Instrucciones del sistema: identidad, fecha (zona Colombia), quién pregunta y reglas.
function systemPrompt(askerName: string, askerRole: string): string {
  const now = new Date();
  const fechaLarga = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" }).format(now);
  const hoyIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(now);
  return [
    "Eres Marcebot, el asistente de IA del equipo de Labstream (una productora audiovisual de Bogotá), dentro de su chat interno.",
    `Hoy es ${fechaLarga} (${hoyIso}). Te escribe ${askerName} (rol: ${askerRole}).`,
    "Tienes herramientas para CONSULTAR clientes, proyectos, tareas, cotizaciones, facturas, eventos del calendario, archivos y tablas de datos de los proyectos, y la wiki del equipo (páginas, inventario, ubicación y la bóveda de contraseñas —de la que NUNCA reveles la clave, solo dónde verla—), y para CREAR clientes, proyectos, tareas y tareas recurrentes, y CITAS/REUNIONES en el calendario (create_calendar_event: agrega como asistentes a las personas que indiques y a cada una le llega una notificación de que quien pidió la cita la invitó; el creador queda incluido). También guardas y consultas NOTAS rápidas de la persona (create_note / list_notes): úsalo cuando diga 'crea una nota', 'guarda esto', 'anota que', 'recuérdame…' o 'resúmeme mis notas'. Puedes ENVIAR mensajes a uno, varios o TODOS los colaboradores: los redactas tú y llegan a su chat directo contigo con notificación (send_message); el mensaje queda atribuido a quien te lo pide. Antes de enviar a varias personas o a todos, muestra el borrador y confirma los destinatarios. Puedes BUSCAR (find_files), LEER su contenido en texto (read_file: PDF, Word, Excel, CSV, texto, Markdown, subtítulos) y ENVIAR al usuario (send_file) los archivos de proyecto que tenga permiso de ver, y generar/enviar la cotización en PDF (send_quote). Para responder sobre lo que dice un documento de un proyecto, ábrelo con read_file. Para los datos de una TABLA de un proyecto, lístalas con list_tables y léelas con read_table. Si el usuario adjunta imágenes las verás directamente, si adjunta documentos (PDF, Word o Excel) recibirás su texto extraído, y si manda una NOTA DE VOZ recibirás su transcripción; úsalos para responder, resumir o crear tareas. NO tienes acceso a la Configuración del sistema (usuarios, roles, integraciones).",
    `Actúas SIEMPRE con los permisos de ${askerName}: las herramientas ya lo aplican, así que solo verás o crearás lo que esa persona podría (si no tiene permiso, te lo dirá la herramienta).`,
    "Reglas: usa las herramientas en vez de inventar datos. Resuelve nombres de cliente/proyecto/persona con find_clients/find_projects/find_users cuando haga falta. Para crear tareas de un cliente que aún no tiene proyecto: crea el cliente (si no existe), luego un proyecto, y luego las tareas. Si te falta un dato clave y no es evidente, pregúntalo antes de crear. Responde en español, breve y claro. Las fechas en formato YYYY-MM-DD.",
  ].join(" ");
}

// Publica un mensaje del bot en un canal cualquiera y lo emite en tiempo real.
async function postBotMessage(bot: BotUser, channelId: string, body: string, parentId: string | null): Promise<void> {
  const msg = await db.chatMessage.create({
    data: { channelId, body, authorId: bot.id, parentId: parentId ?? null },
    include: { author: { select: { name: true, initials: true, avatarColor: true } } },
  });
  publishMessage({
    id: msg.id,
    channelId,
    body: msg.body,
    parentId: msg.parentId,
    createdAt: msg.createdAt.toISOString(),
    author: msg.author ? { name: msg.author.name, initials: msg.author.initials, color: msg.author.avatarColor } : null,
    attachments: [],
  });
}

// Maneja una mención al bot: arma el contexto reciente del canal, deja que el agente razone
// con herramientas (ejecutadas con los permisos de quien etiqueta) y publica la respuesta.
// Pensado para ejecutarse en segundo plano (after()). Best-effort: nunca lanza.
export async function handleBotMention(channelId: string, userId: string, parentId: string | null = null, messageId: string | null = null): Promise<void> {
  try {
    if (!(await getOpenClawConfig())) return; // integración apagada → silencio
    const bot = await ensureMarcebot();
    publishTyping(channelId, bot.id, MARCEBOT_NAME);

    const recent = await db.chatMessage.findMany({
      where: { channelId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: CONTEXT_LIMIT,
      select: { body: true, authorId: true, author: { select: { name: true } } },
    });
    const turns: ChatTurn[] = recent
      .reverse()
      .filter((m) => m.body.trim())
      .map((m): ChatTurn =>
        m.authorId === bot.id
          ? { role: "assistant", content: m.body }
          : { role: "user", content: `${m.author?.name ?? "Alguien"}: ${stripMention(m.body) || m.body}` },
      );

    const session = await buildAgentSession(userId);

    // Adjuntos del mensaje EXACTO que disparó la mención (imágenes/documentos) → se los pasamos
    // al modelo vía OpenClaw. Si no se conoce el messageId, caemos al último mensaje del usuario.
    const attSel = { attachments: { select: { name: true, mime: true, path: true } } } as const;
    const trigMsg = messageId
      ? await db.chatMessage.findUnique({ where: { id: messageId }, select: attSel })
      : await db.chatMessage.findFirst({ where: { channelId, deletedAt: null, authorId: userId }, orderBy: { createdAt: "desc" }, select: attSel });
    const atts = trigMsg?.attachments ?? [];
    const imageParts = atts.length ? await buildImageParts(atts) : [];
    const docsText = atts.length ? await extractDocsText(atts) : null;
    const voiceText = atts.length ? await transcribeAudio(atts) : null;

    const messages: ChatTurn[] = [
      { role: "system", content: session ? systemPrompt(session.name, session.role) : "Eres Marcebot, asistente del equipo de Labstream. Responde en español, breve y claro." },
      ...turns,
    ];
    if (docsText) messages.push({ role: "user", content: `[Contenido de los documentos (PDF) que adjunté]\n${docsText}` });
    if (voiceText) messages.push({ role: "user", content: `[Transcripción de la nota de voz que envié — trátala como si te lo hubiera escrito]\n${voiceText}` });
    if (imageParts.length) {
      messages.push({ role: "user", content: [{ type: "text", text: "Imágenes que adjunté en el chat (míralas para responder):" }, ...imageParts] });
    }

    // Mantiene viva la animación de "escribiendo…" de Marcebot mientras procesa (re-emite cada
    // 3s, antes de que el indicador caduque a los 4s), aunque el análisis tarde varios minutos.
    const keepTyping = setInterval(() => publishTyping(channelId, bot.id, MARCEBOT_NAME), 3000);
    let reply: string;
    try {
      // Con sesión → bucle de herramientas (consultas/creación con sus permisos). Sin sesión
      // (caso raro) → respuesta simple de texto.
      const r = session
        ? await runAgent(messages, AGENT_TOOLS, (name, args) => executeAgentTool(name, args, session, { channelId, botId: bot.id }))
        : await askOpenClaw(messages);
      reply = r.ok ? r.reply : `⚠️ ${r.error}`;
    } finally {
      clearInterval(keepTyping);
    }

    await postBotMessage(bot, channelId, reply, parentId);
  } catch {
    /* best-effort: nunca romper el envío del usuario */
  }
}
