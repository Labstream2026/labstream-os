import type { MetadataRoute } from "next";

// Manifest de la PWA. Junto con el service worker (public/sw.js) y los iconos, hace que
// Chrome/Edge muestren "Instalar" en la barra de direcciones y que en Android/iOS se pueda
// "Añadir a pantalla de inicio" con aspecto de app (sin barra del navegador).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Labstream OS",
    short_name: "Labstream",
    description: "Sistema operativo colaborativo para producción audiovisual de Labstream Studio.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    lang: "es",
    dir: "ltr",
    background_color: "#0b0b0e",
    theme_color: "#0b0b0e",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
