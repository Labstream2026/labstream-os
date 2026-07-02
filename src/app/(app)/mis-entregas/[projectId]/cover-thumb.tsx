"use client";

import * as React from "react";

// Miniatura de portada del reel en el dashboard del cliente. Si la imagen no carga (archivo
// ausente o enlace caído), se oculta y deja ver el ícono de reproducción de fondo — nunca una
// imagen rota. Va sobre la base (absolute inset-0) para tapar el ícono cuando sí carga.
export function CoverThumb({ src }: { src: string }) {
  const [ok, setOk] = React.useState(true);
  const ref = React.useRef<HTMLImageElement>(null);
  React.useEffect(() => {
    // Si la imagen ya falló antes de hidratar, onError no vuelve a dispararse: se comprueba al montar.
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setOk(false);
  }, []);
  if (!ok) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt=""
      onError={() => setOk(false)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
