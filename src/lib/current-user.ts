import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Devuelve el usuario (de BD) de la sesión activa, o null si no hay sesión o si el
// usuario fue desactivado/borrado tras emitirse el token (la sesión dura 7 días).
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  return db.user.findFirst({ where: { id: session.id, active: true } });
}
