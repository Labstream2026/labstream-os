"use client";

import * as React from "react";
import { Logo } from "@/components/brand/logo";

// Tour de bienvenida de la sala de revisión (una sola vez por navegador): tres pasos
// sencillos — ver el material, comentar al segundo, dibujar. Tarjeta "glass" sobre la sala.
const TOUR_KEY = "review_tour_v1";

export function ReviewOnboarding({ isPhoto = false }: { isPhoto?: boolean }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) setOpen(true);
    } catch { /* sin localStorage */ }
  }, []);

  const close = () => {
    setOpen(false);
    try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* noop */ }
  };

  if (!open) return null;

  const steps = isPhoto
    ? [
        { n: 1, t: "Acá están tus fotos — recórrelas con calma" },
        { n: 2, t: "Marca ♥ las que te gustan y ✗ las que no" },
        { n: 3, t: "Al final, aprueba tu selección o pide cambios" },
      ]
    : [
        { n: 1, t: "Acá está tu video — reprodúcelo" },
        { n: 2, t: "Comenta con la burbuja 💬 — el segundo y el fotograma se guardan solos" },
        { n: 3, t: "Y si quieres, con ✏️ dibujas sobre la imagen" },
      ];

  return (
    // z-[80]: por ENCIMA del modo inmersivo (z-[60]) — en la primera visita móvil el tour se
    // ve sobre la pantalla completa y, al cerrarlo, el cliente ya queda dentro del reel.
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.07] p-6 shadow-2xl backdrop-blur-2xl">
        <Logo className="h-6" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">Así de fácil funciona 👋</h2>
        <div className="mt-4 space-y-3">
          {steps.map((s) => (
            <div key={s.n} className="flex items-center gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{s.n}</span>
              <span className="text-sm text-muted-foreground">{s.t}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={close}
          className="mt-6 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 active:scale-[0.99]"
        >
          Empezar a revisar
        </button>
      </div>
    </div>
  );
}
