import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida autocontenida para la imagen Docker del NAS.
  output: "standalone",
  // undici se carga nativamente en runtime de servidor (CalDAV con cert auto-firmado);
  // no debe pasar por el bundler — Turbopack no resuelve sus require internos.
  serverExternalPackages: ["undici", "@higgsfield/client"],
  experimental: {
    // Subida de archivos por server actions: el límite por defecto es 1MB y rompía
    // la subida de documentos/vídeo. Se sube a 100MB.
    serverActions: { bodySizeLimit: "100mb" },
  },
  // Cabeceras de seguridad aplicadas a todas las rutas.
  // X-Frame-Options: SAMEORIGIN controla quién puede enmarcarnos A NOSOTROS (clickjacking),
  // no a quién enmarcamos nosotros; el editor OnlyOffice (iframe en mismo origen) sigue OK.
  // TODO: añadir una Content-Security-Policy en una pasada aparte y cuidadosa, con nonces.
  // El App Router de Next necesita scripts/estilos inline, así que una CSP mal puesta
  // rompería toda la app. No se añade aquí a propósito.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          // Desactiva APIs potentes que la app no usa (defensa en profundidad). NO se restringe
          // micrófono (notas de voz) ni cámara, para no romper funcionalidad existente.
          { key: "Permissions-Policy", value: "geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
