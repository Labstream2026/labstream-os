import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Devuelve el usuario (de BD) de la sesión activa, o null si no hay sesión.
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  return db.user.findUnique({ where: { id: session.id } });
}
