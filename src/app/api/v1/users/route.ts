import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/users?q=&includeInactive= — DIRECTORIO del equipo (solo lectura), para resolver
// responsables/reviewers al asignar. Devuelve únicamente campos operativos seguros (nunca correo,
// cédula, teléfono ni datos personales). Excluye bots de sistema (Marcebot) y usuarios del portal
// cliente. NO es administración de usuarios: no crea, edita ni borra (eso vive en Configuración).
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  // El portal cliente no necesita el directorio del equipo (y no debe ver la plantilla completa).
  if (ctx.session.role === "cliente") return apiJson({ ok: false, error: "No disponible para el portal cliente." }, 403);
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const where: Record<string, unknown> = {
    isSystemBot: false,
    role: { key: { not: "cliente" } },
    ...(includeInactive ? {} : { active: true }),
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const users = await db.user.findMany({
    where,
    take: 200,
    orderBy: { name: "asc" },
    select: { id: true, name: true, title: true, initials: true, avatarColor: true, active: true, isGuest: true, role: { select: { key: true, name: true } } },
  });
  return apiJson({
    ok: true,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      title: u.title,
      initials: u.initials,
      color: u.avatarColor,
      active: u.active,
      guest: u.isGuest,
      role: u.role ? { key: u.role.key, name: u.role.name } : null,
    })),
  });
});
