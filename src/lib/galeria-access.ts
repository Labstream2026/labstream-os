import { getSession, type SessionUser } from "@/lib/auth";

// Acceso a la galería de entregas (LabTem). Por ahora SOLO el equipo interno: estas rutas
// exponen la estructura de carpetas del NAS, igual que Operaciones.
//
// El cliente NO entra por aquí. Cuando exista su sala tendrá enlace firmado propio, que
// resolverá una única carpeta y jamás dejará subir de nivel — el token dirá qué entrega es,
// no el navegador. Por eso esta comprobación se queda como está y no se «abre un poquito».
//
// El rol `demo` puede mirar (es la vitrina de solo lectura). Escribir no escribe nadie: el
// montaje de LabTem es de solo lectura.
export async function galeriaSession(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session || session.role === "cliente") return null;
  return session;
}
