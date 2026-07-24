import { getSession, type SessionUser } from "@/lib/auth";

// Acceso a Operaciones_LAB: SOLO el equipo interno. Los clientes del portal jamás ven estas
// rutas (exponen la estructura interna del NAS, misma política que las rutas SMB). El rol
// `demo` puede MIRAR (es la vitrina de solo lectura) pero nunca escribir.
export async function opsSession(opts?: { write?: boolean }): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session || session.role === "cliente") return null;
  if (opts?.write && session.role === "demo") return null;
  return session;
}
