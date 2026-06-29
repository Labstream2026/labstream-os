import { timingSafeEqual } from "node:crypto";

// Comparación de cadenas en TIEMPO CONSTANTE para secretos/tokens (webhooks). Evita filtrar
// el token por temporización con un `===`. La diferencia de longitud sí es observable (es
// inevitable y aceptable); el contenido se compara sin cortocircuito.
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
