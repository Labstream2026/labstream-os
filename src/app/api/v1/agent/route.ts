import { type NextRequest } from "next/server";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { runAgent } from "@/lib/openclaw/agent";
import { executeAgentTool, toolsForApi } from "@/lib/openclaw/tools";
import { isRateLimitError, type ChatTurn } from "@/lib/openclaw/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/agent — PIEZA CENTRAL de la API intermedia.
// Un servicio externo (gateway de OpenClaw, n8n, un GPT…) le "pregunta a la IA de Labstream".
// Reusa EXACTAMENTE el mismo runAgent + executeAgentTool que Marcebot en chat y WhatsApp, con la
// sesión EFECTIVA de la AppKey (permisos ya intersecados con sus scopes). Cada herramienta valida
// hasPermission internamente → la respuesta nunca filtra datos fuera de los permisos del titular.
//
// Cuerpo: { message: string }  ó  { messages: [{role, content}] }  (historial; se toma el último
// turno como pregunta). En keys read-only, las herramientas de escritura se ocultan al modelo.

function systemPrompt(name: string, role: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `Eres Marcebot, el asistente de Labstream OS, respondiendo a una integración externa (API) en nombre de ${name}.`,
    `Actúas SIEMPRE con los permisos de esta persona (rol: ${role}). Si una herramienta te niega algo por falta de permiso, NO lo rodees ni inventes: di claramente que no tiene acceso a ese tema.`,
    `Responde en español, claro y conciso. Hoy es ${today}.`,
  ].join(" ");
}

type InMessage = { role?: unknown; content?: unknown };

export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  let body: { message?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiJson({ ok: false, error: "Cuerpo JSON inválido." }, 400);
  }

  const message = typeof body.message === "string" ? clampText(body.message.trim()) : "";
  // Historial acotado: máximo 20 turnos y cada contenido recortado (defensa de coste hacia el LLM).
  const history = Array.isArray(body.messages) ? (body.messages as InMessage[]) : null;
  if (!message && !history) {
    return apiJson({ ok: false, error: "Falta 'message' (string) o 'messages' (array de {role, content})." }, 400);
  }

  const turns: ChatTurn[] = [{ role: "system", content: systemPrompt(ctx.session.name, ctx.session.role) }];
  if (history) {
    for (const m of history.slice(-20)) {
      if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()) {
        turns.push({ role: m.role, content: clampText(m.content) });
      }
    }
  }
  if (message) turns.push({ role: "user", content: message });
  if (turns.length === 1) return apiJson({ ok: false, error: "No hay ningún mensaje de usuario que responder." }, 400);

  // Herramientas según el modo de la key (read-only oculta las de escritura; siempre sin las de canal).
  const tools = toolsForApi(ctx.readOnly);
  // ctx undefined: la API no tiene un chat donde entregar; las tools de canal ya están excluidas.
  const r = await runAgent(turns, tools, (name, args) => executeAgentTool(name, args, ctx.session, undefined));
  if (!r.ok) {
    // Límite de uso del modelo (cuota de Codex agotada): NO es que el agente esté caído. Se devuelve
    // 503 + code estable para que el integrador sepa que es TEMPORAL y reintente, no un 502 confuso.
    if (isRateLimitError(r.error)) {
      return apiJson({ ok: false, error: "El asistente alcanzó el límite de uso del modelo. Reintenta en unos minutos.", code: "MODEL_RATE_LIMITED", retryable: true, detail: r.error }, 503);
    }
    return apiJson({ ok: false, error: r.error, code: "UPSTREAM_OPENCLAW" }, 502);
  }
  return apiJson({ ok: true, reply: r.reply, steps: r.steps, readOnly: ctx.readOnly });
});
