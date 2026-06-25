import { type NextRequest } from "next/server";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/whoami — identidad y permisos EFECTIVOS de la credencial. Sin datos de negocio:
// sirve para que un integrador confirme que su key funciona y qué puede hacer antes de pedir nada.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext) => {
  const adminBypass = ctx.session.role === "admin"; // sin scopes y usuario admin → acceso total
  return apiJson({
    ok: true,
    user: { id: ctx.session.id, name: ctx.session.name, email: ctx.session.email },
    role: ctx.session.role,
    // Permisos efectivos de la petición (ya intersecados con los scopes de la key). Si adminBypass
    // es true, la key tiene acceso total aunque la lista no enumere cada permiso.
    permissions: ctx.session.perms,
    adminBypass,
    key: {
      name: ctx.key.name,
      prefix: ctx.key.prefixVisible,
      readOnly: ctx.readOnly,
      scopes: ctx.key.scopes,
    },
  });
});
