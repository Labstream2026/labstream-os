import type { SessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/auth";
import { getLiveAuthState } from "@/lib/permissions";
import { sectionMeta } from "@/lib/chat-section";

// Chequeos de acceso a la SECCIÓN de un canal (servidor: usan sesión/BD). Ver [[chat-section.ts]]
// para el catálogo puro (client-safe).

// ¿La SESIÓN actual tiene acceso a la sección de un canal? Sin sección → sin requisito extra.
export function sessionHasSectionAccess(section: string | null | undefined, session: SessionUser | null): boolean {
  const meta = sectionMeta(section);
  if (!meta) return true;
  return hasPermission(session, meta.perm);
}

// ¿Un usuario cualquiera (por id) tiene acceso a la sección? Se usa al añadir/etiquetar personas en
// un grupo asignado a una dependencia: solo entran quienes pueden ver esa sección.
export async function userHasSectionAccess(userId: string, section: string | null | undefined): Promise<boolean> {
  const meta = sectionMeta(section);
  if (!meta) return true;
  const state = await getLiveAuthState(userId);
  if (!state || !state.active) return false;
  return state.roleKey === "admin" || state.perms.includes(meta.perm);
}
