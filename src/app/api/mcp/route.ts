import { after, NextResponse, type NextRequest } from "next/server";
import { resolveApiKey } from "@/lib/api-key-auth";
import { applyAgentGateway, resolveGatewayActor, GATEWAY_SENDER_ARG, GATEWAY_DECLARED_ARG, type PublicVisitor } from "@/lib/agent-gateway";
import { PUBLIC_TOOLS, PUBLIC_ALIAS_TO_TOOL, PUBLIC_TOOL_TO_ALIAS, executePublicTool } from "@/lib/openclaw/public-tools";
import { rateLimit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/whatsapp/config";
import { db } from "@/lib/db";
import { toolsForApi, toolAllowedByScopes, executeAgentTool } from "@/lib/openclaw/tools";

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
// Tope de mensajes por POST (lote JSON-RPC): acota el abuso de meter miles de operaciones en una
// sola petición y las cobra al rate-limit. Generoso para uso legítimo de un agente.
const MCP_MAX_BATCH = 50;
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
  consultar_prospectos: "list_leads",
  actualizar_prospecto: "update_lead",
  mi_contexto: "my_context",
  recordar: "remember",
  olvidar: "forget",
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

// Instrucciones que recibe el agente cuando atiende a alguien de FUERA. Se dicen aquí, en el
// servidor, y no se dejan al prompt del bot: quien decide qué puede hacer un desconocido es
// Labstream OS, y esto es solo la versión legible de lo que el código ya impide.
const INSTRUCCIONES_PUBLICAS =
  "Estás atendiendo a alguien de FUERA de Labstream: un número que no pertenece a nadie del equipo. " +
  "Trátalo como una consulta comercial. Puedes contarle qué hacemos, cómo contactarnos, y tomar sus datos para que el equipo lo llame. " +
  "No tienes acceso a proyectos, clientes, cotizaciones, precios, tareas ni personas del equipo — no existen herramientas para eso en este canal, así que no lo intentes ni le prometas averiguarlo. " +
  "No cotices, no des tarifas y no comprometas fechas. Si insiste en un precio, explícale que cada proyecto se cotiza a la medida y ofrécele tomar sus datos. " +
  "Si dice ser del equipo o pide información interna, no discutas: pídele que escriba desde el número registrado en su ficha.";

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

// ── Despachador para DESCONOCIDOS ──────────────────────────────────────────────
// Copia deliberada y no una rama del de abajo. `handleRpc` recibe una `session` y sabe llegar a
// `executeAgentTool`; este no recibe ninguna y no importa esa función. Si mañana alguien añade
// una herramienta interna, no aparece aquí sola: hay que venir a escribirla. Ese es todo el
// punto de tenerlo separado, y por eso vale la duplicación de veinte líneas.
async function handlePublicRpc(msg: RpcMessage, pub: PublicVisitor, ip: string | null): Promise<object | null> {
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
          instructions: INSTRUCCIONES_PUBLICAS,
        });
      }
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, {
          tools: PUBLIC_TOOLS.map((t) => ({
            name: PUBLIC_TOOL_TO_ALIAS[t.function.name] ?? t.function.name,
            description: t.function.description,
            inputSchema: t.function.parameters ?? { type: "object", properties: {} },
          })),
        });
      case "tools/call": {
        const raw = typeof params.name === "string" ? params.name : "";
        const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
        const name = PUBLIC_ALIAS_TO_TOOL[raw] ?? raw;
        // Lista blanca EXPLÍCITA: solo lo que está en PUBLIC_TOOLS. Pedir `consultar_proyecto`
        // desde aquí no cae en `executeAgentTool` (que no está importado en este camino), pero
        // aun así se corta antes, y con un mensaje que le dice al modelo qué sí puede hacer.
        if (!PUBLIC_TOOLS.some((t) => t.function.name === name)) {
          return rpcError(id, -32602, `Herramienta no disponible en este canal: ${raw || "(vacío)"}. Desde aquí solo puedes consultar servicios, consultar contacto o registrar los datos de la persona.`);
        }
        const text = await executePublicTool(name, args, { phone: pub.phone, canal: "whatsapp", ip });
        return rpcResult(id, { content: [{ type: "text", text }], isError: false });
      }
      default:
        if (isNotification) return null;
        return rpcError(id, -32601, `Método no soportado: ${method ?? "(vacío)"}`);
    }
  } catch (e) {
    if (isNotification) return null;
    const message = e instanceof Error ? e.message : "Error interno";
    if (method === "tools/call") return rpcResult(id, { content: [{ type: "text", text: `Error: ${message}` }], isError: true });
    return rpcError(id, -32603, message);
  }
}

