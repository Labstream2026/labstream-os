import { type NextRequest } from "next/server";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { buildOpenApi } from "@/lib/api-v1-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/openapi.json — especificación OpenAPI 3.1 de toda la superficie (autenticada, igual
// que el índice). La consumen agentes y clientes (n8n, LangChain, Postman…) para descubrir cada
// operación, sus parámetros y su autenticación. Se genera desde el catálogo único.
export const GET = withApiKey(async (req: NextRequest, _ctx: ApiKeyContext) => {
  // Origen público (respeta el proxy del NAS) para el bloque `servers`.
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = proto && host ? `${proto}://${host}` : new URL(req.url).origin;
  return apiJson(buildOpenApi(origin));
});
