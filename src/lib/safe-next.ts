// Valida un parámetro `next` de redirección post-login.
// Solo se aceptan rutas internas absolutas ("/algo") para evitar open-redirects.
// "//host" o "/\host" son rutas protocol-relative → se rechazan.
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Caracteres de control (TAB/LF/CR…) pueden colar un redirect externo según cómo parsee el
  // navegador la cabecera Location; se rechazan (sin depender de bytes de control literales).
  for (let i = 0; i < next.length; i++) {
    const c = next.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return fallback;
  }
  if (next.startsWith("/login")) return fallback; // no rebotar al propio login
  // Normaliza cualquier truco de parseo resolviendo contra un origen placeholder: si el origen
  // resultante no es el placeholder, la ruta era externa → fallback. Se devuelve solo la parte
  // interna (path+query+hash), preservando las rutas internas legítimas.
  try {
    const u = new URL(next, "https://placeholder.invalid");
    if (u.origin !== "https://placeholder.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
