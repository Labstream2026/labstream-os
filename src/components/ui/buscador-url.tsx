"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BuscadorBarra } from "@/components/ui/barra-menu";

// Buscador de barra que guarda lo escrito en la URL (?q=…), para pantallas que filtran en el
// SERVIDOR. Así el enlace lleva la búsqueda puesta (extra 6) y una vista guardada puede incluirla.
// Con debounce para no navegar en cada tecla — el mismo criterio que ya usa el buscador de tareas.
export function BuscadorUrl({
  clave = "q",
  placeholder = "Buscar",
  tecla = "/",
  espera = 350,
  className,
}: {
  clave?: string;
  placeholder?: string;
  tecla?: string | null;
  espera?: number;
  // Para ajustar el ancho de partida (`basis-*`) en barras apretadas: es ese ancho, y no el que
  // acaba teniendo, el que decide si la barra se parte en dos filas.
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const enUrl = sp.get(clave) ?? "";

  const [texto, setTexto] = React.useState(enUrl);
  // Si la URL cambia por fuera (una vista guardada, el botón atrás), el campo la sigue. Se ajusta
  // DURANTE el render —el patrón «ajustar estado cuando cambia una prop» de react.dev— en vez de
  // en un efecto, que provocaría un render en cascada por cada navegación.
  const [urlBase, setUrlBase] = React.useState(enUrl);
  if (urlBase !== enUrl) {
    setUrlBase(enUrl);
    setTexto(enUrl);
  }

  React.useEffect(() => {
    if (texto === enUrl) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (texto) params.set(clave, texto);
      else params.delete(clave);
      const s = params.toString();
      router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
    }, espera);
    return () => clearTimeout(t);
    // `sp`/`router`/`pathname` no entran a propósito: solo se navega cuando cambia lo ESCRITO.
    // Incluirlos volvería a lanzar el temporizador con cada navegación y se comería el debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, enUrl, clave, espera]);

  return <BuscadorBarra value={texto} onChange={setTexto} placeholder={placeholder} tecla={tecla} className={className} />;
}
