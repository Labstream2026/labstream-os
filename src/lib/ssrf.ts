import { promises as dns } from "node:dns";
import net from "node:net";

// ── Protección anti-SSRF para descargas de URLs controladas por terceros ──
// Antes de hacer fetch a una URL que viene de fuera (webhooks, integraciones), hay que
// asegurarse de que NO apunta a la red interna: loopback (127/::1), enlaces locales
// (169.254/fe80, incluido el 169.254.169.254 de metadata de nubes), rangos privados
// (10/172.16/192.168) ni esquemas raros (file:, gopher:…). Además se acota el tiempo y el
// tamaño de la descarga, y se REVALIDA cada redirección (un destino público podría redirigir
// a uno interno). Mitiga el ataque directo; el rebinding de DNS queda como riesgo residual.

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1, 5).map(Number);
  if (o.some((n) => n > 255)) return null;
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}

function inV4(n: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base);
  if (b === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return ((n & mask) >>> 0) === ((b & mask) >>> 0);
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return (
    inV4(n, "0.0.0.0", 8) ||        // "this" network
    inV4(n, "10.0.0.0", 8) ||       // privada
    inV4(n, "100.64.0.0", 10) ||    // CGNAT
    inV4(n, "127.0.0.0", 8) ||      // loopback
    inV4(n, "169.254.0.0", 16) ||   // link-local (incl. 169.254.169.254 metadata)
    inV4(n, "172.16.0.0", 12) ||    // privada
    inV4(n, "192.0.0.0", 24) ||     // IETF protocol assignments
    inV4(n, "192.168.0.0", 16) ||   // privada
    inV4(n, "198.18.0.0", 15) ||    // benchmarking
    inV4(n, "224.0.0.0", 4) ||      // multicast
    inV4(n, "240.0.0.0", 4)         // reservado (incl. 255.255.255.255)
  );
}

function isPrivateIpv6(ip: string): boolean {
  const s = ip.toLowerCase().split("%")[0]; // quita zone id (fe80::1%eth0)
  const mapped = s.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/); // IPv4-mapeada
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (s === "::1" || s === "::") return true;      // loopback / unspecified
  if (/^f[cd]/.test(s)) return true;               // fc00::/7 ULA
  if (/^fe[89ab]/.test(s)) return true;            // fe80::/10 link-local
  return false;
}

export function isPrivateIp(ip: string): boolean {
  return ip.includes(":") ? isPrivateIpv6(ip) : isPrivateIpv4(ip);
}

// Resuelve el host a sus IPs (o lo trata como IP literal) y rechaza si CUALQUIERA es interna.
async function hostIps(host: string): Promise<string[]> {
  const h = host.replace(/^\[/, "").replace(/\]$/, ""); // IPv6 entre corchetes
  if (net.isIP(h)) return [h];
  const recs = await dns.lookup(h, { all: true, verbatim: true });
  return recs.map((r) => r.address);
}

export async function assertPublicHost(host: string): Promise<void> {
  let ips: string[];
  try {
    ips = await hostIps(host);
  } catch {
    throw new Error("No se pudo resolver el host de la URL");
  }
  if (!ips.length) throw new Error("El host no tiene direcciones");
  for (const ip of ips) {
    if (isPrivateIp(ip)) throw new Error("Destino no permitido (apunta a la red interna)");
  }
}

type FetchOpts = { maxBytes: number; timeoutMs?: number; maxRedirects?: number };

// Descarga una URL pública a un Buffer de forma segura: solo http(s), host público (revalidado
// en cada redirección), con timeout y tope de tamaño (corta el stream si se excede).
export async function fetchPublicUrlToBuffer(
  rawUrl: string,
  opts: FetchOpts,
): Promise<{ buf: Buffer; contentType: string | null; finalUrl: string }> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const maxRedirects = opts.maxRedirects ?? 3;
  let current = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      throw new Error("URL inválida");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Solo se permiten URLs http(s)");
    await assertPublicHost(u.hostname);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(u, { redirect: "manual", signal: ctrl.signal, headers: { accept: "*/*" } });
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof Error && e.name === "AbortError") throw new Error("Tiempo de descarga agotado");
      throw new Error("No se pudo conectar al origen");
    }

    // Redirección: revalidar el destino (no confiar en que sea público).
    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirección sin destino");
      current = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok) {
      clearTimeout(timer);
      throw new Error(`No pude descargar el archivo (${res.status})`);
    }

    const cl = Number(res.headers.get("content-length") || "");
    if (Number.isFinite(cl) && cl > opts.maxBytes) {
      clearTimeout(timer);
      throw new Error("Archivo demasiado grande");
    }

    const contentType = res.headers.get("content-type");
    const reader = res.body?.getReader();
    if (!reader) {
      clearTimeout(timer);
      const ab = await res.arrayBuffer();
      if (ab.byteLength > opts.maxBytes) throw new Error("Archivo demasiado grande");
      return { buf: Buffer.from(ab), contentType, finalUrl: u.toString() };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.length;
          if (total > opts.maxBytes) {
            ctrl.abort();
            throw new Error("Archivo demasiado grande");
          }
          chunks.push(value);
        }
      }
    } finally {
      clearTimeout(timer);
    }
    return { buf: Buffer.concat(chunks), contentType, finalUrl: u.toString() };
  }
  throw new Error("Demasiadas redirecciones");
}
