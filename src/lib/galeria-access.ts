import { getSession, hasPermission, type SessionUser } from "@/lib/auth";

// Acceso a la galería de entregas (LabTem). Por ahora SOLO el equipo interno: estas rutas
// exponen la estructura de carpetas del NAS, igual que Operaciones.
//
// El cliente NO entra por aquí. Su sala tiene enlace firmado propio (/galeria/[token]), que
// resuelve una única carpeta y jamás deja subir de nivel — el token dice qué entrega es,
// no el navegador. Por eso esta comprobación se queda como está y no se «abre un poquito».
//
// El rol `demo` puede mirar (es la vitrina de solo lectura).
export async function galeriaSession(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session || session.role === "cliente") return null;
  return session;
}

// ESCRIBIR en la galería (crear carpetas, subir, papelera, vincular): equipo interno con el
// permiso `escribir_discos`. Misma vara que Operaciones — la carpeta compartida real del
// equipo no se toca «porque tengo cuenta».
export async function galeriaWriteSession(): Promise<SessionUser | null> {
  const session = await galeriaSession();
  if (!session || session.role === "demo" || !hasPermission(session, "escribir_discos")) return null;
  return session;
}
