// Valida un parámetro `next` de redirección post-login.
// Solo se aceptan rutas internas absolutas ("/algo") para evitar open-redirects.
// "//host" o "/\host" son rutas protocol-relative → se rechazan.
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/login")) return fallback; // no rebotar al propio login
  return next;
}
