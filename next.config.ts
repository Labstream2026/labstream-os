import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida autocontenida para la imagen Docker del NAS.
  output: "standalone",
  // undici se carga nativamente en runtime de servidor (CalDAV con cert auto-firmado);
  // no debe pasar por el bundler — Turbopack no resuelve sus require internos.
  serverExternalPackages: ["undici"],
};

export default nextConfig;
