import { getOpenClawConfig } from "./config";

// Mensajes en formato OpenAI. La unión cubre los turnos de herramienta (function-calling):
// assistant puede traer tool_calls; los resultados se reinyectan como role:"tool".
// El contenido puede ser texto plano o multimodal (texto + imágenes) en el formato de
// visión de OpenAI: así las fotos que adjunta el usuario llegan al modelo elegido en
// OpenClaw (debe ser uno con visión, p. ej. GPT-5.5).
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
export type ChatTurn = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type AgentMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type AskResult = { ok: true; reply: string } | { ok: false; error: string };
export type ChatRaw = { ok: true; content: string | null; toolCalls: ToolCall[] } | { ok: false; error: string };

type Choice = { message?: { content?: string | null; tool_calls?: ToolCall[] } };

// Una llamada lenta (gpt-5.5 razonando, consulta pesada) puede tardar, pero un solo intento NO
// debe colgar minutos: cada intento se acota a PER_ATTEMPT_MS y el bucle de agent.ts impone el
// tope GLOBAL. `timeoutMs` (cuando se pasa) es el PRESUPUESTO total de la llamada (incl. reintentos).
export const DEFAULT_TIMEOUT_MS = 90_000; // presupuesto por defecto de una llamada directa
const PER_ATTEMPT_MS = 75_000; // tope de un intento individual (antes: 4 min colgado)
const MAX_RETRIES = 2; // hasta 3 intentos, SOLO en fallos transitorios (red, 502/503/504)
const BACKOFF_MS = [500, 1_500];

// POST de bajo nivel al endpoint compatible con OpenAI del gateway. Devuelve el primer choice.
// Best-effort: nunca lanza. Reintenta SOLO en fallos transitorios que fallan rápido (gateway
// reiniciándose → ECONNREFUSED, o 502/503/504); NUNCA en timeout (ya esperó) ni en 4xx (config).
async function post(body: Record<string, unknown>, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<{ ok: true; choice: Choice } | { ok: false; error: string }> {
  const cfg = await getOpenClawConfig();
  if (!cfg) return { ok: false, error: "La integración con OpenClaw no está configurada o está desactivada." };

  const overallDeadline = Date.now() + Math.max(5_000, timeoutMs);
  let lastError = "No se pudo contactar al agente.";

  for (let attempt = 0; ; attempt++) {
    const remaining = overallDeadline - Date.now();
    if (remaining < 1_000) return { ok: false, error: lastError };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(remaining, PER_ATTEMPT_MS));
    let retry = false;
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
        lastError = `OpenClaw ${res.status}: ${detail || res.statusText}`;
        // 502/503/504 = gateway reiniciándose/saturado → reintentable; 4xx u otros → no.
        if (res.status === 502 || res.status === 503 || res.status === 504) retry = true;
        else return { ok: false, error: lastError };
      } else {
        const data = (await res.json().catch(() => null)) as { choices?: Choice[] } | null;
        const choice = data?.choices?.[0];
        if (!choice) return { ok: false, error: "Respuesta vacía del agente." };
        return { ok: true, choice };
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        // Timeout de ESTE intento: ya esperó su parte; no reintentar.
        return { ok: false, error: "El agente tardó demasiado y se canceló." };
      }
      // Error de red (ECONNREFUSED en un reinicio del gateway, DNS, socket caído) → reintentable.
      lastError = e instanceof Error ? `No se pudo contactar al agente: ${e.message}` : "Error desconocido al contactar al agente.";
      retry = true;
    } finally {
      clearTimeout(timer);
    }

    if (!retry || attempt >= MAX_RETRIES) return { ok: false, error: lastError };
    // Backoff antes de reintentar, sin pasarnos del presupuesto restante.
    const wait = Math.min(BACKOFF_MS[attempt] ?? 1_500, overallDeadline - Date.now() - 1_000);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
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

// Reconoce errores de LÍMITE DE USO/CUOTA del modelo (p. ej. "You've reached your Codex
// subscription usage limit", 429, rate_limit). NO es un fallo transitorio recuperable con retry:
// la cuota se repone tras una ventana. Sirve para degradar con un mensaje CLARO ("reintenta en
// unos minutos") en vez de un 502 genérico que parece que el agente se cayó.
export function isRateLimitError(msg: string | null | undefined): boolean {
  if (!msg) return false;
  return /usage limit|rate.?limit|too many requests|\b429\b|subscription usage|reached your|\bquota\b/i.test(msg);
}
