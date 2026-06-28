import { getHiggsfieldAccessToken, HF_MCP_URL } from "@/lib/higgsfield-oauth";

// Cliente MCP (streamable-HTTP) del servidor de Higgsfield. Reutiliza el access token OAuth
// (créditos del PLAN). Es adaptativo: descubre las herramientas con tools/list y arma los args a
// partir de su inputSchema, para no romperse si Higgsfield cambia nombres/parámetros.

export class HiggsfieldNotConnected extends Error {}

type ContentItem = { type?: string; text?: string; url?: string; data?: string; resource?: { uri?: string; text?: string } };
type McpResult = { content?: ContentItem[]; isError?: boolean; structuredContent?: Record<string, unknown>; tools?: McpTool[] };
type RpcResponse = { result?: McpResult; error?: { message?: string } };
export type McpTool = { name: string; description?: string; inputSchema?: { properties?: Record<string, unknown>; required?: string[] } };

// Parsea la respuesta MCP (puede venir como JSON o como SSE event-stream).
function parseBody(contentType: string, text: string): RpcResponse | null {
  if (contentType.includes("text/event-stream")) {
    let last: RpcResponse | null = null;
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (t.startsWith("data:")) {
        try { last = JSON.parse(t.slice(5).trim()) as RpcResponse; } catch { /* sigue */ }
      }
    }
    return last;
  }
  try { return JSON.parse(text) as RpcResponse; } catch { return null; }
}

async function rpc(
  method: string,
  params: Record<string, unknown>,
  token: string,
  sessionId?: string,
  isNotification = false,
): Promise<{ json: RpcResponse | null; sessionId?: string; status: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const body = isNotification
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id: Date.now() % 1_000_000_000, method, params };
  const res = await fetch(HF_MCP_URL, { method: "POST", headers, body: JSON.stringify(body) });
  const sid = res.headers.get("mcp-session-id") || sessionId;
  if (isNotification) return { json: null, sessionId: sid, status: res.status };
  const text = await res.text();
  return { json: parseBody(res.headers.get("content-type") || "", text), sessionId: sid, status: res.status };
}

let _session: { id: string; exp: number } | null = null;

async function ensureSession(token: string): Promise<string> {
  if (_session && _session.exp > Date.now()) return _session.id;
  const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "labstream-os", version: "1.0" } }, token);
  const sid = init.sessionId;
  if (!sid) {
    // algunos servidores no usan session id; aun así seguimos (sid vacío).
    _session = { id: "", exp: Date.now() + 10 * 60_000 };
    return "";
  }
  await rpc("notifications/initialized", {}, token, sid, true);
  _session = { id: sid, exp: Date.now() + 10 * 60_000 };
  return sid;
}

async function withSession<T>(fn: (token: string, sid: string) => Promise<T>): Promise<T> {
  const token = await getHiggsfieldAccessToken();
  if (!token) throw new HiggsfieldNotConnected("Higgsfield no está conectado. Reconéctalo en Configuración → Integraciones.");
  try {
    return await fn(token, await ensureSession(token));
  } catch {
    _session = null; // sesión caída → reintenta una vez con sesión nueva
    return await fn(token, await ensureSession(token));
  }
}

