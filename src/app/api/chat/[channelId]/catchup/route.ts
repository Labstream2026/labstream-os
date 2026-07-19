import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { userCanAccessChannel } from "@/lib/chat-access";
import { aiEnabled, AI_MODEL, getAnthropic } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// «Ponerte al día»: resume lo que pasó en un canal DESDE la última lectura del usuario (?since=).
// Datos estructurados SIEMPRE (cuántos mensajes, de quién, si te mencionaron) + un resumen en prosa
// de la IA cuando hay suficiente y ANTHROPIC_API_KEY está configurada (degradación elegante si falla
// o no está). Acceso: misma regla que ver el canal — no filtra nada nuevo (el usuario ya puede leer
// esos mensajes); solo los presenta condensados para no tener que leer 40 para saber qué pasó.

const MAX_MSGS = 120; // techo de mensajes a considerar para el resumen
const MIN_FOR_AI = 3; // menos que esto no justifica llamar a la IA

function parseDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userCanAccessChannel(channelId, session))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const since = parseDate(new URL(req.url).searchParams.get("since"));
  if (!since) return NextResponse.json({ total: 0, authors: [], mentionedYou: false, summary: null });

  // Mensajes AJENOS (no los míos, no del bot) desde la última lectura, en orden cronológico.
  const rows = await db.chatMessage.findMany({
    where: {
      channelId,
      createdAt: { gt: since },
      deletedAt: null,
      authorId: { not: session.id },
      author: { isSystemBot: false },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_MSGS,
    select: { body: true, author: { select: { name: true } } },
  });

  const total = rows.length;
  const byAuthor = new Map<string, number>();
  for (const r of rows) {
    const n = r.author?.name ?? "Alguien";
    byAuthor.set(n, (byAuthor.get(n) ?? 0) + 1);
  }
  const authors = [...byAuthor.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

  // «Te mencionaron»: señal fiable ya existente — las menciones crean notificaciones con link al canal.
  const mentionedYou =
    (await db.notification.count({
      where: { userId: session.id, type: "mention", createdAt: { gt: since }, link: { contains: `/chat/${channelId}` } },
    })) > 0;

  // Resumen en prosa (IA), solo si hay suficiente y la clave está configurada. Transcripción acotada.
  let summary: string[] | null = null;
  if (aiEnabled && total >= MIN_FOR_AI) {
    try {
      const transcript = rows
        .map((r) => `${r.author?.name ?? "Alguien"}: ${r.body.replace(/\s+/g, " ").trim()}`)
        .join("\n")
        .slice(0, 6000);
      const client = getAnthropic();
      const msg = await client.messages.create(
        {
          model: AI_MODEL,
          max_tokens: 400,
          system:
            "Eres Marcebot, el copiloto interno de una productora audiovisual. Te paso los mensajes que " +
            "un miembro del equipo se perdió en un chat de trabajo. Resume en 2-4 viñetas MUY breves qué " +
            "se habló y, sobre todo, qué se DECIDIÓ o qué se PIDIÓ (fechas, tareas, aprobaciones, cambios). " +
            "En español, concreto y sin relleno. Devuelve SOLO las viñetas, una por línea, empezando cada " +
            "una con «• ». Si no hubo nada relevante, devuelve una sola línea: «• Conversación breve, sin decisiones.».",
          messages: [{ role: "user", content: transcript }],
        },
        { timeout: 12000 },
      );
      const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const bullets = text
        .split("\n")
        .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 4);
      if (bullets.length) summary = bullets;
    } catch (e) {
      // Degradación elegante: se devuelve el resumen estructurado sin prosa. No exponer el detalle.
      console.error("[catchup] ai error:", e);
    }
  }

  return NextResponse.json({ total, authors, mentionedYou, summary });
}
