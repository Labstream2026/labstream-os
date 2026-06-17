import type { StageVersion } from "@/components/review/review-stage";
import { signFileToken } from "@/lib/storage";
import { signReviewMediaToken } from "@/lib/review-token";
import { detectSource } from "@/lib/media-source";
import { resolveDriveMediaFile } from "@/lib/drive";

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
  fileAsset: { id: string; name: string } | null;
};

export async function buildStageVersions(rows: VersionRow[]): Promise<StageVersion[]> {
  return Promise.all(rows.map(buildOne));
}

async function buildOne(v: VersionRow): Promise<StageVersion> {
  // 1) Archivo subido al NAS.
  if (v.fileAsset) {
    const url = `/api/files-asset/${v.fileAsset.id}?t=${signFileToken(v.fileAsset.id)}`;
    const name = v.fileAsset.name;
    const kind = IMG.test(name) ? "image" : VID.test(name) ? "video" : "other";
    return { number: v.number, notes: v.notes, kind, src: url, openUrl: url, fileName: name, timecodeCapable: kind === "video" };
  }

  const s = detectSource(v.fileUrl);
  if (!s) return { number: v.number, notes: v.notes, kind: "none", src: null, openUrl: null, fileName: null, timecodeCapable: false };

  const proxySrc = `/api/review-media/${v.id}?t=${signReviewMediaToken(v.id)}`;

  // 2) Carpeta de Drive: resuelve el video/imagen que contiene para reproducir y capturar
  // (en vez de incrustar la carpeta sin player).
  if (s.type === "DRIVE_FOLDER") {
    const media = await resolveDriveMediaFile(v.fileUrl);
    if (media?.isVideo) {
      return { number: v.number, notes: v.notes, kind: "drive_file", src: `https://drive.google.com/file/d/${media.id}/preview`, proxySrc, openUrl: v.fileUrl, fileName: media.name || null, timecodeCapable: true };
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
  };
}
