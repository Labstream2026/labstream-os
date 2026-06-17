import { db } from "@/lib/db";
import { verifyReviewMediaToken } from "@/lib/review-token";
import { detectSource } from "@/lib/media-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Proxy de un video de Google Drive servido por el MISMO origen. Sirve para que el
// reproductor de revisión pueda LEER el fotograma (captura) — algo imposible con el
// iframe de Drive (otro origen, CORS). Autorización = token firmado por versión (no
// sesión), igual capability que /api/files-asset, para que funcione en el portal del
// cliente. Soporta Range (seek). Si Drive responde HTML (privado/permiso), devuelve
// 502 y el <video> del cliente cae al iframe de Drive.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params;
  const t = new URL(req.url).searchParams.get("t") || "";
  if (verifyReviewMediaToken(t) !== versionId) return new Response("No autorizado", { status: 401 });

  const version = await db.deliverableVersion.findUnique({ where: { id: versionId }, select: { fileUrl: true } });
  const s = detectSource(version?.fileUrl);
  if (!s || s.type !== "DRIVE_FILE" || !s.id) return new Response("No es un archivo de Drive", { status: 404 });

  // Endpoint de descarga directa que evita el interstitial de análisis de virus.
  const driveUrl = `https://drive.usercontent.google.com/download?id=${s.id}&export=download&confirm=t`;
  const range = req.headers.get("range") || undefined;

  let upstream: Response;
  try {
    upstream = await fetch(driveUrl, { headers: range ? { Range: range } : {}, redirect: "follow" });
  } catch {
    return new Response("No se pudo contactar con Drive", { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) return new Response("Drive rechazó la descarga", { status: 502 });

  const ctype = upstream.headers.get("content-type") || "";
  // Drive devuelve HTML cuando el archivo no es público o pide confirmación → no reproducible.
  if (ctype.includes("text/html")) return new Response("El archivo de Drive no es público", { status: 502 });

  const headers = new Headers();
  const disp = upstream.headers.get("content-disposition") || "";
  // Tipo de contenido reproducible: respeta el de Drive salvo octet-stream, donde
  // adivinamos por la extensión del nombre de archivo.
  let outType = ctype && !ctype.includes("octet-stream") ? ctype : guessVideoMime(disp);
  headers.set("content-type", outType || "video/mp4");
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=3600");

  return new Response(upstream.body, { status: upstream.status, headers });
}

function guessVideoMime(contentDisposition: string): string {
  const m = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  const name = m ? decodeURIComponent(m[1]).toLowerCase() : "";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".ogg") || name.endsWith(".ogv")) return "video/ogg";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".m4v")) return "video/x-m4v";
  return "video/mp4";
}
