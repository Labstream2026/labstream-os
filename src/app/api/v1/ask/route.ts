import { type NextRequest } from "next/server";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { askOpenClaw, isRateLimitError, type ChatTurn } from "@/lib/openclaw/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/ask — proxy PURO al LLM de OpenClaw, SIN herramientas ni datos de Labstream.
// Útil para redacción/clasificación genérica o para depurar la conexión con OpenClaw. No accede a
// proyectos/tareas/finanzas: no hay permisos de dominio que aplicar (solo una key válida).
// Cuerpo: { message: string, system?: string }
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  // Mismo candado que /api/v1/agent y la app: sin ver_asistente no se usa el LLM por la API.
  if (!hasPermission(ctx.session, "ver_asistente")) return apiJson({ ok: false, error: "Sin permiso para el Asistente IA (ver_asistente)." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  let body: { message?: unknown; system?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiJson({ ok: false, error: "Cuerpo JSON inválido." }, 400);
  }
  const message = typeof body.message === "string" ? clampText(body.message.trim()) : "";
  if (!message) return apiJson({ ok: false, error: "Falta 'message' (string)." }, 400);
  const system = typeof body.system === "string" && body.system.trim() ? clampText(body.system.trim()) : "Eres un asistente útil. Responde en español, claro y conciso.";

  const turns: ChatTurn[] = [
    { role: "system", content: system },
    { role: "user", content: message },
  ];
  const r = await askOpenClaw(turns);
  if (!r.ok) {
    if (isRateLimitError(r.error)) {
      return apiJson({ ok: false, error: "El asistente alcanzó el límite de uso del modelo. Reintenta en unos minutos.", code: "MODEL_RATE_LIMITED", retryable: true, detail: r.error }, 503);
    }
    return apiJson({ ok: false, error: r.error, code: "UPSTREAM_OPENCLAW" }, 502);
  }
  return apiJson({ ok: true, reply: r.reply });
});
