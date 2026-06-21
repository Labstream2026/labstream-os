import { askOpenClaw, type ChatTurn, type ToolDef } from "./client";

// Ejecuta una acción pedida por el agente y devuelve su resultado como texto (normalmente JSON).
// Aplica los permisos del usuario en cuyo nombre actúa (se inyecta al construir el executor).
export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

export type AgentResult = { ok: true; reply: string; steps: number } | { ok: false; error: string };

const MAX_STEPS = 6;
const OVERALL_DEADLINE_MS = 240_000; // 4 min para TODA la interacción

// NOTA: el endpoint de OpenClaw NO inyecta al agente las "tools" del cliente (probado: ni con
// tool_choice=required las usa). Por eso NO usamos function-calling nativo; en su lugar el agente
// decide en JSON qué acción ejecutar y la app la ejecuta. Esto funciona con texto plano y no
// depende de la configuración de OpenClaw.

type Decision = { action: string; args?: Record<string, unknown>; text?: string };

// Descripción legible de las acciones (a partir de los esquemas) para metérsela al prompt.
function actionsDoc(tools: ToolDef[]): string {
  return tools
    .map((t) => {
      const props = (t.function.parameters?.properties ?? {}) as Record<string, { description?: string }>;
      const args = Object.entries(props)
        .map(([k, v]) => (v?.description ? `${k} (${v.description})` : k))
        .join(", ");
      return `- ${t.function.name}: ${t.function.description}${args ? ` · args: ${args}` : ""}`;
    })
    .join("\n");
}

function protocol(doc: string): string {
  return [
    "ACCIONES disponibles para consultar o modificar datos de la app Labstream (úsalas SIEMPRE para datos de la app; NO uses tu propio almacenamiento, memoria ni archivos para esto):",
    doc,
    "",
    "PROTOCOLO OBLIGATORIO — responde SIEMPRE con UN SOLO objeto JSON, sin texto adicional ni ```:",
    '· Para ejecutar una acción: {"action":"<nombre>","args":{...}}',
    '· Para responder al usuario (cuando ya tienes lo necesario, o la petición no requiere datos de la app): {"action":"answer","text":"tu respuesta en español"}',
    "Una sola acción por turno. Tras cada acción te paso su resultado y decides el siguiente paso. Encadena acciones si hace falta (p. ej. crear cliente → crear proyecto → crear tarea).",
  ].join("\n");
}

// Extrae la decisión JSON del texto del agente (tolera fences ```json y algo de prosa alrededor).
function parseDecision(text: string): Decision | null {
  if (!text) return null;
  const candidates: string[] = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1]);
  const brace = text.match(/\{[\s\S]*\}/); // del primer { al último }
  if (brace) candidates.push(brace[0]);
  candidates.push(text.trim());
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c) as Decision;
      if (obj && typeof obj.action === "string") return obj;
    } catch {
      /* probar el siguiente candidato */
    }
  }
  return null;
}

// Si el agente devolvió JSON de "answer", saca el texto; si devolvió prosa, límpiala de fences.
function asReply(text: string): string {
  const d = parseDecision(text);
  if (d?.action === "answer" && typeof d.text === "string" && d.text.trim()) return d.text.trim();
  return text.replace(/```[\s\S]*?```/g, "").trim() || text.trim();
}

// Bucle de decisiones: el agente elige una acción en JSON, la app la ejecuta y reinyecta el
// resultado; repite hasta un {"action":"answer",...} o hasta agotar pasos/tiempo. Best-effort.
export async function runAgent(messages: ChatTurn[], tools: ToolDef[], execute: ToolExecutor): Promise<AgentResult> {
  const deadline = Date.now() + OVERALL_DEADLINE_MS;
  const convo: ChatTurn[] = [...messages, { role: "system", content: protocol(actionsDoc(tools)) }];
  let lastText = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const remaining = deadline - Date.now();
    if (remaining < 3_000) break;
    const r = await askOpenClaw(convo, remaining);
    if (!r.ok) return r;
    lastText = r.reply;

    const decision = parseDecision(r.reply);
    if (!decision || decision.action === "answer") {
      return { ok: true, reply: decision?.action === "answer" ? decision.text?.trim() || asReply(r.reply) : asReply(r.reply), steps: step };
    }

    let result: string;
    try {
      result = await execute(decision.action, decision.args ?? {});
    } catch (e) {
      result = `Error ejecutando ${decision.action}: ${e instanceof Error ? e.message : "desconocido"}`;
    }
    convo.push({ role: "assistant", content: r.reply });
    convo.push({
      role: "user",
      content: `Resultado de ${decision.action}: ${result.slice(0, 4000)}\n\nSiguiente paso: otra acción JSON, o {"action":"answer","text":"…"} si ya puedes responder al usuario.`,
    });
  }

  // Cierre: pedir la respuesta final en texto si se agotaron pasos/tiempo.
  const fin = await askOpenClaw(
    [...convo, { role: "user", content: 'Responde ya al usuario en español con lo que tengas. Devuelve {"action":"answer","text":"…"}.' }],
    Math.max(10_000, deadline - Date.now()),
  );
  if (fin.ok) return { ok: true, reply: asReply(fin.reply), steps: MAX_STEPS };
  return { ok: true, reply: asReply(lastText) || "No pude completar la solicitud.", steps: MAX_STEPS };
}
