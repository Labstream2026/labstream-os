// Solo se aceptan enlaces http(s) para evitar XSS por `javascript:` / `data:` en
// atributos href que se renderizan (archivos de proyecto, entregables, biblioteca).
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return u;
  } catch {
    /* no es URL absoluta válida */
  }
  return null;
}
