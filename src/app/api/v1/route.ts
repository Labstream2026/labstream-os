import { type NextRequest } from "next/server";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { groupedCatalog } from "@/lib/api-v1-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1 — catálogo de la API (autenticado, para no exponer la superficie sin credencial).
// La superficie se genera desde el catálogo único (src/lib/api-v1-catalog.ts), que también alimenta
// el OpenAPI. El alcance real de cada endpoint depende de los permisos del titular (∩ scopes).
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext) => {
  return apiJson({
    ok: true,
    name: "Labstream OS API v1",
    auth: "Authorization: Bearer <lsk_…> — la credencial hereda los permisos de su titular (∩ scopes).",
    openapi: "/api/v1/openapi.json",
    you: { id: ctx.session.id, name: ctx.session.name, role: ctx.session.role },
    readOnly: ctx.readOnly,
    scopes: ctx.key.scopes.length ? ctx.key.scopes : "todos los permisos del titular",
    endpoints: groupedCatalog(),
  });
});
