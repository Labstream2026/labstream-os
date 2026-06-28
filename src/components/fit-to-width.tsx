"use client";

import * as React from "react";

// Escala "ajustar al ancho" para contenido de ANCHO FIJO (la carta de cotización es A4 =
// 210mm ≈ 794px). En pantallas estrechas (móvil) reduce el documento para que quepa COMPLETO
// sin scroll horizontal ni recortes; en escritorio lo deja a tamaño real (tope 1×) y centrado.
// En impresión se desactiva: el navegador pagina el A4 por su cuenta (ver globals.css .quote-doc).
const A4_PX = 794; // 210mm a 96dpi

export function FitToWidth({ children }: { children: React.ReactNode }) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  const [height, setHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    const measure = () => {
      const avail = wrapRef.current?.clientWidth ?? A4_PX;
      const s = Math.min(1, avail / A4_PX);
      setScale(s);
      const natural = innerRef.current?.offsetHeight ?? 0;
      setHeight(natural ? Math.ceil(natural * s) : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="w-full overflow-hidden print:!h-auto print:overflow-visible" style={{ height: height ?? undefined }}>
      <div
        ref={innerRef}
        className="mx-auto origin-top-left print:!transform-none"
        style={{ transform: `scale(${scale})`, width: A4_PX }}
      >
        {children}
      </div>
    </div>
  );
}
