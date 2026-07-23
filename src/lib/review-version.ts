import type { StageVersion } from "@/components/review/review-stage";
import { signFileToken } from "@/lib/storage";
import { signReviewMediaToken } from "@/lib/review-token";
import { detectSource } from "@/lib/media-source";
import { resolveDriveMediaFile } from "@/lib/drive";
import { isProxyableVideo } from "@/lib/review-proxy";

// Construye las versiones que consume el escenario de revisión (player + comentarios),
// tanto en el portal del cliente como en la bandeja interna. Centraliza la lógica de
// fuentes: archivo subido, Drive (archivo o CARPETA → resuelve el video dentro),
// YouTube/Vimeo, MP4 directo, imagen. Async porque resolver una carpeta de Drive
// requiere leer su contenido.

const IMG = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;
const VID = /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i;

type VersionRow = {
  id: string;
  number: number;
  notes: string | null;
  fileUrl: string | null;
  // Copia de revisión 1080p generada por el servidor (null si no hay o aún se cocina).
  proxyRel: string | null;
  fileAsset: { id: string; name: string } | null;
};

export async function buildStageVersions(rows: VersionRow[]): Promise<StageVersion[]> {
  return Promise.all(rows.map(buildOne));
}

async function buildOne(v: VersionRow): Promise<StageVersion> {
  // 1) Archivo subido al NAS.
  if (v.fileAsset) {
    // Ventana de 12 h para el token del PLAYER: como el exp va cuantizado, el src queda
    // idéntico entre renders durante horas → el <video> no se recarga (ni se reinicia) cuando
    // una acción del servidor refresca la página a mitad de una sesión de revisión larga.
    const url = `/api/files-asset/${v.fileAsset.id}?t=${signFileToken(v.fileAsset.id, 12 * 3600)}`;
    const name = v.fileAsset.name;
    // Con proxy de revisión el archivo ES un video aunque su contenedor no se reproduzca
    // en el navegador (MKV, AVI…): el proxy MP4 sí, y eso lo vuelve reproducible.
    const isVideo = VID.test(name) || !!v.proxyRel;
    const kind = IMG.test(name) ? "image" : isVideo ? "video" : "other";
    // El player carga la copia de revisión si existe (mismo origen y mismo token →
    // las capturas de timecode/fotograma siguen funcionando); openUrl conserva el
    // ORIGINAL a calidad completa para abrir/descargar/entregar.
    const src = kind === "video" && v.proxyRel ? `${url}&proxy=1` : url;
    // Proxy EN COCINA: el archivo es transcodificable pero aún no tiene copia — un master
    // ProRes/HEVC/MKV puede NO reproducirse (ni capturarse) en el navegador hasta que esté.
    // La sala lo usa para avisarlo en vez de mostrar un player mudo.
    const proxyPending = !v.proxyRel && !IMG.test(name) && isProxyableVideo(name);
    return { number: v.number, notes: v.notes, kind, src, openUrl: url, fileName: name, timecodeCapable: kind === "video", proxyPending };
  }

  const s = detectSource(v.fileUrl);
  if (!s) return { number: v.number, notes: v.notes, kind: "none", src: null, openUrl: null, fileName: null, timecodeCapable: false };

  const proxySrc = `/api/review-media/${v.id}?t=${signReviewMediaToken(v.id)}`;

  // PROXY LOCAL cocinado para un master de DRIVE: review-media detecta proxyRel y sirve la
  // copia ligera local con Range → la pieza se comporta como un <video> del mismo origen
  // (captura garantizada, arranque instantáneo, y el NAS emite el peso del proxy, no el del
  // master). «Abrir original» sigue llevando al Drive.
  if (v.proxyRel && (s.type === "DRIVE_FILE" || s.type === "DRIVE_FOLDER")) {
    return { number: v.number, notes: v.notes, kind: "video", src: proxySrc, openUrl: s.url, fileName: null, timecodeCapable: true, proxyPending: false };
  }

  // 2) Carpeta de Drive: resuelve el video/imagen que contiene para reproducir y capturar
  // (en vez de incrustar la carpeta sin player).
  if (s.type === "DRIVE_FOLDER") {
    const media = await resolveDriveMediaFile(v.fileUrl);
    if (media?.isVideo) {
      return { number: v.number, notes: v.notes, kind: "drive_file", src: `https://drive.google.com/file/d/${media.id}/preview`, proxySrc, openUrl: v.fileUrl, fileName: media.name || null, timecodeCapable: true, proxyPending: true };
    }
    if (media) {
      // Imagen dentro de la carpeta → servida por el proxy (mismo origen → captura).
      return { number: v.number, notes: v.notes, kind: "image", src: proxySrc, proxySrc: null, openUrl: v.fileUrl, fileName: media.name || null, timecodeCapable: false };
    }
    // Carpeta sin medios reconocibles → incrusta la carpeta.
    return { number: v.number, notes: v.notes, kind: "drive_folder", src: s.embedUrl ?? s.url, openUrl: s.url, fileName: null, timecodeCapable: false };
  }

  // 3) Resto de fuentes.
  const kindMap: Record<string, StageVersion["kind"]> = {
    YOUTUBE: "youtube", VIMEO: "vimeo", DRIVE_FILE: "drive_file", DRIVE_FOLDER: "drive_folder", MP4: "video", IMAGE: "image", OTHER: "other",
  };
  const kind = kindMap[s.type] ?? "other";
  return {
    number: v.number,
    notes: v.notes,
    kind,
    src: s.embedUrl ?? s.url,
    proxySrc: s.type === "DRIVE_FILE" ? proxySrc : null,
    openUrl: s.url,
    fileName: null,
    timecodeCapable: s.timecodeCapable || kind === "drive_file",
    // Master de Drive sin copia ligera todavía: la sala avisa «en cocina».
    proxyPending: kind === "drive_file",
  };
}
