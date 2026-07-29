import { getSession, hasPermission, type SessionUser } from "@/lib/auth";

// Acceso a Operaciones_LAB: SOLO el equipo interno. Los clientes del portal jamás ven estas
// rutas (exponen la estructura interna del NAS, misma política que las rutas SMB). El rol
// `demo` puede MIRAR (es la vitrina de solo lectura) pero nunca escribir.
// ESCRIBIR exige además el permiso `escribir_discos`: antes bastaba con no ser cliente/demo,
// lo que le daba a cualquier cuenta interna un botón de borrar sobre toda la share.
export async function opsSession(opts?: { write?: boolean }): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session || session.role === "cliente") return null;
  if (opts?.write && (session.role === "demo" || !hasPermission(session, "escribir_discos"))) return null;
  return session;
}
