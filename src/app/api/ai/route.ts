import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanAccessProject } from "@/lib/project-access";
import { aiEnabled, AI_MODEL, ASSISTANT_SYSTEM, getAnthropic } from "@/lib/ai";
import { PROJECT_STATUS } from "@/lib/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Msg = { role: "user" | "assistant"; content: string };

// Rate-limit por usuario en memoria (ventana deslizante). Evita abuso/gasto descontrolado
// de la API de Anthropic. Suficiente para una instancia única; si se escala a varias,
// mover a Redis.
const RL_MAX = 30; // peticiones
const RL_WINDOW_MS = 60_000; // por minuto
const rlHits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (rlHits.get(userId) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  if (recent.length >= RL_MAX) {
    rlHits.set(userId, recent);
    return true;
  }
  recent.push(now);
  rlHits.set(userId, recent);
  return false;
}

// Construye un resumen de texto del proyecto para dárselo de contexto al asistente.
async function projectContext(projectId: string): Promise<string | null> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    include: {
      client: { select: { name: true } },
      lead: { select: { name: true } },
      tasks: { select: { title: true, status: true }, orderBy: { position: "asc" } },
      deliverables: { select: { name: true, status: true } },
    },
  });
  if (!p) return null;
  const tareas = p.tasks.map((t) => `- ${t.title} [${t.status}]`).join("\n") || "(sin tareas)";
  const entregables = p.deliverables.map((d) => `- ${d.name} [${d.status}]`).join("\n") || "(sin entregables)";
  return [
    `Proyecto: ${p.code} · ${p.name}`,
    `Cliente: ${p.client.name}`,
    `Responsable: ${p.lead?.name ?? "sin asignar"}`,
    `Estado: ${PROJECT_STATUS[p.status]?.label ?? p.status} · Progreso: ${p.progress}%`,
    `Tareas:\n${tareas}`,
    `Entregables:\n${entregables}`,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });
  // El gate de la página /asistente debe valer también en la API: roles sin ver_asistente
  // (p. ej. freelancer/cliente) no pueden consumir la IA llamando directo a la ruta.
  if (!hasPermission(session, "ver_asistente")) return new NextResponse("No autorizado", { status: 403 });
  if (rateLimited(session.id)) {
    return new NextResponse("Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.", { status: 429 });
  }
  if (!aiEnabled) {
    return new NextResponse("La IA no está configurada (falta ANTHROPIC_API_KEY).", { status: 503 });
  }

  let body: { messages?: Msg[]; projectId?: string | null };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }

  const messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return new NextResponse("Falta un mensaje del usuario", { status: 400 });
  }

  let system = ASSISTANT_SYSTEM;
  if (body.projectId) {
    if (!(await userCanAccessProject(body.projectId, session))) {
      return new NextResponse("Sin acceso al proyecto", { status: 403 });
    }
    const ctx = await projectContext(body.projectId);
    if (ctx) system += `\n\nContexto del proyecto actual:\n${ctx}`;
  }

  const client = getAnthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const ai = client.messages.stream({
          model: AI_MODEL,
          max_tokens: 8192,
          thinking: { type: "adaptive" },
          system,
          messages,
        });
        for await (const event of ai) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (e) {
        // No exponer el detalle del proveedor al cliente; registrarlo en el servidor.
        console.error("[ai] stream error:", e);
        controller.enqueue(encoder.encode("\n\n[Error de IA: no se pudo completar la respuesta. Inténtalo de nuevo.]"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
