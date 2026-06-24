import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { ensureMarcebot, getOrCreateMarcebotDM, postBotFileMessage } from "@/lib/marcebot/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Webhook INVERSO de OpenClaw → Labstream. Permite que el agente de OpenClaw (el mismo que
// atiende WhatsApp) ENTREGUE imágenes/archivos al chat de la app: las guarda con preview y las
// publica como Marcebot en el DM del usuario (o en un canal concreto), en tiempo real.
//
// Autorización: secreto compartido OPENCLAW_INBOUND_TOKEN, en `?token=` o cabecera
// `x-openclaw-token`. Sin secreto configurado → endpoint cerrado (401).
//
// Payload JSON:
//   {
//     "to": "hola@labstream.co" | "<userId>",   // destinatario (DM con Marcebot). Requerido si no hay channelId.
//     "channelId": "<id>",                        // opcional: publicar en este canal en vez del DM
//     "text": "Aquí está la portada",            // texto/pie de foto (opcional)
//     "files": [                                   // uno o varios adjuntos
//       { "url": "https://…", "name": "portada.png", "mime": "image/png" }
//       // o { "base64": "iVBORw0…", "name": "img.png", "mime": "image/png" }
//     ],
//     "image": { "url"|"base64", "name", "mime" }  // atajo para un solo archivo
//   }

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB por archivo

type IncomingFile = { url?: string; base64?: string; name?: string; mime?: string | null };

function authorized(req: NextRequest, token: string): boolean {
  if (!token) return false;
  const q = req.nextUrl.searchParams.get("token");
  const h = req.headers.get("x-openclaw-token") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return q === token || h === token;
}

// Descarga (url) o decodifica (base64) un archivo a Buffer, validando tipo y tamaño.
async function resolveFile(f: IncomingFile): Promise<{ name: string; mime: string | null; buf: Buffer }> {
  let buf: Buffer;
  let mime = f.mime ?? null;
  let name = (f.name || "").trim();

  if (f.base64) {
    const raw = f.base64.replace(/^data:([^;]+);base64,/, (_m, m1) => {
      if (!mime) mime = m1;
      return "";
    });
    buf = Buffer.from(raw, "base64");
  } else if (f.url) {
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`No pude descargar el archivo (${res.status})`);
    const ab = await res.arrayBuffer();
    buf = Buffer.from(ab);
    if (!mime) mime = res.headers.get("content-type")?.split(";")[0]?.trim() || null;
    if (!name) {
      try {
        name = decodeURIComponent(new URL(f.url).pathname.split("/").pop() || "");
      } catch {
        /* url inválida para nombre: usamos fallback abajo */
      }
    }
  } else {
    throw new Error("Cada archivo necesita 'url' o 'base64'");
  }

  if (!buf.length) throw new Error("Archivo vacío");
  if (buf.length > MAX_BYTES) throw new Error("Archivo demasiado grande (máx 25 MB)");
  if (!name) {
    const ext = mime?.split("/")[1]?.split("+")[0] || "bin";
    name = `imagen.${ext}`;
  }
  return { name, mime, buf };
}

export async function POST(req: NextRequest) {
  const token = process.env.OPENCLAW_INBOUND_TOKEN || "";
  if (!token) return NextResponse.json({ ok: false, error: "Inbound deshabilitado" }, { status: 503 });
  if (!authorized(req, token)) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  let body: {
    to?: string;
    channelId?: string;
    text?: string;
    files?: IncomingFile[];
    image?: IncomingFile;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const incoming = [...(Array.isArray(body.files) ? body.files : []), ...(body.image ? [body.image] : [])];
  if (!incoming.length) return NextResponse.json({ ok: false, error: "Falta 'files' o 'image'" }, { status: 400 });

  // Resolver destino: canal explícito, o el DM con Marcebot del usuario (por email o id).
  let channelId = (body.channelId || "").trim() || null;
  let notifyUserId: string | null = null;
  if (!channelId) {
    const to = (body.to || "").trim();
    if (!to) return NextResponse.json({ ok: false, error: "Falta 'to' (email o userId) o 'channelId'" }, { status: 400 });
    const target = to.includes("@")
      ? await db.user.findUnique({ where: { email: to.toLowerCase() }, select: { id: true, name: true } })
      : await db.user.findUnique({ where: { id: to }, select: { id: true, name: true } });
    if (!target) return NextResponse.json({ ok: false, error: "Usuario no encontrado" }, { status: 404 });
    channelId = await getOrCreateMarcebotDM(target.id, target.name);
    notifyUserId = target.id;
  } else {
    const ch = await db.chatChannel.findUnique({ where: { id: channelId }, select: { id: true } });
    if (!ch) return NextResponse.json({ ok: false, error: "Canal no encontrado" }, { status: 404 });
  }

  let files: { name: string; mime: string | null; buf: Buffer }[];
  try {
    files = await Promise.all(incoming.slice(0, 10).map(resolveFile));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Archivo inválido" }, { status: 400 });
  }

  const bot = await ensureMarcebot();
  const text = (body.text || "").trim() || `📎 ${files.map((f) => f.name).join(", ")}`;
  await postBotFileMessage(bot.id, channelId, text, files);

  // Si fue a un DM, avisar al usuario (popup flotante + notificación), como en sendBotDM.
  if (notifyUserId) {
    await notify(notifyUserId, { type: "marcebot", title: "Marcebot", body: text.slice(0, 140), link: `/chat/${channelId}` }).catch(() => null);
  }

  return NextResponse.json({ ok: true, channelId, files: files.length });
}

// Salud / verificación del endpoint.
export async function GET() {
  return NextResponse.json({ ok: true, service: "openclaw-inbound", enabled: !!process.env.OPENCLAW_INBOUND_TOKEN });
}
