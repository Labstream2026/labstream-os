import { signFileToken } from "@/lib/storage";

// URLs de visualización de una foto de entregable (galería de selección del cliente).
// Una foto tiene dos fuentes posibles:
//   - LOCAL (fileAssetId): archivo en el NAS. Se sirve por /api/files-asset con token firmado;
//     sin `download` devuelve la miniatura WebP optimizada (ideal para la cuadrícula y el visor),
//     con `download=1` el original a resolución completa.
//   - ENLACE (url): imagen de Google Drive (u otra URL directa). Para Drive derivamos la URL del
//     endpoint `thumbnail` (sirve la imagen para archivos compartidos «cualquiera con el enlace»).
// El token de archivo se firma en el SERVIDOR y viaja embebido en la URL (mismo patrón que el
// video del portal de revisión), por eso estas funciones se llaman desde componentes de servidor.

export type PhotoLike = {
  fileAssetId: string | null;
  url: string | null;
};

const DRIVE_ID = /drive\.google\.com\/(?:file\/d\/|open\?id=|thumbnail\?id=|uc\?(?:[^#]*&)?id=)([\w-]+)/;

function driveId(url: string): string | null {
  const m = url.match(DRIVE_ID);
  return m ? m[1] : null;
}

// URL para mostrar la foto en <img> (cuadrícula y visor). Tamaño = lado largo sugerido para Drive.
export function photoViewSrc(p: PhotoLike, size = 1600): string {
  if (p.fileAssetId) return `/api/files-asset/${p.fileAssetId}?t=${signFileToken(p.fileAssetId)}`;
  const u = p.url ?? "";
  const id = driveId(u);
  if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
  return u; // URL directa de imagen
}

// URL de descarga del original a resolución completa.
export function photoDownloadSrc(p: PhotoLike): string {
  if (p.fileAssetId) return `/api/files-asset/${p.fileAssetId}?t=${signFileToken(p.fileAssetId)}&download=1`;
  const u = p.url ?? "";
  const id = driveId(u);
  if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  return u;
}
