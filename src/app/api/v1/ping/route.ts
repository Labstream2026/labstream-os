import { apiJson } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/ping — el ÚNICO endpoint de la API SIN credencial: dice que el servidor está vivo
// y CÓMO autenticarse, sin exponer superficie ni datos (el catálogo /api/v1 y el OpenAPI siguen
// exigiendo credencial a propósito). Existe para que un agente distinga «servidor caído» de «mi
// credencial está mala» y salga solo del bucle de 401 sin pedirle el token a un humano.
export async function GET() {
  return apiJson({
    ok: true,
    name: "Labstream OS API v1",
    auth:
      "Authorization: Bearer <lsk_…> — la credencial se crea en Configuración → API; el secreto se muestra UNA sola vez y no es recuperable (guárdalo como variable de entorno del integrador, p. ej. LABSTREAM_OS_API_KEY).",
    verify: "GET /api/v1/whoami (con credencial) devuelve el titular, su rol y sus permisos efectivos.",
    discover: "GET /api/v1 (índice) y GET /api/v1/openapi.json (OpenAPI 3.1) requieren credencial válida: la superficie no es pública.",
  });
}
