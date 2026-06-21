import { chatWithTools, type AgentMessage, type ToolDef } from "./client";

// Ejecuta una herramienta pedida por el agente y devuelve su resultado como texto (normalmente
// JSON). Recibe el nombre y los argumentos ya parseados. Debe aplicar los permisos del usuario
// en cuyo nombre actúa el agente (se inyecta al construir el executor, no aquí).
export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

export type AgentResult = { ok: true; reply: string; steps: number } | { ok: false; error: string };

// Tope de vueltas para no quedar en bucle infinito de herramientas.
const MAX_STEPS = 6;

// Bucle de function-calling: manda contexto + herramientas al agente; si pide tool_calls, las
// ejecuta y reinyecta los resultados (role:"tool"); repite hasta una respuesta final de texto.
// Best-effort: nunca lanza; cualquier error de una herramienta se le devuelve al agente como texto.
export async function runAgent(messages: AgentMessage[], tools: ToolDef[], execute: ToolExecutor): Promise<AgentResult> {
  const convo: AgentMessage[] = [...messages];

  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await chatWithTools(convo, tools);
    if (!r.ok) return r;

    if (!r.toolCalls.length) {
      const reply = (r.content ?? "").trim();
      return reply ? { ok: true, reply, steps: step } : { ok: false, error: "El agente respondió vacío." };
    }

    // Registrar la decisión del agente (assistant con tool_calls) antes de sus resultados.
    convo.push({ role: "assistant", content: r.content, tool_calls: r.toolCalls });
    for (const call of r.toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
      } catch {
        /* argumentos no-JSON: se ejecuta con {} y la herramienta validará */
      }
      let result: string;
      try {
        result = await execute(call.function.name, args);
      } catch (e) {
        result = `Error ejecutando ${call.function.name}: ${e instanceof Error ? e.message : "desconocido"}`;
      }
      convo.push({ role: "tool", content: result.slice(0, 6000), tool_call_id: call.id });
    }
  }

  // Se agotaron los pasos: pedir el cierre sin más herramientas.
  const fin = await chatWithTools(
    [...convo, { role: "user", content: "Cierra y responde ya con lo que tengas, sin usar más herramientas." }],
    [],
  );
  if (fin.ok && fin.content?.trim()) return { ok: true, reply: fin.content.trim(), steps: MAX_STEPS };
  return { ok: false, error: "El agente no llegó a una respuesta final tras varias vueltas." };
}
