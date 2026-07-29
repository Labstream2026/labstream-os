import { signScopedToken, verifyScopedToken } from "@/lib/signed-token";

// Token del enlace público de la SALA DEL CLIENTE de la galería (/galeria/[token]): el cliente
// entra sin cuenta a UNA entrega y solo a esa.
//
// Lo que se firma es la RUTA RELATIVA de la carpeta dentro de Entregas_LAB. Es a propósito:
// así el navegador nunca elige qué carpeta se abre —lo dice el token, que va firmado—, y no hay
// forma de subir de nivel ni de pasearse por el NAS cambiando la URL.
//
// A diferencia de revisión o portadas, aquí NO hay fila en base de datos que guarde la vigencia
// (decisión de arquitectura: cero migraciones), así que la caducidad viaja DENTRO del token.
// Consecuencia práctica: «renovar» un enlace es volver a firmarlo y compartir el nuevo; el viejo
// sigue vivo hasta su fecha. Para cortar en seco está la revocación (ver galeria-entrega.ts).
export function signGaleriaToken(folderRel: string, days = 90): string {
  return signScopedToken("galeria", folderRel, days);
}

// Devuelve la ruta firmada, o null si la firma no cuadra o el token ya venció.
// OJO: lo que vuelve es texto que estuvo fuera de casa. Antes de tocar el disco con ello hay
// que pasarlo SIEMPRE por normalizeGaleriaRel — de eso se encarga resolverEntrega().
export function verifyGaleriaToken(token: string): string | null {
  return verifyScopedToken("galeria", token);
}
