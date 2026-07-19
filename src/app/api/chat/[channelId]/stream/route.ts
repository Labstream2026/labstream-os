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

  // Se expone la limpieza fuera de start() para poder llamarla también desde cancel() (algunos
  // runtimes expresan la desconexión SOLO como cancel(), sin un abort limpio del signal).
  let cleanup: (() => void) | null = null;

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
        cleanup = null;
        clearInterval(tick);
        chatBus.off(event, onMessage);
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      };
      cleanup = close;
      // Si el cliente YA abortó durante los await de auth (cambiar de canal rápido en un chat activo),
      // el evento 'abort' no se re-dispara al añadir el listener → sin esto el listener del bus y el
      // setInterval (que hace un query a BD cada 20s) quedarían VIVOS PARA SIEMPRE por conexión muerta.
      if (_req.signal.aborted) { close(); return; }
      _req.signal.addEventListener("abort", close);
    },
    cancel() {
      cleanup?.();
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
