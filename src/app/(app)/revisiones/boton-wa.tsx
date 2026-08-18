"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { registrarEnvioPersonal } from "./[deliverableId]/enviar-actions";

// ── «Enviar por WhatsApp» desde el computador de cada quien ─────────────────
// Abre wa.me con el número del cliente y el mensaje ya escrito: la persona revisa y le da
// enviar EN SU WhatsApp — sale de su número, con su nombre. La app no puede saber si de
// verdad pulsó enviar (solo que abrió WhatsApp con el mensaje listo), así que sella el envío
// con esa reserva; si el cliente nunca abre el enlace, el chip de visitas lo delata.
//
// Es un <button> con window.open y no un <a>, a propósito: vive dentro del <Link> de la
// tarjeta y un ancla anidada en otra es HTML inválido — mismo patrón que «Copiar enlace».
export function BotonWa({ deliverableId, phone, href, className }: {
  deliverableId: string;
  phone: string;
  href: string;
  className?: string;
}) {
  const router = useRouter();
  const [sellado, setSellado] = React.useState(false);

  return (
    <button
      type="button"
      disabled={sellado}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.open(href, "_blank", "noopener");
        setSellado(true);
        void registrarEnvioPersonal(deliverableId, phone).then(() => router.refresh());
      }}
      title="Abre tu WhatsApp con el mensaje y el enlace ya escritos; tú le das enviar"
      className={`inline-flex items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-600/90 ${className ?? ""}`}
    >
      {sellado ? "Abierto en WhatsApp ✓" : "Enviar por WhatsApp"}
    </button>
  );
}
