import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { verifyReviewMediaToken } from "@/lib/review-token";
import { resolveDriveMediaFile, guessDriveMime, fetchDriveDownload, probeDriveAccess } from "@/lib/drive";
import { getCachedReview, startReviewCache, serveCachedReview, servePartialReview, reviewCacheProgressPct } from "@/lib/review-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── El video de Drive, servido por NUESTRO origen ──
// Toda pieza de Drive se reproduce por aquí, nunca por el iframe de Google. Es lo que permite
// que el reproductor LEA el segundo y el FOTOGRAMA (un iframe de otro origen no deja ninguna de
// las dos cosas), que es justo lo que se guarda en cada corrección.
//
// Tres caminos, en orden, y ninguno se rinde al iframe:
//   1) Copia completa en el NAS → se sirve de disco con Range (instantáneo, sin tocar Drive).
//   2) Copia a medio bajar → se sirven de disco los trozos que ya llegaron (servePartialReview).
//   3) Lo que falte → Drive en vivo con Range, mientras la copia termina en segundo plano.
// Autorización = token firmado por versión (no sesión), misma capability que /api/files-asset,
// para que funcione también en el portal del cliente.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params;
  const sp = new URL(req.url).searchParams;
  const t = sp.get("t") || "";
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

  const range = req.headers.get("range");

  // 1) Copia completa en el NAS.
  const cached = await getCachedReview(versionId);
  if (cached && sp.get("diag") !== "1") return serveCachedReview(cached, range);

  // Resuelve el archivo concreto (si es una carpeta, busca el video/imagen dentro).
  const media = await resolveDriveMediaFile(version.fileUrl);

  // ── DIAGNÓSTICO (?diag=1) ── Lo pide la sala SOLO cuando el reproductor ya falló, para decir
  // la verdad en vez de culpar siempre al formato. No sirve bytes ni dispara descargas: como
  // mucho le pregunta a Drive por UN byte. Va detrás del mismo token firmado que el video.
  if (sp.get("diag") === "1") {
    const di = (motivo: string, mensaje: string, consejo: string) =>
      Response.json({ motivo, mensaje, consejo }, { headers: { "cache-control": "no-store" } });

    if (!media) {
      return di("no_drive", "Este enlace no apunta a un archivo de Drive que la app sepa leer.",
        "Pega el enlace del ARCHIVO (no de la carpeta), o sube el video en «+ Versión».");
    }
    if (cached) {
      return di("formato", "El servidor sí tiene el video: la copia está completa en el NAS.",
        "Entonces es el formato — tu navegador no sabe decodificar este contenedor (ProRes, MKV, HEVC de 10 bits). Sube un export H.264 como nueva versión y podrás comentar con el segundo y la captura.");
    }
    const pct = await reviewCacheProgressPct(versionId);
    if (pct != null) {
      return di("copiando", `La copia se está trayendo de Drive al NAS (va por el ${pct} %).`,
        "Dale unos segundos y pulsa «↻ Reintentar»: en cuanto termine, todo sale del NAS al instante.");
    }

    const probe = await probeDriveAccess(media.id);
    if (probe.ok) {
      return di("formato", `El servidor sí puede leer el archivo en Drive (por ${probe.via === "cuenta" ? "la cuenta de servicio" : "el enlace público"}).`,
        "El problema es el formato: tu navegador no decodifica este contenedor. Sube un export H.264 como nueva versión.");
    }
    if (probe.causa === "red") {
      return di("red", "No se pudo contactar con Google Drive en este momento.",
        "Suele ser pasajero: pulsa «↻ Reintentar» en unos segundos.");
    }
    if (probe.causa === "cuota") {
      return di("cuota", "Google bloqueó las descargas de este archivo por superar su cupo diario.",
        probe.conCuenta
          ? "Se libera solo en unas horas. Mientras tanto, sube el video al NAS en «+ Versión»."
          : "Le pasa a los enlaces anónimos. La solución de fondo es configurar la cuenta de servicio de Google (GOOGLE_SERVICE_ACCOUNT_JSON): el cupo deja de ser por archivo.");
    }
    return di("sin_permiso", "El servidor no tiene permiso para leer este archivo de Drive (tú sí lo ves porque tu navegador está dentro de tu cuenta de Google).",
      probe.conCuenta
        ? "Compártelo como «Cualquiera con el enlace», o con el correo de la cuenta de servicio de la app."
        : "Compártelo como «Cualquiera con el enlace». Y para que también funcionen los archivos privados, configura la cuenta de servicio de Google (GOOGLE_SERVICE_ACCOUNT_JSON).");
  }

  if (!media) return new Response("No es un archivo de Drive", { status: 404 });

  // 2) Copia a medio bajar: los trozos que ya están en disco se sirven de ahí. Además, arranca la
  // copia si aún no había empezado — sin esperarla, para que el video se vea YA.
  startReviewCache(versionId, media.id, media.name);
  const partial = await servePartialReview(versionId, range);
  if (partial) return partial;

  // 3) Drive en vivo, preservando Range para el seek y resolviendo el interstitial de análisis de
  // virus de los archivos grandes. Un fallo transitorio de conexión NO puede dejar la sala sin
  // video (ahí se pierden el segundo y la captura), así que se reintenta una vez.
  let upstream: Response;
  try {
    upstream = await fetchDriveDownload(media.id, range || undefined);
  } catch {
    try {
      await new Promise((r) => setTimeout(r, 400));
      upstream = await fetchDriveDownload(media.id, range || undefined);
    } catch {
      return new Response("No se pudo contactar con Drive", { status: 502 });
    }
  }
  if (!upstream.ok && upstream.status !== 206) return new Response("Drive rechazó la descarga", { status: 502 });

  const ctype = upstream.headers.get("content-type") || "";
  // Drive devuelve HTML cuando el archivo no es público o pide confirmación → no reproducible.
  if (ctype.includes("text/html")) {
    await upstream.body?.cancel().catch(() => {});
    return new Response("El archivo de Drive no es público", { status: 502 });
  }

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
  // Sin caché de navegador: la copia del NAS está a punto de existir y es la buena. Cachear estos
  // trozos "en vivo" haría que el <video> siguiera pidiéndole a Google lo que ya está en casa.
  headers.set("cache-control", "private, no-store");
  headers.set("x-review-cache", "live");

  return new Response(upstream.body, { status: upstream.status, headers });
}
