import { type NextRequest } from "next/server";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { healthCheckOpenClaw } from "@/lib/openclaw/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/health — ¿está VIVO el gateway de IA? Pega a /v1/models del gateway, NO a una
// completion: por eso NO consume cuota del modelo (Codex). Útil para que un integrador sepa si
// puede llamar a /agent o si está caído, y para distinguir "gateway caído" de "límite de uso".
// 200 si up; 503 si el gateway no responde (con la causa en `gateway.error`).
export const GET = withApiKey(async (_req: NextRequest, _ctx: ApiKeyContext) => {
  const h = await healthCheckOpenClaw();
  return apiJson({ ok: true, gateway: h }, h.up ? 200 : 503);
});
