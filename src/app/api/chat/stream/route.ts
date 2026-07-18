import { NextResponse, type NextRequest } from "next/server";
import { chatBus, ANY_MESSAGE_EVENT, ANY_RECOUNT_EVENT, userReadEvent, type ChatMessagePayload } from "@/lib/chat-bus";
import { getSession } from "@/lib/auth";
import { getChatUnreadSummary } from "@/lib/chat-unread";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// SSE GLOBAL por USUARIO (no por canal): alimenta los badges vivos de chat en TODA la app
// (sidebar, barra móvil, rail de /chat, título de la pestaña) sin abrir un stream por canal.
// Emite:
//   event: unread  → resumen { total, rows:[{channelId,count,muted}] } (misma contabilidad
//                    que el rail, vía getChatUnreadSummary). Se recalcula con debounce tras
//                    cada mensaje relevante, lectura propia, borrado, y en cada tick.
//   event: message → aviso ligero de mensaje nuevo en un canal MÍO (para refrescar el preview
//                    y el orden del rail sin recargar). El conteo NO se infiere de esto: la
//                    verdad la trae siempre el recount (excluye míos, hilos y silenciados).
//
// SEGURIDAD (revisión adversarial): el set de canales NO es la membresía histórica — es el
// resultado de canAccessChannel canal por canal (lo trae el propio resumen), y se REVALIDA
// en cada recount y en cada tick de 25 s. Si expulsan al usuario de un proyecto, pierde la
// sección, o lo desactivan, deja de recibir previews en ≤25 s y el stream se cierra si el
// usuario ya no está activo (mismo espíritu que el `revoked` del stream por canal).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });

  const encoder = new TextEncoder();
  let close: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      // Canales cuyo bus se reenvía: SOLO los visibles hoy; se refresca con cada resumen.
      let channelSet = new Set<string>();

      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          closed = true; // stream cerrado por el cliente
        }
      };

      // Serializado: un resumen a la vez y el último gana (sin esto, dos recounts en vuelo
      // podían llegar fuera de orden y dejar el badge con el valor viejo).
      let running = false;
      let rerun = false;
      const sendUnread = async () => {
        if (closed) return;
        if (running) {
          rerun = true;
          return;
        }
        running = true;
        try {
          const summary = await getChatUnreadSummary(session);
          if (summary === null) {
            // Usuario desactivado/eliminado con el stream abierto: cortar aquí.
            send("event: revoked\ndata: {}\n\n");
            close();
            return;
          }
          channelSet = new Set(summary.accessibleIds);
          send(`event: unread\ndata: ${JSON.stringify({ total: summary.total, rows: summary.rows })}\n\n`);
        } catch {
          /* transitorio: el siguiente evento/tick lo reintenta */
        } finally {
          running = false;
          if (rerun && !closed) {
            rerun = false;
            void sendUnread();
          }
        }
      };

      // Debounce del recuento: una ráfaga de mensajes = un solo recount (~1 s después).
      let recountTimer: ReturnType<typeof setTimeout> | null = null;
      const scheduleRecount = () => {
        if (closed) return;
        if (recountTimer) clearTimeout(recountTimer);
        recountTimer = setTimeout(() => {
          recountTimer = null;
          void sendUnread();
        }, 1000);
      };

      const onMessage = (msg: ChatMessagePayload) => {
        if (closed || !channelSet.has(msg.channelId)) return;
        // Aviso ligero para el preview del rail (autor + texto + hora); el badge llega
        // por el recount. Sin adjuntos ni encuesta: el rail solo muestra una línea.
        send(
          `event: message\ndata: ${JSON.stringify({
            channelId: msg.channelId,
            parentId: msg.parentId,
            body: msg.body.slice(0, 160),
            author: msg.author?.name ?? null,
            createdAt: msg.createdAt,
          })}\n\n`,
        );
        scheduleRecount();
      };
      const onRecount = (evt: { channelId: string }) => {
        if (!closed && channelSet.has(evt.channelId)) scheduleRecount();
      };
      const onRead = () => scheduleRecount();

      chatBus.on(ANY_MESSAGE_EVENT, onMessage);
      chatBus.on(ANY_RECOUNT_EVENT, onRecount);
      chatBus.on(userReadEvent(session.id), onRead);

      send(": connected\n\n");
      void sendUnread();

      // Mantiene viva la conexión a través del reverse proxy del NAS (ping bajo su
      // proxy_read_timeout típico de 60 s) Y revalida acceso/actividad del usuario:
      // el recount del tick reconstruye el set con canAccessChannel y corta si el
      // usuario fue desactivado. Un canal nuevo (me añadieron a un proyecto) también
      // entra al set por esta vía en ≤25 s.
      const tick = setInterval(() => {
        send(": ping\n\n");
        scheduleRecount();
      }, 25000);

      close = () => {
        closed = true;
        clearInterval(tick);
        if (recountTimer) clearTimeout(recountTimer);
        chatBus.off(ANY_MESSAGE_EVENT, onMessage);
        chatBus.off(ANY_RECOUNT_EVENT, onRecount);
        chatBus.off(userReadEvent(session.id), onRead);
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      };
      req.signal.addEventListener("abort", close);
      // El abort pudo llegar ANTES de registrar el listener (cerrar la pestaña durante el
      // getSession/primer query): un signal ya abortado no re-dispara el evento, y sin esto
      // los listeners del bus y el interval quedaban vivos para siempre.
      if (req.signal.aborted) close();
    },
    // Respaldo del runtime: si el consumidor desaparece sin abort limpio, cancel() limpia igual.
    cancel() {
      close();
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
