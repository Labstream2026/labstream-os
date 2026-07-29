import { signScopedToken, verifyScopedToken } from "@/lib/signed-token";

// Token del enlace público de la SALA DEL CLIENTE de la galería (/galeria/[token]): el cliente
// entra sin cuenta a UNA entrega y solo a esa.
//
// Lo que se firma es la RUTA RELATIVA de la carpeta dentro de Entregas_LAB, junto con el NÚMERO
// DE VERSIÓN de la entrega. Firmar la ruta es a propósito: así el navegador nunca elige qué
// carpeta se abre —lo dice el token— y no hay forma de subir de nivel paseándose por la URL.
//
// La versión existe para que «renovar» signifique algo. Antes el token era autónomo y volver a
// firmarlo dejaba VIVO el anterior hasta su fecha: si un enlace se filtró, generar uno nuevo no
// cerraba nada y había que acordarse de revocar aparte. Ahora crear un enlace sube la versión de
// la entrega (ver galeria-entrega.ts) y todo token con una versión menor deja de abrir.

export type GaleriaTokenData = { folderRel: string; version: number };

// El `id` firmado es JSON compacto: `{"r":"Cliente/Entrega","v":3}`.
export function signGaleriaToken(folderRel: string, days = 90, version = 1): string {
  return signScopedToken("galeria", JSON.stringify({ r: folderRel, v: version }), days);
}

// Devuelve la ruta y la versión firmadas, o null si la firma no cuadra o el token ya venció.
//
// COMPATIBILIDAD: los enlaces repartidos antes de esto firman la ruta PELADA, sin JSON. Se
// aceptan como versión 1 para no dejar sin galería a un cliente que ya tiene su enlace; en
// cuanto el equipo genere uno nuevo, la entrega sube a la versión 2 y aquellos caducan solos.
//
// OJO: lo que vuelve es texto que estuvo fuera de casa. Antes de tocar el disco con ello hay que
// pasarlo SIEMPRE por normalizeGaleriaRel — de eso se encarga resolverEntrega().
export function verifyGaleriaToken(token: string): GaleriaTokenData | null {
  const crudo = verifyScopedToken("galeria", token);
  if (crudo == null) return null;
  // Solo se intenta leer como JSON lo que lo parece: una carpeta puede llamarse cualquier cosa,
  // y un nombre raro no debe convertirse en un token inválido.
  if (crudo.startsWith("{")) {
    try {
      const o = JSON.parse(crudo) as { r?: unknown; v?: unknown };
      if (typeof o.r === "string" && typeof o.v === "number" && Number.isFinite(o.v)) {
        return { folderRel: o.r, version: Math.max(1, Math.floor(o.v)) };
      }
    } catch {
      /* no era nuestro JSON: se trata como ruta pelada */
    }
  }
  return { folderRel: crudo, version: 1 };
}
