import Anthropic from "@anthropic-ai/sdk";

// Asistente IA con la API de Claude. Gateado por ANTHROPIC_API_KEY:
// sin la clave, la función de IA queda deshabilitada (igual que Authentik con su env).
export const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY);

// Modelo por defecto recomendado por la guía de la API de Claude.
export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export const ASSISTANT_SYSTEM = `Eres el asistente interno de Labstream Studio, una productora audiovisual.
Ayudas al equipo con: redactar correos y mensajes para clientes, resumir el estado de proyectos,
proponer tareas y planes de producción, ideas creativas para reels/podcasts/documentales,
y textos para cotizaciones. Responde en español, claro y conciso, con tono profesional y cercano.
Si te pasan el contexto de un proyecto, úsalo; si falta información, dilo en vez de inventarla.`;