let _toolsCache: { tools: McpTool[]; exp: number } | null = null;
export async function listTools(force = false): Promise<McpTool[]> {
  if (!force && _toolsCache && _toolsCache.exp > Date.now()) return _toolsCache.tools;
  const tools = await withSession(async (token, sid) => {
    const r = await rpc("tools/list", {}, token, sid);
    return (r.json?.result?.tools ?? []) as McpTool[];
  });
  _toolsCache = { tools, exp: Date.now() + 10 * 60_000 };
  return tools;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<McpResult> {
  return withSession(async (token, sid) => {
    const r = await rpc("tools/call", { name, arguments: args }, token, sid);
    if (r.json?.error) throw new Error(r.json.error.message || "error del MCP");
    const result = r.json?.result;
    if (!result) throw new Error("respuesta vacía del MCP");
    if (result.isError) {
      const txt = (result.content || []).map((c) => c.text).filter(Boolean).join(" ");
      throw new Error(txt || "la herramienta devolvió un error");
    }
    return result;
  });
}

// Extrae URLs (imagen/video) del resultado de una tool.
export function extractUrls(result: McpResult): string[] {
  const urls: string[] = [];
  const push = (s?: string) => {
    if (typeof s !== "string") return;
    const m = s.match(/https?:\/\/[^\s"')\]]+/g);
    if (m) urls.push(...m);
  };
  for (const c of result.content ?? []) {
    if (c.type === "text") push(c.text);
    if (c.type === "resource") { push(c.resource?.uri); push(c.resource?.text); }
    if (c.type === "image") push(c.url || c.data);
    push(c.url);
  }
  if (result.structuredContent) push(JSON.stringify(result.structuredContent));
  return [...new Set(urls)];
}

function resultText(result: McpResult): string {
  return (result.content ?? []).map((c) => c.text).filter(Boolean).join(" ");
}
function extractJobId(result: McpResult): string | undefined {
  const text = resultText(result);
  const m = text.match(/"?(?:job_set_id|jobId|job_id|generation_id|set_id|id)"?\s*[:=]\s*"?([A-Za-z0-9_-]{6,})"?/);
  if (m) return m[1];
  const sc = result.structuredContent;
  if (sc) for (const k of ["job_set_id", "jobId", "job_id", "generation_id", "set_id", "id"]) {
    const v = sc[k];
    if (typeof v === "string" || typeof v === "number") return String(v);
  }
  return undefined;
}

// ── Selección adaptativa de herramientas ──
const matches = (t: McpTool, ...kw: string[]) => {
  const s = (t.name + " " + (t.description || "")).toLowerCase();
  return kw.some((k) => s.includes(k));
};
// Construye los args usando solo las claves que existen en el inputSchema de la tool.
function buildArgs(tool: McpTool, desired: Record<string, unknown>): Record<string, unknown> {
  const props = tool.inputSchema?.properties ?? {};
  const args: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(desired)) {
    if (v === undefined || v === null) continue;
    if (k in props) args[k] = v;
  }
  return args;
}

async function findImageTool(): Promise<McpTool> {
  const tools = await listTools();
  const t =
    tools.find((x) => matches(x, "text2image", "text-to-image", "txt2img")) ||
    tools.find((x) => matches(x, "image") && !matches(x, "video", "image2video", "img2vid")) ||
    tools.find((x) => matches(x, "image"));
  if (!t) throw new Error("Higgsfield no expone una herramienta de imagen por MCP.");
  return t;
}
async function findVideoTool(): Promise<McpTool> {
  const tools = await listTools();
  const t = tools.find((x) => matches(x, "text2video", "text-to-video")) || tools.find((x) => matches(x, "video"));
  if (!t) throw new Error("Higgsfield no expone una herramienta de video por MCP.");
  return t;
}
async function findStatusTool(): Promise<McpTool | null> {
  const tools = await listTools();
  return tools.find((x) => matches(x, "status", "generation_status", "get_generation", "poll", "job")) ?? null;
}

export async function mcpGenerateImage(prompt: string, opts: { aspectRatio?: string } = {}): Promise<{ url: string }> {
  const tool = await findImageTool();
  const args = buildArgs(tool, { prompt, aspect_ratio: opts.aspectRatio, aspectRatio: opts.aspectRatio, quality: "1080p" });
  if (!("prompt" in args)) args.prompt = prompt;
  const result = await callTool(tool.name, args);
  const url = extractUrls(result)[0];
  if (!url) throw new Error("la generación no devolvió una imagen.");
  return { url };
}

// Arranca un video. Si el MCP fuera síncrono devuelve url; si es asíncrono devuelve jobId a sondear.
export async function mcpStartVideo(prompt: string, opts: { aspectRatio?: string; duration?: number } = {}): Promise<{ jobId?: string; url?: string }> {
  const tool = await findVideoTool();
  const args = buildArgs(tool, { prompt, aspect_ratio: opts.aspectRatio, aspectRatio: opts.aspectRatio, duration: opts.duration });
  if (!("prompt" in args)) args.prompt = prompt;
  const result = await callTool(tool.name, args);
  const url = extractUrls(result).find((u) => /\.(mp4|webm|mov)(\?|$)/i.test(u));
  if (url) return { url };
  return { jobId: extractJobId(result) };
}

export type VideoPoll = { status: "completed" | "failed" | "nsfw" | "pending"; url?: string; error?: string };
export async function mcpPollVideo(jobId: string): Promise<VideoPoll> {
  const status = await findStatusTool();
  if (!status) return { status: "pending" };
  const args = buildArgs(status, { job_set_id: jobId, jobId, job_id: jobId, generation_id: jobId, set_id: jobId, id: jobId });
  const result = await callTool(status.name, args);
  const text = resultText(result).toLowerCase();
  const url = extractUrls(result).find((u) => /\.(mp4|webm|mov)(\?|$)/i.test(u)) || extractUrls(result)[0];
  if (/nsfw/.test(text)) return { status: "nsfw" };
  if (/failed|error/.test(text)) return { status: "failed", error: text.slice(0, 200) };
  if ((/completed|success|done|ready|finished/.test(text) || !/queued|in_progress|processing|pending/.test(text)) && url) {
    return { status: "completed", url };
  }
  return { status: "pending" };
}
