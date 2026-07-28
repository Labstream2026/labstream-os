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
//
// REGLA DE ORO: si la pieza está en Drive, se reproduce por /api/review-media (nuestro origen),
// NUNCA por el iframe de Google. Es lo único que permite guardar el segundo y la captura del
// fotograma en cada corrección; el visor de Google queda como salida manual, jamás automática.

const IMG = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;
// Incluye contenedores que el navegador puede NO decodificar (MKV, AVI, MXF, MTS…): aun así son
// VIDEO. Tratarlos como «otro» los metía en un iframe que no reproduce nada y no explica nada;
// como video, el reproductor lo intenta y, si no puede, sale la tarjeta que dice qué hacer.
const VID = /\.(mp4|webm|mov|m4v|ogg|ogv|mkv|avi|wmv|mts|m2ts|mxf|mpe?g)(\?|#|$)/i;

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
  // 1) Archivo subido al NAS: se sirve tal cual, con Range y del mismo origen → segundo y
  // captura garantizados.
  if (v.fileAsset) {
    // Ventana de 12 h para el token del PLAYER: como el exp va cuantizado, el src queda
    // idéntico entre renders durante horas → el <video> no se recarga (ni se reinicia) cuando
    // una acción del servidor refresca la página a mitad de una sesión de revisión larga.
    const url = `/api/files-asset/${v.fileAsset.id}?t=${signFileToken(v.fileAsset.id, 12 * 3600)}`;
    const name = v.fileAsset.name;
    const kind = IMG.test(name) ? "image" : VID.test(name) ? "video" : "other";
    return { number: v.number, notes: v.notes, kind, src: url, openUrl: url, fileName: name, timecodeCapable: kind === "video" };
  }

  const s = detectSource(v.fileUrl);
  if (!s) return { number: v.number, notes: v.notes, kind: "none", src: null, openUrl: null, fileName: null, timecodeCapable: false };

  // El video de Drive, servido por nosotros (con Range): un <video> normal y corriente para el
  // reproductor, con todo lo que eso permite (segundo, captura, velocidad, marcadores).
  const mediaSrc = `/api/review-media/${v.id}?t=${signReviewMediaToken(v.id)}`;

  // 2) ARCHIVO de Drive.
  if (s.type === "DRIVE_FILE") {
    return {
      number: v.number,
      notes: v.notes,
      kind: "video",
      src: mediaSrc,
      openUrl: s.url,
      fileName: null,
      timecodeCapable: true,
      // Salida manual si el navegador no sabe decodificar ese contenedor (ProRes, MKV…):
      // se ve, pero sin captura. Nunca se entra aquí solo.
      googleViewUrl: s.embedUrl,
    };
  }

  // 3) CARPETA de Drive: resuelve el video/imagen que contiene, para reproducir y capturar
  // (en vez de incrustar la carpeta sin player).
  if (s.type === "DRIVE_FOLDER") {
    const media = await resolveDriveMediaFile(v.fileUrl);
    if (media?.isVideo) {
      return {
        number: v.number,
        notes: v.notes,
        kind: "video",
        src: mediaSrc,
        openUrl: v.fileUrl,
        fileName: media.name || null,
        timecodeCapable: true,
        googleViewUrl: `https://drive.google.com/file/d/${media.id}/preview`,
      };
    }
    if (media) {
      // Imagen dentro de la carpeta → servida por nuestra ruta (mismo origen → captura).
      return { number: v.number, notes: v.notes, kind: "image", src: mediaSrc, openUrl: v.fileUrl, fileName: media.name || null, timecodeCapable: false };
    }
    // Carpeta sin medios reconocibles → incrusta la carpeta.
    return { number: v.number, notes: v.notes, kind: "drive_folder", src: s.embedUrl ?? s.url, openUrl: s.url, fileName: null, timecodeCapable: false };
  }

  // 4) Resto de fuentes.
  const kindMap: Record<string, StageVersion["kind"]> = {
    YOUTUBE: "youtube", VIMEO: "vimeo", DRIVE_FILE: "video", DRIVE_FOLDER: "drive_folder", MP4: "video", IMAGE: "image", OTHER: "other",
  };
  const kind = kindMap[s.type] ?? "other";
  return {
    number: v.number,
    notes: v.notes,
    kind,
    src: s.embedUrl ?? s.url,
    openUrl: s.url,
    fileName: null,
    timecodeCapable: s.timecodeCapable,
  };
}
