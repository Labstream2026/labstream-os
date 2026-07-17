import { safeExternalUrl } from "@/lib/url";

export { safeExternalUrl };

// URL segura para meter en un CSS `background-image: url("…")`. Rechaza los caracteres que
// romperían el url() e inyectarían declaraciones CSS extra en el elemento (comillas y paréntesis)
// y los esquemas que no sean http(s). Permite las rutas internas de imagen (/api/proposal-img,
// que el portal enhebra con su token). Devuelve "" si la URL no es segura (se ignora el fondo).
// El autor de la propuesta es del equipo, pero el documento se sirve en un portal PÚBLICO, así que
// vale la pena el blindaje.
export function safeBgUrl(bg: string): string {
  if (!bg) return "";
  if (/["')]/.test(bg)) return "";
  if (bg.startsWith("/")) return bg; // ruta interna (incluye /api/proposal-img con su token)
  return safeExternalUrl(bg) ? bg : "";
}
