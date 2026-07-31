import { getSession, hasPermission, type SessionUser } from "@/lib/auth";

// Acceso a Operaciones_LAB: SOLO el equipo interno. Los clientes del portal jamás ven estas
// rutas (exponen la estructura interna del NAS, misma política que las rutas SMB). El rol
// `demo` puede MIRAR (es la vitrina de solo lectura) pero nunca escribir.
// ESCRIBIR exige además un permiso: antes bastaba con no ser cliente/demo, lo que le daba a
// cualquier cuenta interna un botón de borrar sobre toda la share. Y no es UNA llave sino
// tres, porque subir material, reorganizarlo y borrarlo son confianzas distintas:
//   escribir_discos  → subir y crear carpetas
//   organizar_discos → mover, copiar y renombrar
//   borrar_discos    → papelera
// `write: true` queda como alias de escribir_discos para el código que ya lo usaba.
export async function opsSession(opts?: { write?: boolean; permiso?: string }): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session || session.role === "cliente") return null;
  const llave = opts?.permiso ?? (opts?.write ? "escribir_discos" : null);
  if (llave && (session.role === "demo" || !hasPermission(session, llave))) return null;
  return session;
}
