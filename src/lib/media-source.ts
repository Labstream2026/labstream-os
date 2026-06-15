// Detección del tipo de fuente de un entregable a partir de su URL y construcción
// de la URL de incrustación (embed) adecuada. Puro: se usa en servidor y cliente.

export type SourceType = "YOUTUBE" | "VIMEO" | "DRIVE_FILE" | "DRIVE_FOLDER" | "MP4" | "IMAGE" | "OTHER";

export type MediaSource = {
  type: SourceType;
  url: string;
  embedUrl: string | null; // para iframe/video; null si solo se enlaza
  id: string | null;
  // ¿Permite leer el tiempo del reproductor para comentar por segundo?
  timecodeCapable: boolean;
};

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;

export function detectSource(rawUrl: string | null | undefined): MediaSource | null {
  const url = (rawUrl || "").trim();
  if (!url) return null;

  // YouTube
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  if (yt) {
    return { type: "YOUTUBE", url, id: yt[1], embedUrl: `https://www.youtube.com/embed/${yt[1]}?enablejsapi=1&rel=0`, timecodeCapable: true };
  }

  // Vimeo
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) {
    return { type: "VIMEO", url, id: vimeo[1], embedUrl: `https://player.vimeo.com/video/${vimeo[1]}`, timecodeCapable: true };
  }

  // Google Drive — carpeta
  const driveFolder = url.match(/drive\.google\.com\/drive\/folders\/([\w-]+)/);
  if (driveFolder) {
    return { type: "DRIVE_FOLDER", url, id: driveFolder[1], embedUrl: `https://drive.google.com/embeddedfolderview?id=${driveFolder[1]}#grid`, timecodeCapable: false };
  }

  // Google Drive — archivo
  const driveFile = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || url.match(/drive\.google\.com\/open\?id=([\w-]+)/);
  if (driveFile) {
    return { type: "DRIVE_FILE", url, id: driveFile[1], embedUrl: `https://drive.google.com/file/d/${driveFile[1]}/preview`, timecodeCapable: false };
  }

  // Archivo de video directo (MP4, etc.) — incluye los servidos por el propio NAS
  if (VIDEO_EXT.test(url) || /\/api\/files-asset\//.test(url)) {
    return { type: "MP4", url, id: null, embedUrl: url, timecodeCapable: true };
  }

  // Imagen
  if (IMAGE_EXT.test(url)) {
    return { type: "IMAGE", url, id: null, embedUrl: url, timecodeCapable: false };
  }

  return { type: "OTHER", url, id: null, embedUrl: null, timecodeCapable: false };
}

export const SOURCE_LABEL: Record<SourceType, string> = {
  YOUTUBE: "YouTube",
  VIMEO: "Vimeo",
  DRIVE_FILE: "Google Drive",
  DRIVE_FOLDER: "Carpeta de Drive",
  MP4: "Video",
  IMAGE: "Imagen",
  OTHER: "Enlace",
};
