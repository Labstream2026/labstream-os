import { NextResponse, type NextRequest } from "next/server";
import { chatBus, channelEvent, type ChatMessagePayload } from "@/lib/chat-bus";
import { getSession } from "@/lib/auth";
import { userCanAccessChannel } from "@/lib/chat-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// SSE: emite los mensajes nuevos del canal en tiempo real.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await ctx.params;

  // Solo quien puede ver el canal recibe su stream (los canales privados no se filtran).
  const session = await getSession();
  if (!(await userCanAccessChannel(channelId, session))) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const event = channelEvent(channelId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          /* stream cerrado */
        }
      };

      send(": connected\n\n");

      const onMessage = (msg: ChatMessagePayload) => {
        send(`data: ${JSON.stringify(msg)}\n\n`);
      };
      chatBus.on(event, onMessage);

      // Mantiene viva la conexión Y revalida el acceso periódicamente: en el connect solo se
      // valida una vez, así que si al usuario lo expulsan del canal o cambia la visibilidad,
      // aquí se detecta y se CIERRA el stream (acota la exposición a la ventana del tick).
      const tick = setInterval(async () => {
        send(": ping\n\n");
        try {
          if (!(await userCanAccessChannel(channelId, session))) {
            send("event: revoked\ndata: {}\n\n");
            clearInterval(tick);
            chatBus.off(event, onMessage);
            try {
              controller.close();
            } catch {
              /* ya cerrado */
            }
          }
        } catch {
          /* error transitorio de revalidación: no cerramos por eso */
        }
      }, 20000);

      const close = () => {
        clearInterval(tick);
        chatBus.off(event, onMessage);
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      };
      _req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
