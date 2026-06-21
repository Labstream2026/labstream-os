import { getOpenClawConfig } from "./config";

export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };
export type AskResult = { ok: true; reply: string } | { ok: false; error: string };

// gpt-5.5 con "thinking" puede tardar; damos margen amplio (el chat responde en 2.º plano).
const TIMEOUT_MS = 90_000;

// Llama al endpoint compatible con OpenAI del gateway OpenClaw y devuelve el texto de la
// respuesta del agente. Usa la config (baseUrl + token cifrado) guardada en BD. Best-effort:
// nunca lanza, siempre devuelve un AskResult.
export async function askOpenClaw(messages: ChatTurn[]): Promise<AskResult> {
  const cfg = await getOpenClawConfig();
  if (!cfg) return { ok: false, error: "La integración con OpenClaw no está configurada o está desactivada." };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      },
      body: JSON.stringify({ model: cfg.agentModel, messages, stream: false }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, error: `OpenClaw ${res.status}: ${detail || res.statusText}` };
    }
    const data = (await res.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[] }
      | null;
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return { ok: false, error: "El agente respondió vacío." };
    return { ok: true, reply };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: `El agente no respondió en ${Math.round(TIMEOUT_MS / 1000)}s.` };
    }
    return {
      ok: false,
      error: e instanceof Error ? `No se pudo contactar al agente: ${e.message}` : "Error desconocido al contactar al agente.",
    };
  } finally {
    clearTimeout(timer);
  }
}