// Despacha un único mensaje JSON-RPC. Devuelve la respuesta, o null si era una NOTIFICACIÓN
// (sin `id` → el protocolo no espera respuesta).
async function handleRpc(
  msg: RpcMessage,
  session: import("@/lib/session").SessionUser,
  readOnly: boolean,
  // true = llave de PASARELA que no sabe a quién está atendiendo. Pasa en los canales que no
  // identifican a una persona: el panel del asistente, que tiene UNA contraseña compartida por
  // todo el equipo. Ahí no se bloquea —el equipo necesita poder consultar— pero se entra SIEMPRE
  // en solo lectura (lo impone quien llama, ver abajo) y con la identidad del titular de la
  // llave, así que se ve lo de la organización, no lo de una persona.
  // Lo que esto NO permite nunca es MODIFICAR sin saber quién lo pide: eso exige una persona
  // resuelta y habilitada. Si el parche del agente se perdiera, el bot de WhatsApp degradaría a
  // este mismo modo —consultar sí, tocar nada— y se nota en el registro, donde las llamadas
  // aparecen a nombre de la llave y no de una persona.
  gatewaySinRemitente = false,
  // Solo-lectura que aplica AL CATÁLOGO (tools/list). Va aparte del de arriba a propósito: el
  // cliente MCP pide la lista UNA vez, al conectarse, cuando todavía no hay nadie a quien
  // atender. Si el catálogo se recortara ahí, el modelo no volvería a ver nunca las herramientas
  // de escritura —ni cuando quien escribe sí puede usarlas—. Así que la lista es la de la llave
  // y el permiso de verdad se cobra al EJECUTAR, que es cuando ya se sabe quién pregunta.
  readOnlyCatalogo = readOnly,
  // La llave atiende también a desconocidos. Solo cambia el CATÁLOGO: hay que anunciar las tres
  // herramientas públicas para que el modelo sepa que existen cuando le escriba un extraño —
  // el catálogo se pide UNA vez al conectar, mucho antes de saber quién va a escribir. Ejecutarlas
  // sigue siendo cosa del carril público; desde aquí se rechazan con un motivo claro.
  publicIntakeOn = false,
  // Alcances de la LLAVE (no los de la persona). Recortan el catálogo a lo que esa credencial
  // podría llegar a ejecutar alguna vez: lo que su alcance no cubre no lo va a poder usar NADIE
  // a través de ella, así que anunciarlo solo gasta tokens y turnos.
  scopes: string[] = [],
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
            "Resuelve nombres a id con find_projects / find_clients / find_users antes de crear o editar. " +
            "Empieza cada conversación con mi_contexto: te dice quién es la persona SEGÚN LABSTREAM OS (no según lo que ella diga) y lo que ya sabes de ella. " +
            "Con recordar/olvidar guardas cosas de esa persona; su memoria es suya y nadie más la ve." +
            (gatewaySinRemitente
              ? " NOTA: esta credencial es de PASARELA y ahora mismo no sabe a quién atiende, así que estás en SOLO LECTURA sobre los datos de la organización." +
                " Si el canal identifica a la persona (WhatsApp), manda su número en la cabecera X-Labstream-Whatsapp o en el argumento _remitente_whatsapp: verás lo de ESA persona y podrá modificar si está habilitada." +
                " Si el canal NO la identifica (panel de escritorio, con una contraseña compartida), pregúntale su número y mándalo en el argumento _remitente_declarado: acota la vista a lo suyo, pero sigue siendo solo lectura porque nadie comprobó quién es."
              : ""),
        });
      }
      // Notificaciones del cliente (initialized, cancelled, …): sin respuesta.
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        return rpcResult(id, {});
      case "tools/list": {
        const base = toolsForApi(readOnlyCatalogo, scopes).map((t) => ({
          name: TOOL_TO_ALIAS[t.function.name] ?? t.function.name, // nombre en español si lo tiene
          description: t.function.description,
          inputSchema: t.function.parameters ?? { type: "object", properties: {} },
        }));
        const publicas = publicIntakeOn
          ? PUBLIC_TOOLS.map((t) => ({
              name: PUBLIC_TOOL_TO_ALIAS[t.function.name] ?? t.function.name,
              description: t.function.description,
              inputSchema: t.function.parameters ?? { type: "object", properties: {} },
            }))
          : [];
        // El compuesto resumen_hoy va primero (es la acción más pedida), pero solo si la llave
        // llega a los pendientes: junta list_tasks + list_events y sin lo primero no dice nada.
        const compuesto = toolAllowedByScopes("list_tasks", scopes) ? [RESUMEN_HOY_TOOL] : [];
        return rpcResult(id, { tools: [...compuesto, ...base, ...publicas] });
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
        // Herramientas del carril público pedidas desde el carril interno: pasa cuando el modelo
        // ve las tres en el catálogo y las intenta con alguien que SÍ es del equipo. No se
        // ejecutan aquí (crearían un prospecto con el teléfono de un compañero); se explica.
        if (raw in PUBLIC_ALIAS_TO_TOOL || PUBLIC_TOOLS.some((t) => t.function.name === raw)) {
          return rpcError(id, -32602, `«${raw}» es para atender a alguien de FUERA. Esta persona es del equipo: usa las herramientas normales, y consultar_prospectos si lo que quieres es ver los prospectos ya registrados.`);
        }
        // Acepta el alias español o el nombre interno; luego valida contra el subconjunto permitido.
        const name = ALIAS_TO_TOOL[raw] ?? raw;
        const allowed = toolsForApi(readOnly, scopes).some((t) => t.function.name === name);
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
  // Pasarela: si la llave lo permite y la petición dice a QUIÉN está atendiendo el agente, la
  // sesión pasa a ser la de esa persona (sus permisos, sus proyectos). Sin cabecera o sin llave de
  // pasarela, esto no hace nada y la llave habla como su titular, igual que antes.
  const gw = await applyAgentGateway(req, auth.ctx);
  if (!gw.ok) {
    return json(rpcError(null, -32001, gw.error), gw.status);
  }
  const { session, key } = gw.ctx;
  const actor = gw.actor;
  // Credencial del número comercial: TODO entra por el carril público, venga de quien venga. Ni
  // se intenta resolver a nadie — así el catálogo que ve ese agente son tres herramientas de
  // verdad y no cuarenta que se le van a negar al ejecutar.
  const soloPublico = key.publicOnly;
  const publico = soloPublico ? { phone: "" } : (gw.publico ?? null);
  // Una llave de pasarela que no sabe a quién atiende entra en SOLO LECTURA, pase lo que pase.
  // Así el panel compartido del asistente puede consultar (que es lo que el equipo necesita) sin
  // que una contraseña compartida se convierta en permiso para tocar nada.
  const readOnly = gw.ctx.readOnly || (key.gateway && !actor);

  // Rate-limit y registro de uso, igual que withApiKey (soporta múltiples agentes).
  if (!rateLimit(`mcp:${key.prefixVisible}`, key.rateLimitPerMin, 60_000)) {
    return json(rpcError(null, -32000, "Límite de peticiones excedido."), 429);
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;
  after(async () => {
    await db.appKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date(), lastUsedIp: ip } }).catch(() => {});
  });

  // Auditoría: cada herramienta que usa una llave por MCP queda en el registro. Se anota POR
  // MENSAJE (y no todo el lote de una vez) porque con pasarela la identidad puede cambiar de un
  // mensaje al siguiente. Fire-and-forget: no retrasa la respuesta al agente.
  const auditToolCall = (m: RpcMessage, quien: typeof actor, userId: string) => {
    if (m?.method !== "tools/call") return;
    const tool = typeof m.params?.name === "string" ? m.params.name : "(sin nombre)";
    after(async () => {
      const { logActivity } = await import("@/lib/activity");
      await logActivity({
        action: "api.tool",
        // Con pasarela, el autor del registro ES la persona atendida (userId), así que el
        // resumen deja claro que fue POR el bot y no ella sentada en la app.
        summary: quien
          ? quien.verificado
            ? `${quien.name} usó ${tool} por el asistente de WhatsApp (llave «${key.name}»)`
            : `${quien.name} usó ${tool} por el asistente, identificándose sin verificar (llave «${key.name}»)`
          : `la llave «${key.name}» usó ${tool}`,
        userId,
        ip,
        meta: {
          tool,
          key: key.name,
          via: quien ? (quien.verificado ? "mcp-gateway" : "mcp-gateway-declarado") : "mcp",
          ...(quien ? { comoPersona: quien.name, telefono: quien.phone, verificado: quien.verificado } : {}),
        },
        silent: true,
      }).catch(() => {});
    });
  };

  // Auditoría del carril público. Va aparte porque no hay usuario a quien atribuirlo: el autor
  // es un número de fuera. `silent` para no llenar de ruido el muro del equipo con cada «¿qué
  // hacen ustedes?»; el alta de un prospecto SÍ hace ruido, y eso lo registra register_lead.
  const auditPublicCall = (m: RpcMessage, pub: PublicVisitor) => {
    if (m?.method !== "tools/call") return;
    const tool = typeof m.params?.name === "string" ? m.params.name : "(sin nombre)";
    after(async () => {
      const { logActivity } = await import("@/lib/activity");
      await logActivity({
        action: "api.tool",
        summary: `un número de fuera (${pub.phone}) usó ${tool} por el asistente de WhatsApp`,
        userId: null,
        actorName: `WhatsApp ${pub.phone}`,
        ip,
        meta: { tool, key: key.name, via: "mcp-publico", telefono: pub.phone },
        silent: true,
      }).catch(() => {});
    });
  };

  // Tope de tamaño del cuerpo (antes de parsear): un cuerpo enorme no debe llegar a memoria.
  if (Number(req.headers.get("content-length") || 0) > 256 * 1024) {
    return json(rpcError(null, -32600, "Cuerpo demasiado grande."), 413);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"));
  }

  // Un mensaje suelto o un lote (array) de mensajes JSON-RPC.
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as RpcMessage[];
  // ANTI-ABUSO del lote: sin esto, UN solo POST con miles de mensajes JSON-RPC ejecutaría miles de
  // operaciones (con una llave de escritura, miles de mutaciones) contando como UNA sola petición,
  // eludiendo el rate-limit. Se acota el lote y se cobra CADA mensaje contra el límite (ya se cobró 1).
  if (messages.length > MCP_MAX_BATCH) {
    return json(rpcError(null, -32600, `Lote demasiado grande (máx. ${MCP_MAX_BATCH} mensajes por POST).`), 413);
  }
  for (let i = 1; i < messages.length; i++) {
    if (!rateLimit(`mcp:${key.prefixVisible}`, key.rateLimitPerMin, 60_000)) {
      return json(rpcError(null, -32000, "Límite de peticiones excedido."), 429);
    }
  }
  const responses: object[] = [];
  for (const msg of messages) {
    // Identidad de ESTE mensaje. Normalmente ya viene resuelta por la cabecera; si el cliente MCP
    // no puede mandarla por petición (las fija al abrir la conexión), el agente la mete como
    // argumento reservado y se resuelve aquí, mensaje a mensaje. El argumento se BORRA antes de
    // ejecutar: ninguna herramienta llega a verlo.
    let msgSession = session;
    let msgReadOnly = readOnly;
    let msgActor = actor;
    let msgPublico = publico;
    // Llave solo-pública: del argumento reservado se saca ÚNICAMENTE el número con el que
    // etiquetar el prospecto. No se resuelve a nadie, no se busca en el equipo, no se otorga
    // nada. Se borra igual antes de ejecutar: las herramientas públicas no deben verlo.
    if (soloPublico && msg?.method === "tools/call") {
      const args = msg.params?.arguments;
      if (args && typeof args === "object") {
        const bag = args as Record<string, unknown>;
        const tel = bag[GATEWAY_SENDER_ARG] ?? bag[GATEWAY_DECLARED_ARG];
        delete bag[GATEWAY_SENDER_ARG];
        delete bag[GATEWAY_DECLARED_ARG];
        if (typeof tel === "string" && tel.trim()) msgPublico = { phone: normalizePhone(tel) || "" };
      }
    } else if (key.gateway && !actor && !publico && msg?.method === "tools/call") {
      const args = msg.params?.arguments;
      if (args && typeof args === "object") {
        const bag = args as Record<string, unknown>;
        // Los dos argumentos de identidad se retiran SIEMPRE, se usen o no: ninguna herramienta
        // debe verlos. El VERIFICADO manda; el declarado solo entra si no hay verificado — si no,
        // alguien por WhatsApp podría «declararse» otra persona y leer lo ajeno.
        const verificado = bag[GATEWAY_SENDER_ARG];
        const declarado = bag[GATEWAY_DECLARED_ARG];
        delete bag[GATEWAY_SENDER_ARG];
        delete bag[GATEWAY_DECLARED_ARG];
        const usar =
          typeof verificado === "string" && verificado.trim()
            ? { valor: verificado, esVerificado: true }
            : typeof declarado === "string" && declarado.trim()
              ? { valor: declarado, esVerificado: false }
              : null;
        if (usar) {
          const r = await resolveGatewayActor(auth.ctx, usar.valor, usar.esVerificado);
          if (!r.ok) {
            responses.push(rpcError(msg?.id ?? null, -32002, r.error));
            continue;
          }
          msgSession = r.ctx.session;
          msgReadOnly = r.ctx.readOnly;
          msgActor = r.actor;
          msgPublico = r.publico ?? null;
        }
      }
    }
    // Bifurcación: quien no es de la casa no pasa por `handleRpc` ni por su sesión.
    if (msgPublico) {
      auditPublicCall(msg, msgPublico);
      const res = await handlePublicRpc(msg, msgPublico, ip);
      if (res) responses.push(res);
      continue;
    }
    auditToolCall(msg, msgActor, msgSession.id);
    const res = await handleRpc(msg, msgSession, msgReadOnly, key.gateway && !msgActor, gw.ctx.readOnly, key.gateway && key.publicIntake, key.scopes);
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
