import { NextResponse, type NextRequest, after } from "next/server";
import { getWhatsappConfig } from "@/lib/whatsapp/config";
import { processWhatsappInbound, type InboundMessage } from "@/lib/whatsapp/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Webhook entrante de Evolution API. Autorización: secreto compartido WHATSAPP_WEBHOOK_TOKEN,
// enviado como `?token=` en la URL del webhook o cabecera `x-webhook-token`. Responde 200 rápido
// y procesa en segundo plano (after) para no hacer esperar a Evolution.

function authorized(req: NextRequest, token: string): boolean {
  if (!token) return false; // sin secreto configurado → cerrado
  const q = req.nextUrl.searchParams.get("token");
  const h = req.headers.get("x-webhook-token") || req.headers.get("apikey");
  return q === token || h === token;
}

// Evolution puede mandar `data` como objeto único o como lista (data.messages). Normalizamos.
function extractMessages(body: unknown): InboundMessage[] {
  const b = body as { data?: unknown } | null;
  const raw = b?.data;
  const items: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { messages?: unknown[] }).messages)
      ? (raw as { messages: unknown[] }).messages
      : raw
        ? [raw]
        : [];
  const out: InboundMessage[] = [];
  for (const it of items) {
    const d = it as {
      key?: { id?: string; remoteJid?: string; fromMe?: boolean };
      message?: { conversation?: string; extendedTextMessage?: { text?: string }; audioMessage?: unknown };
    };
    const key = d?.key;
    if (!key?.id || !key.remoteJid || key.fromMe) continue; // ignora salientes y sin id
    // No procesar grupos (remoteJid de grupo termina en @g.us): canal privado 1:1.
    if (key.remoteJid.endsWith("@g.us")) continue;
    const text = d.message?.conversation || d.message?.extendedTextMessage?.text || "";
    const hasAudio = !!d.message?.audioMessage;
    if (!text && !hasAudio) continue; // tipos no soportados (imagen/sticker/…): se omiten
    out.push({ waMessageId: key.id, phone: key.remoteJid, text: text || null, mediaData: hasAudio ? it : undefined });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const cfg = getWhatsappConfig();
  // Siempre 200 para que Evolution no reintente en bucle; si no está configurado, no hacemos nada.
  if (!cfg) return NextResponse.json({ ok: true });
  if (!authorized(req, cfg.webhookToken)) return NextResponse.json({ ok: false }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const event = (body as { event?: string })?.event ?? "";
  // Solo nos interesan mensajes nuevos.
  if (event && !/messages\.upsert|messages\.update|send\.message/i.test(event)) return NextResponse.json({ ok: true });

  const messages = extractMessages(body);
  for (const m of messages) {
    after(() => processWhatsappInbound(m));
  }
  return NextResponse.json({ ok: true, received: messages.length });
}

// Salud / verificación simple del endpoint.
export async function GET() {
  return NextResponse.json({ ok: true, service: "whatsapp-webhook" });
}
