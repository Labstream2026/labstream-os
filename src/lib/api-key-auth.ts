import { timingSafeEqual } from "node:crypto";
import { NextResponse, after, type NextRequest } from "next/server";
import type { AppKey } from "@prisma/client";
import { db } from "@/lib/db";
import { buildAgentSession } from "@/lib/openclaw/tools";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { hashApiKey, PREFIX_VISIBLE_LEN } from "@/lib/api-key";
import { rateLimit } from "@/lib/rate-limit";
import type { SessionUser } from "@/lib/session";

// ── Guard de la API intermedia (/api/v1) ──
// Autentica una petición externa por `Authorization: Bearer <secreto>` contra el modelo AppKey,
// reconstruye la sesión del usuario titular EN VIVO (permisos frescos) e impone los permisos
// efectivos = intersección(permisos del usuario, scopes de la key). Calcado del patrón de
// cron-auth.ts (comparación timing-safe), pero resolviendo contra BD por-credencial.

// Rol sintético al que se degrada un admin cuando su key tiene scopes: así `hasPermission` NO
// aplica el bypass incondicional de admin y la key queda limitada SOLO a sus scopes.
const SCOPED_ROLE = "_apikey";

export type ApiKeyContext = {
  session: SessionUser; // sesión EFECTIVA (permisos ya intersecados con los scopes de la key)
  key: AppKey;
  readOnly: boolean;
};

type Resolved = { ok: true; ctx: ApiKeyContext } | { ok: false; status: number; error: string };

// IP del cliente (best-effort) para auditoría liviana de lastUsedIp.
function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

// Comparación timing-safe de dos hashes hex de longitud fija (no filtra por timing ni longitud).
function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// Resuelve y valida la credencial de una petición. NO toca lastUsedAt (eso lo hace withApiKey
// de forma asíncrona para no bloquear la respuesta).
export async function resolveApiKey(req: NextRequest): Promise<Resolved> {
  const raw = (req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "")
    .trim()
    .replace(/^["']+|["']+$/g, "") // comillas envolventes al pegar la clave en una env var
    .replace(/\s+/g, ""); // espacios/saltos de línea colados (lsk_ es base64url: nunca los lleva)
  // El secreto va SIEMPRE en el header Authorization, NUNCA en query string (que acabaría en logs).
  if (!raw || raw.length < PREFIX_VISIBLE_LEN) return { ok: false, status: 401, error: "Falta o es inválida la credencial (Authorization: Bearer …)." };

  const prefixVisible = raw.slice(0, PREFIX_VISIBLE_LEN);
  const key = await db.appKey.findUnique({ where: { prefixVisible } }); // lookup O(1) por índice único
  // Verificación timing-safe del hash completo (aunque el prefijo no exista, comparamos contra un
  // hash dummy para no filtrar por timing si una key existe o no).
  const presented = hashApiKey(raw);
  const stored = key?.secretHash ?? "0".repeat(64);
  const match = safeEqualHex(presented, stored);
  if (!key || !match) return { ok: false, status: 401, error: "Credencial inválida." };

  if (key.revoked) return { ok: false, status: 401, error: "Credencial revocada." };
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return { ok: false, status: 401, error: "Credencial expirada." };

  // Sesión EN VIVO del usuario titular (rol + permisos + overrides frescos de BD). Si el usuario
  // está inactivo o borrado, buildAgentSession devuelve null → la key queda inerte sin tocar AppKey.
  const session = await buildAgentSession(key.userId);
  if (!session) return { ok: false, status: 401, error: "El usuario titular de la credencial no está activo." };

  // ── Permisos efectivos = intersección(permisos del usuario, scopes de la key) ──
  // Permisos REALES del usuario: un admin tiene TODOS (su rol pasa por bypass), así que su
  // conjunto base es ALL_PERMISSION_KEYS; cualquier otro rol usa sus permisos asignados.
  const userPerms = session.role === "admin" ? ALL_PERMISSION_KEYS : session.perms;
  let effective: SessionUser;
  if (key.scopes.length === 0) {
    // Sin scopes → la key hereda TODO lo del usuario (incluido el bypass de admin si lo es).
    effective = session;
  } else {
    // Con scopes → permisos = intersección. El rol solo se degrada para el ADMIN (el único con
    // bypass incondicional en hasPermission); los DEMÁS roles se conservan porque llevan
    // RESTRICCIONES específicas que viven en comparaciones de rol —p. ej. las del portal cliente
    // en accessibleProjectWhere/canAccessProject (rama de proyectos públicos), validateAssignee
    // (solo asigna a su equipo) y la visibilidad de eventos—. Degradar a un cliente a "_apikey"
    // BORRABA esas restricciones y su key scoped veía MÁS que él en la app. Degradar el rol debe
    // quitar privilegios, nunca quitar restricciones.
    const perms = key.scopes.filter((s) => userPerms.includes(s));
    effective = { ...session, role: session.role === "admin" ? SCOPED_ROLE : session.role, perms };
  }

  return { ok: true, ctx: { session: effective, key, readOnly: key.readOnly } };
}

// Wrapper OBLIGATORIO para toda ruta /api/v1: resuelve la credencial, aplica rate-limit y registra
// el uso (async). Si la auth falla, responde el código adecuado y NUNCA llama al handler.
export function withApiKey(
  handler: (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => Promise<Response> | Response,
) {
  return async (req: NextRequest, routeCtx: unknown): Promise<Response> => {
    const r = await resolveApiKey(req);
    if (!r.ok) return new NextResponse(r.error, { status: r.status });

    if (!rateLimit(`apikey:${r.ctx.key.prefixVisible}`, r.ctx.key.rateLimitPerMin, 60_000)) {
      return new NextResponse("Límite de peticiones excedido. Inténtalo en un momento.", { status: 429 });
    }

    // Registro de uso, fire-and-forget: nunca bloquea ni rompe la respuesta.
    const ip = clientIp(req);
    after(async () => {
      await db.appKey.update({ where: { id: r.ctx.key.id }, data: { lastUsedAt: new Date(), lastUsedIp: ip } }).catch(() => {});
    });

    return handler(req, r.ctx, routeCtx);
  };
}

// Helper JSON estándar para las rutas /api/v1 (no-store por defecto).
export function apiJson(data: unknown, status = 200): NextResponse {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Límites defensivos de tamaño para los cuerpos JSON de /api/v1 (evita consumo de memoria al
// parsear y amplificación de coste hacia el LLM por un titular abusivo). bodySizeLimit de
// next.config solo aplica a Server Actions, NO a route handlers — por eso se acota aquí.
export const MAX_BODY_BYTES = 256 * 1024; // 256 KB de cuerpo
export const MAX_TEXT_CHARS = 6_000; // por campo de texto (message/content/system) — acota tokens hacia el modelo

// true si la cabecera Content-Length declara un cuerpo mayor al permitido. (Content-Length puede
// faltar con transfer-encoding chunked; por eso además se recorta cada campo de texto al parsear.)
export function bodyTooLarge(req: NextRequest): boolean {
  const len = Number(req.headers.get("content-length") ?? 0);
  return Number.isFinite(len) && len > MAX_BODY_BYTES;
}

// Recorta una cadena al máximo de caracteres permitido (defensa en profundidad para campos de texto).
export function clampText(s: string): string {
  return s.length > MAX_TEXT_CHARS ? s.slice(0, MAX_TEXT_CHARS) : s;
}
