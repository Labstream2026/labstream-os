import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { absPath, STORAGE_DIR } from "@/lib/storage";

// ── Retirada de los proxies de revisión ──
//
// La sala reproducía una copia H.264 transcodificada con ffmpeg («proxy»). Se quitó: mientras la
// copia se cocinaba, la pieza caía al visor de Google y ahí NO se puede leer ni el segundo ni el
// fotograma —justo lo que se guarda en cada corrección—, y si ffmpeg fallaba en el NAS la pieza
// se quedaba en ese limbo para siempre. Ahora todo se reproduce por /api/review-media (mismo
// origen, con Range) contra el archivo REAL, así que la captura no depende de nada más.
//
// Este barrido limpia lo que dejó aquel sistema: borra del NAS los proxies ya cocinados y pone a
// null la columna que los apuntaba. Es idempotente y se agota solo — cuando devuelve 0 no vuelve
// a hacer trabajo. Los ORIGINALES no se tocan (siguen en Drive o en el NAS).
const DRIVE_PROXY_DIR = "drive-proxy";

export async function purgeLegacyReviewProxies(limit = 40): Promise<{ purged: number }> {
  const rows = await db.deliverableVersion.findMany({
    where: { proxyRel: { not: null } },
    take: limit,
    select: { id: true, proxyRel: true },
  });
  let purged = 0;
  for (const v of rows) {
    if (!v.proxyRel) continue;
    await fs.rm(absPath(v.proxyRel), { force: true }).catch(() => {});
    // La columna se limpia SIEMPRE, aunque el archivo ya no estuviera: lo que importa es que
    // ninguna versión siga apuntando a una copia que ya nadie sirve.
    await db.deliverableVersion.update({ where: { id: v.id }, data: { proxyRel: null } }).catch(() => {});
    purged += 1;
  }
  // Última pasada (quedaron menos filas que el tope): retira la carpeta de los proxies de Drive
  // con lo que hubiera quedado huérfano dentro.
  if (rows.length < limit) {
    await fs.rm(path.join(STORAGE_DIR, DRIVE_PROXY_DIR), { recursive: true, force: true }).catch(() => {});
  }
  if (purged) console.log(`[review-proxy] retirados ${purged} proxies antiguos (la sala reproduce el original)`);
  return { purged };
}
