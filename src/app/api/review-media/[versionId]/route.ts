import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { verifyReviewMediaToken } from "@/lib/review-token";
import { resolveDriveMediaFile, guessDriveMime, fetchDriveDownload } from "@/lib/drive";
import { getCachedReview, ensureReviewCached, serveCachedReview } from "@/lib/review-cache";

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
    select: {
      fileUrl: true,
      deliverable: {
        select: {
          reviewRevokedAt: true,
          reviewExpiresAt: true,
          // Acceso del EQUIPO al proyecto (para no bloquearle la pre-aprobación por la caducidad
          // del enlace del CLIENTE).
          project: { select: { isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } } },
        },
      },
    },
  });
  const d = version?.deliverable;
  if (!version || !d) return new Response("Enlace no disponible", { status: 403 });
  // El EQUIPO (sesión con acceso al proyecto) SIEMPRE puede ver el media para la pre-aprobación
  // interna, aunque el enlace del CLIENTE haya sido REVOCADO o CADUCADO —esa caducidad/revocación
  // corta el acceso del cliente, NO el del equipo—. Antes se bloqueaba a todos por igual, así que
  // al vencer un enlace la captura de Drive dejaba de funcionar también para el equipo.
  const session = await getSession();
  const isTeam = !!session && canAccessProject(d.project, session);
  if (!isTeam && (d.reviewRevokedAt || (d.reviewExpiresAt && d.reviewExpiresAt.getTime() < Date.now()))) {
    return new Response("Enlace no disponible", { status: 403 });
  }
  // Resuelve el archivo concreto (si es una carpeta, busca el video/imagen dentro).
  const media = await resolveDriveMediaFile(version.fileUrl);
  if (!media) return new Response("No es un archivo de Drive", { status: 404 });

  // CACHÉ DEL NAS: si ya bajamos este video antes, se sirve desde disco (rápido, con Range) y NO
  // se vuelve a tocar Drive → así deja de agotarse la cuota de descargas anónimas de Google (la
  // causa del 502 que dejaba el <video> sin cargar, sin segundo ni captura de fotograma).
  const cached = await getCachedReview(versionId);
  if (cached) return serveCachedReview(cached, req.headers.get("range"));
  // Sin caché aún: cachea UNA vez (deduplicando visitas simultáneas, con enfriamiento tras fallo).
  // Espera un poco: si el video es liviano se sirve YA desde el NAS con una sola descarga de Drive;
  // si tarda más, la descarga sigue en segundo plano y esta petición cae al proxy en vivo (previo).
  const justCached = await Promise.race([
    ensureReviewCached(versionId, media.id, media.name),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
  if (justCached) return serveCachedReview(justCached, req.headers.get("range"));

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
