import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida autocontenida para la imagen Docker del NAS.
  output: "standalone",
  // undici se carga nativamente en runtime de servidor (CalDAV con cert auto-firmado);
  // no debe pasar por el bundler — Turbopack no resuelve sus require internos.
  serverExternalPackages: ["undici"],
  experimental: {
    // Subida de archivos por server actions: el límite por defecto es 1MB y rompía
    // la subida de documentos/vídeo. Se sube a 100MB.
    serverActions: { bodySizeLimit: "100mb" },
  },
};

export default nextConfig;
