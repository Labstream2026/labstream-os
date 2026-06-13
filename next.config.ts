import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida autocontenida para la imagen Docker del NAS.
  output: "standalone",
};

export default nextConfig;
