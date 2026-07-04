import { db } from "@/lib/db";
import { verifyReviewMediaToken } from "@/lib/review-token";
import { resolveDriveMediaFile, guessDriveMime, fetchDriveDownload } from "@/lib/drive";

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

  const version = await db.deliverableVersion.findUnique({
    where: { id: versionId },
    select: { fileUrl: true, deliverable: { select: { reviewRevokedAt: true, reviewExpiresAt: true } } },
  });
  // El enlace de revisión pudo ser REVOCADO o CADUCAR: aunque el token siga válido por su
  // cuenta, no servimos el media si el equipo cerró el enlace (mismo criterio que el portal).
  const d = version?.deliverable;
  if (!version || !d || d.reviewRevokedAt || (d.reviewExpiresAt && d.reviewExpiresAt.getTime() < Date.now())) {
    return new Response("Enlace no disponible", { status: 403 });
  }
  // Resuelve el archivo concreto (si es una carpeta, busca el video/imagen dentro).
  const media = await resolveDriveMediaFile(version.fileUrl);
  if (!media) return new Response("No es un archivo de Drive", { status: 404 });

  // Descarga directa, resolviendo el interstitial de análisis de virus para archivos
  // grandes (masters de varias horas) y preservando Range para el seek.
  const range = req.headers.get("range") || undefined;

  let upstream: Response;
  try {
    upstream = await fetchDriveDownload(media.id, range);
  } catch {
    // Un fallo transitorio de conexión (masters pesados / red inestable) NO debe tirar al cliente
    // al iframe cross-origin de Google —donde no se puede capturar ni el fotograma ni el segundo—.
    // Reintenta UNA vez antes de rendirse. Solo cubre el establecimiento de la conexión (no rompe
    // el streaming: el cuerpo ya resuelto se transmite tal cual más abajo).
    try {
      await new Promise((r) => setTimeout(r, 400));
      upstream = await fetchDriveDownload(media.id, range);
    } catch {
      return new Response("No se pudo contactar con Drive", { status: 502 });
    }
  }
  if (!upstream.ok && upstream.status !== 206) return new Response("Drive rechazó la descarga", { status: 502 });

  const ctype = upstream.headers.get("content-type") || "";
  // Drive devuelve HTML cuando el archivo no es público o pide confirmación → no reproducible.
  if (ctype.includes("text/html")) return new Response("El archivo de Drive no es público", { status: 502 });

  const headers = new Headers();
  // Nombre para adivinar el tipo: el resuelto de la carpeta, o el de content-disposition.
  const dispName = (upstream.headers.get("content-disposition") || "").match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)?.[1];
  const name = media.name || (dispName ? decodeURIComponent(dispName) : "");
  // Tipo de contenido reproducible: respeta el de Drive salvo octet-stream, donde
  // adivinamos por la extensión del nombre de archivo.
  const outType = ctype && !ctype.includes("octet-stream") ? ctype : guessDriveMime(name);
  headers.set("content-type", outType || "video/mp4");
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=3600");

  return new Response(upstream.body, { status: upstream.status, headers });
}
