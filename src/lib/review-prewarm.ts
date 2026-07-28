import { db } from "@/lib/db";
import { resolveDriveMediaFile } from "@/lib/drive";
import { getCachedReview, startReviewCache } from "@/lib/review-cache";

// ── Traer la copia ANTES de que alguien la pida ──
//
// La sala de revisión reproduce los videos de Drive desde una copia local en el NAS: es lo que
// hace que el segundo y la captura del fotograma vayan al instante. Esa copia se traía cuando
// el PRIMER revisor abría la pieza, así que era él quien pagaba la espera — y quien más
// papeletas tenía de tropezar con una red lenta o un master pesado.
//
// Ahora la copia arranca en cuanto se registra la versión (que es cuando el editor pega el
// enlace, con tiempo de sobra antes de que nadie la revise) y un barrido del cron recoge lo que
// se quedara atrás: reinicios del contenedor, versiones creadas por la API, o piezas que se
// reabren. Todo best-effort y sin bloquear a nadie.

// Estados en los que la pieza SE ESTÁ revisando. Aprobado/entregado no: su copia se purga sola.
const ACTIVE_STATES = ["PENDIENTE", "EN_PRODUCCION", "EN_EDICION", "REVISION_INTERNA", "ENVIADO_CLIENTE", "CORRECCIONES"] as const;

// Dispara la copia sin esperarla ni lanzar. Se llama justo después de crear una versión.
export function prewarmReviewCopy(versionId: string, fileUrl: string | null | undefined): void {
  if (!fileUrl) return;
  void (async () => {
    if (await getCachedReview(versionId)) return;
    const media = await resolveDriveMediaFile(fileUrl);
    if (media) startReviewCache(versionId, media.id, media.name);
  })().catch(() => {});
}

// Barrido: versiones de piezas EN revisión, con enlace y sin copia todavía. `limit` bajo a
// propósito — cada una se lleva una descarga entera de Drive y el NAS comparte CPU con Postgres.
export async function sweepReviewPrewarm(limit = 2): Promise<{ arrancadas: number }> {
  const candidatas = await db.deliverableVersion.findMany({
    where: {
      fileUrl: { not: null },
      fileAssetId: null,
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      deliverable: { status: { in: [...ACTIVE_STATES] } },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, fileUrl: true },
  });

  let arrancadas = 0;
  for (const v of candidatas) {
    if (arrancadas >= limit) break;
    if (await getCachedReview(v.id)) continue; // ya está copiada
    const media = await resolveDriveMediaFile(v.fileUrl).catch(() => null);
    if (!media) continue; // no es Drive, o la carpeta no tiene medios reconocibles
    startReviewCache(v.id, media.id, media.name);
    arrancadas += 1;
  }
  if (arrancadas) console.log(`[review-cache] precalentando ${arrancadas} copias de revisión`);
  return { arrancadas };
}
