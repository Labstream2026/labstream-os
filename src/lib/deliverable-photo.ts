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

// MINIATURA para las cuadrículas (≈480 px) y VISTA para el visor/héroe (≈1600 px). Las dos van
// por el modo miniatura del servidor (`?thumb`): webp pequeño cacheado, caché privada del
// navegador y — clave — SIN auditar: abrir una galería de 80 fotos escribía 80 líneas de
// «abrió/descargó» en la actividad. La descarga del ORIGINAL (photoDownloadSrc) sí audita,
// que es la que cuenta como apertura de verdad.
export function photoThumbSrc(p: PhotoLike): string {
  if (p.fileAssetId) return `/api/files-asset/${p.fileAssetId}?t=${signFileToken(p.fileAssetId)}&thumb=1`;
  return photoViewSrc(p, 480);
}
export function photoLightboxSrc(p: PhotoLike): string {
  if (p.fileAssetId) return `/api/files-asset/${p.fileAssetId}?t=${signFileToken(p.fileAssetId)}&thumb=xl`;
  return photoViewSrc(p, 1600);
}

// La foto RAYADA por el cliente (JPEG aplanado del lienzo). El token firma «marca:<photoId>»
// para que la sala (sin sesión) la vea; el archivo vive en fotos-marcas/ del storage interno.
export function photoMarkSrc(photoId: string): string {
  return `/api/fotos/marca/${photoId}?t=${signFileToken(`marca:${photoId}`)}`;
}

// URL de descarga del original a resolución completa.
export function photoDownloadSrc(p: PhotoLike): string {
  if (p.fileAssetId) return `/api/files-asset/${p.fileAssetId}?t=${signFileToken(p.fileAssetId)}&download=1`;
  const u = p.url ?? "";
  const id = driveId(u);
  if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  return u;
}
