import { after, NextResponse, type NextRequest } from "next/server";
import { resolveApiKey } from "@/lib/api-key-auth";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { toolsForApi, executeAgentTool } from "@/lib/openclaw/tools";

// ── Servidor MCP embebido (Model Context Protocol) ──
// Puerta de entrada oficial para AGENTES de IA (ChatGPT, Claude, Gemini, OpenClaw…). NO duplica
// lógica: es una capa delgada de PROTOCOLO sobre lo que ya existe —
//   · autenticación y permisos: `resolveApiKey` (llave lsk_ → sesión con permisos ∩ scopes; al
//     admin le quita el bypass, así una llave NUNCA ve más que su titular).
//   · catálogo de herramientas: `toolsForApi(readOnly)` (mismas ~35 herramientas del bucle
//     agéntico; sin escrituras si la llave es de solo lectura; sin herramientas de canal).
//   · ejecución: `executeAgentTool(name, args, session)` (valida el permiso DENTRO de cada
//     herramienta y devuelve texto).
// El agente DESCUBRE las herramientas por MCP (tools/list) y las llama (tools/call): no necesita
// recordar endpoints ni tokens en el prompt. Labstream OS sigue siendo la única fuente de verdad.
//
// Transporte: "Streamable HTTP" del MCP en modo SIN ESTADO (stateless) — cada POST es un intercambio
// JSON-RPC 2.0 completo. Sin dependencias nuevas (implementación directa del protocolo).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Versiones del protocolo MCP que entendemos (más nueva primero). Al `initialize`, si el cliente
// pide una que soportamos, se la devolvemos; si no, respondemos con la más nueva nuestra.
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];
const SERVER_INFO = { name: "labstream-os", version: "1.0.0", title: "Labstream OS" };

// ── Nombres de herramienta en ESPAÑOL (superficie de negocio) ──
// El agente ve nombres en español (buscar_proyecto, crear_tarea…) sobre las mismas herramientas
// internas. En tools/call se aceptan AMBOS (el alias español o el nombre original) por robustez.
const ALIAS_TO_TOOL: Record<string, string> = {
  buscar_proyectos: "find_projects",
  consultar_proyecto: "get_project",
  consultar_tareas: "list_tasks",
  consultar_pendientes: "list_tasks",
  buscar_personas: "find_users",
  enviar_mensaje: "send_message",
  crear_tarea: "create_task",
  crear_tarea_recurrente: "create_recurring_task",
  consultar_tareas_recurrentes: "list_recurring_tasks",
  crear_nota: "create_note",
  consultar_notas: "list_notes",
  actualizar_nota: "update_note",
  buscar_clientes: "find_clients",
  crear_cliente: "create_client",
  crear_proyecto: "create_project",
  consultar_cotizaciones: "list_quotes",
  consultar_facturas: "list_invoices",
  consultar_agenda: "list_events",
  consultar_reuniones: "list_events",
  crear_evento: "create_calendar_event",
  buscar_documentos: "find_files",
  leer_documento: "read_file",
  generar_video: "generar_video",
  buscar_wiki: "find_wiki_pages",
  consultar_wiki: "get_wiki_page",
  consultar_credenciales: "list_credentials",
  consultar_tabla_wiki: "get_wiki_table",
  consultar_tablas: "list_tables",
  leer_tabla: "read_table",
  actualizar_tarea: "update_task",
  actualizar_proyecto: "update_project",
  actualizar_cliente: "update_client",
  actualizar_estado_cotizacion: "update_quote_status",
  actualizar_estado_factura: "update_invoice_status",
  actualizar_evento: "update_calendar_event",
  consultar_entregables: "list_deliverables",
};
// Inverso: nombre interno → alias principal en español (para MOSTRAR en tools/list). Se toma el
// primer alias declarado para cada herramienta.
const TOOL_TO_ALIAS: Record<string, string> = {};
for (const [es, en] of Object.entries(ALIAS_TO_TOOL)) if (!(en in TOOL_TO_ALIAS)) TOOL_TO_ALIAS[en] = es;

// Herramienta COMPUESTA del MCP (solo lectura): junta pendientes + agenda del día.
const RESUMEN_HOY_TOOL = {
  name: "resumen_hoy",
  description:
    "Resumen del día: tus tareas pendientes/vencidas y la agenda próxima. Úsalo para «¿qué tengo hoy?», «¿qué hizo el equipo?» o el digest matinal. No requiere argumentos.",
  inputSchema: { type: "object", properties: {} },
};

type RpcId = string | number | null;
type RpcMessage = { jsonrpc?: string; id?: RpcId; method?: string; params?: Record<string, unknown> };

