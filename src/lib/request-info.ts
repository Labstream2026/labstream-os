import { headers } from "next/headers";

// Datos de la petición para la auditoría: IP real y una descripción corta del
// dispositivo/navegador. La IP se toma del ÚLTIMO salto de X-Forwarded-For (el que
// añade NUESTRO nginx), no del primero — el primero lo puede falsificar el cliente
// (misma regla que el rate-limit de login).
export async function getRequestInfo(): Promise<{ ip: string | null; device: string }> {
  try {
    const h = await headers();
    const xff = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const ip = xff.length ? xff[xff.length - 1] : (h.get("x-real-ip") ?? "").trim() || null;
    return { ip, device: describeDevice(h.get("user-agent") ?? "") };
  } catch {
    return { ip: null, device: "" };
  }
}

// "iPhone · Safari", "Windows · Chrome", "Mac · app de escritorio"… corto y legible;
// no hace falta un parser completo de user-agent para el registro.
export function describeDevice(ua: string): string {
  const os = /iPhone/i.test(ua)
    ? "iPhone"
    : /iPad/i.test(ua)
    ? "iPad"
    : /Android/i.test(ua)
    ? "Android"
    : /Windows/i.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/i.test(ua)
    ? "Mac"
    : /Linux/i.test(ua)
    ? "Linux"
    : "";
  const nav = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\//i.test(ua)
    ? "Opera"
    : /Firefox\//i.test(ua)
    ? "Firefox"
    : /Chrome\//i.test(ua)
    ? "Chrome"
    : /Safari\//i.test(ua)
    ? "Safari"
    : "";
  return [os, nav].filter(Boolean).join(" · ");
}
