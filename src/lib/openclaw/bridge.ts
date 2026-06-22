import { db } from "@/lib/db";
import { publishMessage, publishTyping } from "@/lib/chat-bus";
import { ensureMarcebot, MARCEBOT_NAME, type BotUser } from "@/lib/marcebot/bot";
import { askOpenClaw, type ChatTurn } from "./client";
import { getOpenClawConfig } from "./config";
import { runAgent } from "./agent";
import { buildAgentSession, AGENT_TOOLS, executeAgentTool } from "./tools";
import { analyzeUserAttachments } from "./attachments";

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
    "Tienes herramientas para CONSULTAR clientes, proyectos, tareas, cotizaciones, facturas, eventos del calendario, archivos de proyecto y la wiki del equipo (páginas, inventario, ubicación y la bóveda de contraseñas —de la que NUNCA reveles la clave, solo dónde verla—), y para CREAR clientes, proyectos, tareas y tareas recurrentes. Puedes ENVIAR al usuario archivos de proyecto que tenga permiso de ver (find_files + send_file) y generar/enviar la cotización en PDF (send_quote). Si el usuario adjunta imágenes o PDF, recibirás su contenido ya analizado como contexto; úsalo para responder o crear tareas. NO tienes acceso a la Configuración del sistema (usuarios, roles, integraciones).",
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
export async function handleBotMention(channelId: string, userId: string, parentId: string | null = null): Promise<void> {
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

    // Si el último mensaje del usuario trae imágenes/PDF, Marcebot los "lee" (Claude visión)
    // y mete ese análisis como contexto para el agente. Best-effort: si falla, sigue sin él.
    const lastUserMsg = await db.chatMessage.findFirst({
      where: { channelId, deletedAt: null, authorId: userId },
      orderBy: { createdAt: "desc" },
      select: { attachments: { select: { name: true, mime: true, path: true } } },
    });
    const fileContext = lastUserMsg?.attachments?.length ? await analyzeUserAttachments(lastUserMsg.attachments) : null;

    const messages: ChatTurn[] = [
      { role: "system", content: session ? systemPrompt(session.name, session.role) : "Eres Marcebot, asistente del equipo de Labstream. Responde en español, breve y claro." },
      ...turns,
    ];
    if (fileContext) messages.push({ role: "user", content: `[Archivos que adjuntó el usuario, ya analizados] ${fileContext}` });

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