function rpcResult(id: RpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}
function rpcError(id: RpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}
function json(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Despacha un único mensaje JSON-RPC. Devuelve la respuesta, o null si era una NOTIFICACIÓN
// (sin `id` → el protocolo no espera respuesta).
async function handleRpc(
  msg: RpcMessage,
  session: import("@/lib/session").SessionUser,
  readOnly: boolean,
): Promise<object | null> {
  const id: RpcId = msg?.id ?? null;
  const isNotification = msg?.id === undefined || msg?.id === null;
  const method = msg?.method;
  const params = msg?.params ?? {};

  try {
    switch (method) {
      case "initialize": {
        const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : LATEST_PROTOCOL_VERSION;
        return rpcResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "Herramientas de Labstream OS. Descúbrelas con tools/list y llámalas con tools/call. " +
            "Los permisos son los del titular de la credencial; si una herramienta responde «No tienes permiso…», respétalo. " +
            "Resuelve nombres a id con find_projects / find_clients / find_users antes de crear o editar.",
        });
      }
      // Notificaciones del cliente (initialized, cancelled, …): sin respuesta.
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        return rpcResult(id, {});
      case "tools/list": {
        const base = toolsForApi(readOnly).map((t) => ({
          name: TOOL_TO_ALIAS[t.function.name] ?? t.function.name, // nombre en español si lo tiene
          description: t.function.description,
          inputSchema: t.function.parameters ?? { type: "object", properties: {} },
        }));
        // El compuesto resumen_hoy va primero (es la acción más pedida).
        return rpcResult(id, { tools: [RESUMEN_HOY_TOOL, ...base] });
      }
      case "tools/call": {
        const raw = typeof params.name === "string" ? params.name : "";
        const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
        // Compuesto del MCP: pendientes + agenda (solo lectura).
        if (raw === "resumen_hoy") {
          const [tareas, agenda] = await Promise.all([
            executeAgentTool("list_tasks", { assignee: "yo", scope: "open" }, session),
            executeAgentTool("list_events", { withinDays: 2 }, session),
          ]);
          return rpcResult(id, { content: [{ type: "text", text: `PENDIENTES:\n${tareas}\n\nAGENDA (próximos días):\n${agenda}` }], isError: false });
        }
        // Acepta el alias español o el nombre interno; luego valida contra el subconjunto permitido.
        const name = ALIAS_TO_TOOL[raw] ?? raw;
        const allowed = toolsForApi(readOnly).some((t) => t.function.name === name);
        if (!allowed) return rpcError(id, -32602, `Herramienta no disponible para esta credencial: ${raw || "(vacío)"}`);
        const text = await executeAgentTool(name, args, session);
        // Convención MCP: los fallos de una herramienta van como resultado con isError=true (para
        // que el modelo LEA el error), no como error de protocolo.
        return rpcResult(id, { content: [{ type: "text", text }], isError: false });
      }
      default:
        if (isNotification) return null; // notificación desconocida → se ignora
        return rpcError(id, -32601, `Método no soportado: ${method ?? "(vacío)"}`);
    }
  } catch (e) {
    if (isNotification) return null;
    const message = e instanceof Error ? e.message : "Error interno";
    // tools/call: error dentro del resultado; el resto: error de protocolo.
    if (method === "tools/call") return rpcResult(id, { content: [{ type: "text", text: `Error: ${message}` }], isError: true });
    return rpcError(id, -32603, message);
  }
}

export async function POST(req: NextRequest) {
  // Autenticación: la MISMA llave lsk_ de la API v1 (Authorization: Bearer …).
  const auth = await resolveApiKey(req);
  if (!auth.ok) {
    return new NextResponse(JSON.stringify(rpcError(null, -32001, auth.error)), {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "WWW-Authenticate": 'Bearer realm="labstream-os-mcp"' },
    });
  }
  const { session, key, readOnly } = auth.ctx;

  // Rate-limit y registro de uso, igual que withApiKey (soporta múltiples agentes).
  if (!rateLimit(`mcp:${key.prefixVisible}`, key.rateLimitPerMin, 60_000)) {
    return json(rpcError(null, -32000, "Límite de peticiones excedido."), 429);
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;
  after(async () => {
    await db.appKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date(), lastUsedIp: ip } }).catch(() => {});
  });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"));
  }

  // Un mensaje suelto o un lote (array) de mensajes JSON-RPC.
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as RpcMessage[];
  const responses: object[] = [];
  for (const msg of messages) {
    const res = await handleRpc(msg, session, readOnly);
    if (res) responses.push(res);
  }
  // Solo había notificaciones → 202 sin cuerpo (lo que espera el protocolo).
  if (responses.length === 0) return new NextResponse(null, { status: 202 });
  return json(batch ? responses : responses[0]);
}

// GET: el modo stateless no abre un canal SSE de mensajes iniciados por el servidor. Se responde
// 405 (el cliente MCP entiende que debe usar solo POST). También sirve de sonda para humanos.
export async function GET() {
  return new NextResponse(
    JSON.stringify({
      ok: true,
      server: SERVER_INFO,
      protocol: "mcp/streamable-http (stateless)",
      hint: "Este es el servidor MCP de Labstream OS. Los agentes deben hacer POST con JSON-RPC 2.0 y la llave lsk_ en Authorization: Bearer. No abre stream SSE (stateless).",
    }),
    { status: 405, headers: { "Content-Type": "application/json", Allow: "POST", "Cache-Control": "no-store" } },
  );
}
