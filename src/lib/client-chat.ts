// Los canales de cliente-empresa se ELIMINARON (decisión 2026-07-19): el chat queda solo en
// proyectos, generales, roles y DMs. Esta función era quien los creaba y sincronizaba; ahora es
// un no-op que devuelve null — sus llamadores (dock, actividad, mover proyecto) ya manejan null
// con gracia, así que no hay que tocarlos. Los canales existentes se borran con la migración
// `borrar_canales_cliente` (mensajes incluidos; los archivos espejados en Archivos se conservan).
export async function getOrCreateClientChannel(_clientId: string): Promise<string | null> {
  return null;
}
