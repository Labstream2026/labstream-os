import { db } from "@/lib/db";
import { publishMessage, publishTyping } from "@/lib/chat-bus";
import { ensureMarcebot, MARCEBOT_NAME, type BotUser } from "@/lib/marcebot/bot";
import { askOpenClaw, type ChatTurn } from "./client";
import { getOpenClawConfig } from "./config";

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

const CONTEXT_LIMIT = 14; // últimos mensajes del canal que se le pasan como contexto

const SYSTEM_PROMPT =
  "Eres el asistente de IA del equipo de Labstream (una productora audiovisual), integrado en su chat interno. " +
  "Te escriben etiquetándote con @Marcebot. Responde SIEMPRE en español, de forma breve, clara y útil. " +
  "Si te piden algo que no puedes hacer desde el chat, dilo con franqueza. No inventes datos del equipo.";

// Publica un mensaje del bot en un canal cualquiera (no solo DMs) y lo emite en tiempo real.
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

// Maneja una mención al bot en un canal: arma el contexto reciente, consulta a OpenClaw y
// publica la respuesta como mensaje del bot. Pensado para ejecutarse en segundo plano
// (after()) porque el agente puede tardar. Es best-effort y nunca lanza.
export async function handleBotMention(channelId: string, parentId: string | null = null): Promise<void> {
  try {
    // Si la integración no está activa/configurada, silencio (no se publica nada).
    if (!(await getOpenClawConfig())) return;
    const bot = await ensureMarcebot();

    // Señal de "escribiendo…" mientras el agente piensa.
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
    const messages: ChatTurn[] = [{ role: "system", content: SYSTEM_PROMPT }, ...turns];

    const r = await askOpenClaw(messages);
    await postBotMessage(bot, channelId, r.ok ? r.reply : `⚠️ ${r.error}`, parentId);
  } catch {
    /* best-effort: nunca romper el envío del usuario */
  }
}
