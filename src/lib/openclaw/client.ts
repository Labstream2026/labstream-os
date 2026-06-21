import { getOpenClawConfig } from "./config";

// Mensajes en formato OpenAI. La unión cubre los turnos de herramienta (function-calling):
// assistant puede traer tool_calls; los resultados se reinyectan como role:"tool".
export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type AgentMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type AskResult = { ok: true; reply: string } | { ok: false; error: string };
export type ChatRaw = { ok: true; content: string | null; toolCalls: ToolCall[] } | { ok: false; error: string };

type Choice = { message?: { content?: string | null; tool_calls?: ToolCall[] } };

// Análisis pesados (consultar varios proyectos, crear varias tareas) pueden tardar; damos un
// margen amplio. El bucle de herramientas (agent.ts) impone además un tope GLOBAL de 4 min.
export const DEFAULT_TIMEOUT_MS = 240_000; // 4 minutos

// POST de bajo nivel al endpoint compatible con OpenAI del gateway. Devuelve el primer choice.
// Best-effort: nunca lanza. `timeoutMs` permite acotar por el presupuesto de tiempo que quede.
async function post(body: Record<string, unknown>, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<{ ok: true; choice: Choice } | { ok: false; error: string }> {
  const cfg = await getOpenClawConfig();
  if (!cfg) return { ok: false, error: "La integración con OpenClaw no está configurada o está desactivada." };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(5_000, timeoutMs));
  try {
    const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      },
      body: JSON.stringify({ model: cfg.agentModel, stream: false, ...body }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, error: `OpenClaw ${res.status}: ${detail || res.statusText}` };
    }
    const data = (await res.json().catch(() => null)) as { choices?: Choice[] } | null;
    const choice = data?.choices?.[0];
    if (!choice) return { ok: false, error: "Respuesta vacía del agente." };
    return { ok: true, choice };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: "El agente tardó demasiado y se canceló." };
    }
    return {
      ok: false,
      error: e instanceof Error ? `No se pudo contactar al agente: ${e.message}` : "Error desconocido al contactar al agente.",
    };
  } finally {
    clearTimeout(timer);
  }
}

// Respuesta simple de texto (sin herramientas). La usa el modo conversación y el "Probar".
export async function askOpenClaw(messages: ChatTurn[], timeoutMs?: number): Promise<AskResult> {
  const r = await post({ messages }, timeoutMs);
  if (!r.ok) return r;
  const reply = r.choice.message?.content?.trim();
  if (!reply) return { ok: false, error: "El agente respondió vacío." };
  return { ok: true, reply };
}

// Una vuelta CON herramientas: devuelve el texto y/o las tool_calls que pidió el agente.
export async function chatWithTools(messages: AgentMessage[], tools: ToolDef[], timeoutMs?: number): Promise<ChatRaw> {
  const r = await post(tools.length ? { messages, tools, tool_choice: "auto" } : { messages }, timeoutMs);
  if (!r.ok) return r;
  const msg = r.choice.message;
  return { ok: true, content: msg?.content ?? null, toolCalls: msg?.tool_calls ?? [] };
}
