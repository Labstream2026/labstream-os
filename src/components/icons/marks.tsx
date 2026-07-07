import * as React from "react";
import { cn } from "@/lib/utils";
import { C, SW, Icon, type IconProps } from "@/components/icons";

// ── Marcas Labstream: íconos de SECTOR (clientes) y de TIPO DE PROYECTO ──
// Mismo lenguaje visual que el set de secciones (duotono vívido + naranja de marca, trazo
// redondeado del logo). Se guardan en el MISMO campo `emoji` de Cliente/Proyecto como token
// "ls:<clave>" — sin migración de BD y compatible con los emojis ya guardados.
//
// Render: <EntityEmoji value={x.emoji} /> pinta el ícono si es token, o el emoji tal cual.
// Contextos de SOLO texto (títulos de chat, líneas del calendario): emojiToText(value) devuelve
// el emoji de respaldo del ícono, para que nunca se vea el token crudo.

export const LS_PREFIX = "ls:";

export type LsMark = {
  key: string;
  label: string;
  k: string; // palabras clave en español para el buscador del picker
  fb: string; // emoji de respaldo para contextos de solo texto
  Icon: (p: IconProps) => React.ReactElement;
};

/* ═══════════════ Sectores (clientes) ═══════════════ */

// Moda — vestido (rosa) con cinturón naranja.
function MkModa(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9.3 4.6 12 6.1l2.7-1.5.9 4.1c1.7 2.7 2.6 5.7 2.9 8.9H5.5c.3-3.2 1.2-6.2 2.9-8.9l.9-4.1Z" fill={C.rose} fillOpacity={0.16} stroke={C.rose} strokeWidth={SW} />
      <path d="M10.4 4.9c.4.8.9 1.2 1.6 1.2s1.2-.4 1.6-1.2" stroke={C.rose} strokeWidth={1.4} />
      <path d="M8.3 8.9h7.4" stroke={C.orange} strokeWidth={1.7} />
    </Icon>
  );
}

// Salud / medicina — corazón (coral) con línea de pulso naranja.
function MkSalud(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 19.6C8.2 17 5.2 14.2 4.3 11.2 3.5 8.5 5.3 6 7.9 6c1.7 0 3.1.9 4.1 2.5C13 6.9 14.4 6 16.1 6c2.6 0 4.4 2.5 3.6 5.2-.9 3-3.9 5.8-7.7 8.4Z" fill={C.coral} fillOpacity={0.16} stroke={C.coral} strokeWidth={SW} />
      <path d="M7.6 12h2.1l1.1-2.1 1.9 4.2 1.2-2.1h2.5" stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Legal / abogados — balanza (índigo) con fiel naranja.
function MkLegal(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 6v11.4M9.4 20.5h5.2" stroke={C.indigo} strokeWidth={SW} />
      <path d="M5.8 7.5h12.4" stroke={C.indigo} strokeWidth={SW} />
      <path d="M5.8 7.5 3.6 12.2M5.8 7.5 8 12.2M18.2 7.5 16 12.2M18.2 7.5l2.2 4.7" stroke={C.indigo} strokeWidth={1.3} />
      <path d="M3.2 12.4a2.6 2.6 0 0 0 5.2 0Z" fill={C.indigo} fillOpacity={0.16} stroke={C.indigo} strokeWidth={1.5} />
      <path d="M15.6 12.4a2.6 2.6 0 0 0 5.2 0Z" fill={C.indigo} fillOpacity={0.16} stroke={C.indigo} strokeWidth={1.5} />
      <circle cx="12" cy="4.6" r="1.3" fill={C.orange} />
    </Icon>
  );
}

// Ingeniería / construcción — casco de obra (celeste) con franja naranja.
function MkIngenieria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4.6 15.4v-1.2c0-4.4 3.2-7.7 7.4-7.7s7.4 3.3 7.4 7.7v1.2" fill={C.sky} fillOpacity={0.16} stroke={C.sky} strokeWidth={SW} />
      <path d="M3.2 15.4h17.6" stroke={C.sky} strokeWidth={SW} />
      <path d="M10.8 6.6c.4-.1.8-.1 1.2-.1s.8 0 1.2.1v4.7h-2.4V6.6Z" fill={C.orange} fillOpacity={0.9} />
    </Icon>
  );
}

// Tecnología — chip (azul) con núcleo naranja.
function MkTecnologia(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={SW} />
      <rect x="10.1" y="10.1" width="3.8" height="3.8" rx="1" fill={C.orange} />
      <path d="M9 6.5V4.2M12 6.5V4.2M15 6.5V4.2M9 19.8v-2.3M12 19.8v-2.3M15 19.8v-2.3M6.5 9H4.2M6.5 12H4.2M6.5 15H4.2M19.8 9h-2.3M19.8 12h-2.3M19.8 15h-2.3" stroke={C.blue} strokeWidth={1.5} />
    </Icon>
  );
}

// Gastronomía — cloche (ámbar) con pomo naranja.
function MkGastronomia(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4.5 16.3a7.5 7.5 0 0 1 15 0" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={SW} />
      <path d="M3.4 16.3h17.2" stroke={C.amber} strokeWidth={SW} />
      <circle cx="12" cy="7.4" r="1.2" fill={C.orange} />
      <path d="M8.2 12.6c.5-1.5 1.6-2.6 3-3" stroke={C.amber} strokeWidth={1.3} />
    </Icon>
  );
}

// Educación — birrete (violeta) con borla naranja.
function MkEducacion(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 4.8 21 9l-9 4.2L3 9l9-4.2Z" fill={C.violet} fillOpacity={0.16} stroke={C.violet} strokeWidth={SW} />
      <path d="M7 11.1v3.5c0 1.6 2.2 3 5 3s5-1.4 5-3v-3.5" stroke={C.violet} strokeWidth={SW} />
      <path d="M21 9v4.4" stroke={C.orange} strokeWidth={1.6} />
      <circle cx="21" cy="14.6" r="1.1" fill={C.orange} />
    </Icon>
  );
}

// Finanzas / banca — banco (verde) con moneda naranja en el frontón.
function MkFinanzas(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.8 9.6 12 4.4l8.2 5.2H3.8Z" fill={C.green} fillOpacity={0.14} stroke={C.green} strokeWidth={SW} />
      <path d="M6 12.2v5M10 12.2v5M14 12.2v5M18 12.2v5" stroke={C.green} strokeWidth={SW} />
      <path d="M4 20.2h16" stroke={C.green} strokeWidth={SW} />
      <circle cx="12" cy="7.6" r="1" fill={C.orange} />
    </Icon>
  );
}

// Inmobiliaria — dos edificios (teal) con ventanas naranjas.
function MkInmobiliaria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 20V7.2c0-.4.3-.7.7-.7h5.1c.4 0 .7.3.7.7V20" fill={C.teal} fillOpacity={0.14} stroke={C.teal} strokeWidth={SW} />
      <path d="M11.5 20v-8.6c0-.4.3-.7.7-.7h6.1c.4 0 .7.3.7.7V20" fill={C.teal} fillOpacity={0.14} stroke={C.teal} strokeWidth={SW} />
      <circle cx="7.3" cy="9.7" r="0.8" fill={C.orange} />
      <circle cx="9.4" cy="9.7" r="0.8" fill={C.orange} />
      <circle cx="7.3" cy="12.8" r="0.8" fill={C.orange} />
      <circle cx="9.4" cy="12.8" r="0.8" fill={C.orange} />
      <path d="M14 13.8h2.6M14 16.4h2.6" stroke={C.teal} strokeWidth={1.4} />
      <path d="M3.4 20h17.2" stroke={C.teal} strokeWidth={SW} />
    </Icon>
  );
}

// Retail / comercio — bolsa de compras (azul) con asa naranja.
function MkRetail(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6.2 8.6h11.6l-.9 9.5a2 2 0 0 1-2 1.9H9.1a2 2 0 0 1-2-1.9l-.9-9.5Z" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={SW} />
      <path d="M9 8.6V7.1a3 3 0 0 1 6 0v1.5" stroke={C.orange} strokeWidth={SW} />
      <circle cx="12" cy="14.2" r="1.2" fill={C.orange} />
    </Icon>
  );
}

// Belleza / estética — labial (rosa) con barra naranja y destello.
function MkBelleza(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="8.8" y="13" width="6.4" height="6.6" rx="1.2" fill={C.rose} fillOpacity={0.16} stroke={C.rose} strokeWidth={SW} />
      <path d="M10.4 13V8.3c0-1.3 1-2.4 2.3-2.4.8 0 1.7 1 1.7 2.4V13" fill={C.orange} fillOpacity={0.85} stroke={C.orange} strokeWidth={1.4} />
      <path d="m18.6 5.4.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z" fill={C.rose} />
    </Icon>
  );
}

// Deporte / fitness — balón (verde) con pentágono naranja.
function MkDeporte(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="7.6" fill={C.green} fillOpacity={0.14} stroke={C.green} strokeWidth={SW} />
      <path d="m12 8.5 2.7 2-1 3.2h-3.4l-1-3.2 2.7-2Z" fill={C.orange} />
      <path d="M12 8.5V4.4M14.7 10.5l3.9-1.3M13.7 13.7l2.4 3.2M10.3 13.7l-2.4 3.2M9.3 10.5 5.4 9.2" stroke={C.green} strokeWidth={1.4} />
    </Icon>
  );
}

// Turismo / hotelería — avión de papel (celeste) con sol naranja.
function MkTurismo(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="5.3" cy="5.3" r="1.9" fill={C.orange} fillOpacity={0.9} />
      <path d="M20.6 6.4 4.9 12.1l5.3 1.9.8 4.8 2.8-3.3 4 1.9 2.8-11Z" fill={C.sky} fillOpacity={0.16} stroke={C.sky} strokeWidth={SW} />
      <path d="m10.2 14 10.4-7.6" stroke={C.sky} strokeWidth={1.3} />
    </Icon>
  );
}

// Automotriz — carro (azul) con ruedas naranjas.
function MkAutomotriz(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 15.6v-1.8c0-1.1.7-2 1.8-2.3l2.1-.5 1.6-2.6c.5-.8 1.3-1.2 2.2-1.2h2.6c.9 0 1.7.4 2.2 1.2l1.6 2.6 2.1.5c1.1.3 1.8 1.2 1.8 2.3v1.8H4Z" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={SW} />
      <circle cx="7.6" cy="16.2" r="1.9" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.6} />
      <circle cx="16.4" cy="16.2" r="1.9" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.6} />
      <path d="M10.2 8.7 9 11h6l-1.2-2.3" stroke={C.blue} strokeWidth={1.2} />
    </Icon>
  );
}

// Agro / campo — brote (verde) con sol naranja.
function MkAgro(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 19.8v-6.6" stroke={C.green} strokeWidth={SW} />
      <path d="M12 13.4C12 10 9.6 7.9 6.1 7.9c0 3.5 2.4 5.5 5.9 5.5Z" fill={C.green} fillOpacity={0.16} stroke={C.green} strokeWidth={SW} />
      <path d="M12 11.7c0-2.9 2.1-4.9 5.3-4.9 0 3.1-2.1 4.9-5.3 4.9Z" fill={C.green} fillOpacity={0.16} stroke={C.green} strokeWidth={SW} />
      <path d="M7 19.8h10" stroke={C.green} strokeWidth={SW} />
      <circle cx="19.3" cy="4.9" r="1.7" fill={C.orange} fillOpacity={0.9} />
    </Icon>
  );
}

// Medios / prensa — torre de transmisión (índigo) con señal naranja.
function MkMedios(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 10 8.4 19.6h7.2L12 10Z" fill={C.indigo} fillOpacity={0.14} stroke={C.indigo} strokeWidth={SW} />
      <circle cx="12" cy="7.9" r="1.2" fill={C.orange} />
      <path d="M9.4 6.4a3.7 3.7 0 0 1 5.2 0" stroke={C.orange} strokeWidth={1.5} />
      <path d="M7.3 4.3a6.6 6.6 0 0 1 9.4 0" stroke={C.indigo} strokeWidth={1.5} />
    </Icon>
  );
}

/* ═══════════════ Tipos de proyecto (lo que hace Labstream) ═══════════════ */

// Fotografía — cámara (violeta) con lente naranja.
function MkFotografia(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8.6 7.6l1-2.1c.2-.5.7-.7 1.1-.7h2.6c.4 0 .9.2 1.1.7l1 2.1" stroke={C.violet} strokeWidth={SW} />
      <rect x="3.5" y="7.6" width="17" height="11.4" rx="2.5" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <circle cx="12" cy="13.2" r="3.4" fill={C.orange} fillOpacity={0.18} stroke={C.orange} strokeWidth={1.7} />
      <circle cx="12" cy="13.2" r="1.2" fill={C.orange} />
      <circle cx="17.7" cy="10.4" r="0.9" fill={C.violet} />
    </Icon>
  );
}

// Video — videocámara (coral) con testigo REC naranja.
function MkVideo(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3" y="7.8" width="12.6" height="9.4" rx="2" fill={C.coral} fillOpacity={0.14} stroke={C.coral} strokeWidth={SW} />
      <path d="m15.6 11.4 5-2.3v6.8l-5-2.3" fill={C.coral} fillOpacity={0.14} stroke={C.coral} strokeWidth={SW} />
      <circle cx="7.2" cy="11.4" r="1.2" fill={C.orange} />
    </Icon>
  );
}

// Redes sociales — burbuja (celeste) con corazón naranja.
function MkRedes(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M20 6.8v7.4a2.8 2.8 0 0 1-2.8 2.8h-6.9L6 20.4v-3.4h-.2A2.8 2.8 0 0 1 3 14.2V6.8A2.8 2.8 0 0 1 5.8 4h11.4A2.8 2.8 0 0 1 20 6.8Z" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={SW} />
      <path d="M11.5 13.5c-1.9-1.3-3.2-2.5-3.2-3.9 0-1 .8-1.8 1.7-1.8.6 0 1.1.3 1.5.9.4-.6.9-.9 1.5-.9.9 0 1.7.8 1.7 1.8 0 1.4-1.3 2.6-3.2 3.9Z" fill={C.orange} />
    </Icon>
  );
}

// Marketing — diana (verde) con flecha naranja al centro.
function MkMarketing(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="11" cy="13" r="6.6" fill={C.green} fillOpacity={0.12} stroke={C.green} strokeWidth={SW} />
      <circle cx="11" cy="13" r="3.2" stroke={C.green} strokeWidth={1.5} />
      <circle cx="11" cy="13" r="1" fill={C.green} />
      <path d="M11 13l7.4-7.4" stroke={C.orange} strokeWidth={1.8} />
      <path d="M18.4 5.6l.3-2.6M18.4 5.6l2.6-.3" stroke={C.orange} strokeWidth={1.8} />
    </Icon>
  );
}

// Branding / diseño — paleta (rosa) con gotas de color.
function MkBranding(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3.9c-4.7 0-8.4 3.5-8.4 7.9 0 4.4 3.6 7.9 8.2 7.9 1.4 0 2.3-.8 2.3-1.9 0-.6-.2-1-.6-1.4-.3-.4-.5-.8-.5-1.2 0-.9.8-1.6 1.8-1.6h1.8c2.2 0 3.8-1.6 3.8-3.7 0-3.5-3.8-6-8.4-6Z" fill={C.rose} fillOpacity={0.14} stroke={C.rose} strokeWidth={SW} />
      <circle cx="7.7" cy="9.2" r="1.1" fill={C.orange} />
      <circle cx="12" cy="7.5" r="1.1" fill={C.violet} />
      <circle cx="16.2" cy="9.5" r="1.1" fill={C.sky} />
    </Icon>
  );
}

// Evento / cobertura — boleta (ámbar) con estrella naranja.
function MkEvento(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.5 9.5v-2c0-.8.7-1.5 1.5-1.5h14c.8 0 1.5.7 1.5 1.5v2a2.5 2.5 0 0 0 0 5v2c0 .8-.7 1.5-1.5 1.5H5c-.8 0-1.5-.7-1.5-1.5v-2a2.5 2.5 0 0 0 0-5Z" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={SW} />
      <path d="M15 6.5v11" stroke={C.amber} strokeWidth={1.3} strokeDasharray="2 2.4" />
      <path d="m9 9.4.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3.9-1.8Z" fill={C.orange} />
    </Icon>
  );
}

// Animación / motion — fotograma (teal) con play naranja y destello.
function MkAnimacion(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="5.5" width="14" height="13" rx="2" fill={C.teal} fillOpacity={0.14} stroke={C.teal} strokeWidth={SW} />
      <path d="M9.5 9.4v5.2c0 .5.6.9 1 .6l4.4-2.6c.4-.3.4-.9 0-1.2L10.5 8.8c-.4-.3-1 .1-1 .6Z" fill={C.orange} />
      <path d="m19.6 3.6.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z" fill={C.teal} />
    </Icon>
  );
}

// Podcast / audio — micrófono de estudio (índigo) con rejilla naranja.
function MkPodcast(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="9.3" y="3.5" width="5.4" height="9" rx="2.7" fill={C.indigo} fillOpacity={0.16} stroke={C.indigo} strokeWidth={SW} />
      <path d="M11 6.4h2M11 8.6h2" stroke={C.orange} strokeWidth={1.4} />
      <path d="M6.6 11.4a5.4 5.4 0 0 0 10.8 0" stroke={C.indigo} strokeWidth={SW} />
      <path d="M12 16.9v3.2M9.1 20.4h5.8" stroke={C.indigo} strokeWidth={SW} />
    </Icon>
  );
}

// Web / digital — globo (azul) con marcador naranja.
function MkWeb(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8" fill={C.blue} fillOpacity={0.12} stroke={C.blue} strokeWidth={SW} />
      <path d="M12 4c-2.8 2.2-4.2 4.8-4.2 8s1.4 5.8 4.2 8c2.8-2.2 4.2-4.8 4.2-8S14.8 6.2 12 4Z" stroke={C.blue} strokeWidth={1.4} />
      <path d="M4.6 9.4h14.8M4.6 14.6h14.8" stroke={C.blue} strokeWidth={1.4} />
      <circle cx="17" cy="7.6" r="1.6" fill={C.orange} />
    </Icon>
  );
}

// Campaña / pauta — megáfono naranja con ondas violetas.
function MkCampana(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 10.6v2.8c0 .6.4 1 1 1h1.7l7.8 3.8c.7.3 1.5-.2 1.5-1V6.8c0-.8-.8-1.3-1.5-1L6.7 9.6H5c-.6 0-1 .4-1 1Z" fill={C.orange} fillOpacity={0.18} stroke={C.orange} strokeWidth={SW} />
      <path d="M7.4 14.8v3.2c0 .8.7 1.5 1.5 1.5h.3c.8 0 1.4-.6 1.4-1.4v-2.2" stroke={C.orange} strokeWidth={SW} />
      <path d="M18.9 9.4a3.8 3.8 0 0 1 0 5.2" stroke={C.violet} strokeWidth={1.5} />
      <path d="M21 7.5a6.6 6.6 0 0 1 0 9" stroke={C.violet} strokeWidth={1.5} />
    </Icon>
  );
}

// Dron / aéreas — dron (violeta) con cámara naranja.
function MkDron(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="9.2" y="11.2" width="5.6" height="3.8" rx="1.4" fill={C.violet} fillOpacity={0.16} stroke={C.violet} strokeWidth={SW} />
      <path d="M9.8 11.6 6.4 8.8M14.2 11.6l3.4-2.8" stroke={C.violet} strokeWidth={1.6} />
      <path d="M3.3 8.2h6.2M14.5 8.2h6.2" stroke={C.violet} strokeWidth={1.6} />
      <circle cx="6.4" cy="8.2" r="0.9" fill={C.violet} />
      <circle cx="17.6" cy="8.2" r="0.9" fill={C.violet} />
      <circle cx="12" cy="17.3" r="1.4" fill={C.orange} />
    </Icon>
  );
}

// Streaming / en vivo — punto naranja emitiendo ondas (rosa).
function MkStreaming(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12.5" r="2.1" fill={C.orange} />
      <path d="M8.5 9a4.95 4.95 0 0 0 0 7M15.5 9a4.95 4.95 0 0 1 0 7" stroke={C.rose} strokeWidth={1.7} />
      <path d="M5.6 6.1a9 9 0 0 0 0 12.8M18.4 6.1a9 9 0 0 1 0 12.8" stroke={C.rose} strokeWidth={1.5} />
    </Icon>
  );
}

/* ─────────────── Sectores ampliados (2ª tanda) ─────────────── */

// Arquitectura — compás de dibujo (índigo) con eje naranja.
function MkArquitectura(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 6.2 7.2 18M12 6.2l4.8 11.8" stroke={C.indigo} strokeWidth={SW} />
      <path d="M12 6.2 7.2 18h9.6L12 6.2Z" fill={C.indigo} fillOpacity={0.12} />
      <path d="M6.6 18.6a8.2 8.2 0 0 0 10.8 0" stroke={C.indigo} strokeWidth={1.6} />
      <circle cx="12" cy="4.9" r="1.3" fill={C.orange} />
    </Icon>
  );
}

// Construcción — grúa (ámbar) con gancho naranja y edificio en obra.
function MkConstruccion(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="13.6" y="14.4" width="6.4" height="5.6" rx="0.8" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.6} />
      <path d="M7.5 20V5.2M4.5 7.4h13M15 7.4v4.2" stroke={C.amber} strokeWidth={SW} />
      <circle cx="15" cy="12.8" r="1.1" fill={C.orange} />
      <path d="M4.5 20h6" stroke={C.amber} strokeWidth={SW} />
    </Icon>
  );
}

// Vías y puentes — puente de arco (celeste) con luz naranja.
function MkVias(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 13.5c0-4 3-6.6 7-6.6s7 2.6 7 6.6" fill={C.sky} fillOpacity={0.12} stroke={C.sky} strokeWidth={SW} />
      <path d="M3 13.5h18" stroke={C.sky} strokeWidth={SW} />
      <path d="M7.5 13.5v4.5M12 13.5v4.8M16.5 13.5v4.5M4 18.8h16" stroke={C.sky} strokeWidth={1.5} />
      <circle cx="12" cy="4.8" r="1.1" fill={C.orange} />
    </Icon>
  );
}

// Odontología — diente (celeste) con destello naranja.
function MkOdontologia(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 5.6c1.7-.9 3.3-1 4.7-.1 1.9 1.3 2.3 3.9 1.2 6.6-1 2.6-1.6 5.2-2 7.2-.2.9-1.4 1-1.7.1-.4-1.3-.6-3.5-2.2-3.5s-1.8 2.2-2.2 3.5c-.3.9-1.5.8-1.7-.1-.4-2-1-4.6-2-7.2-1.1-2.7-.7-5.3 1.2-6.6 1.4-.9 3-.8 4.7.1Z" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={SW} />
      <path d="m4.6 3.6.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z" fill={C.orange} />
    </Icon>
  );
}

// Veterinaria / mascotas — huella (ámbar) con almohadilla naranja.
function MkVeterinaria(p: IconProps) {
  return (
    <Icon {...p}>
      <ellipse cx="12" cy="14.8" rx="3.6" ry="3" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.6} />
      <circle cx="6.9" cy="10.6" r="1.5" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.4} />
      <circle cx="10.2" cy="8.2" r="1.5" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.4} />
      <circle cx="13.8" cy="8.2" r="1.5" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.4} />
      <circle cx="17.1" cy="10.6" r="1.5" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.4} />
      <circle cx="12" cy="14.8" r="1" fill={C.orange} />
    </Icon>
  );
}

// Farmacia — cruz redondeada (verde) con centro naranja.
function MkFarmacia(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M10 4.5h4V10h5.5v4H14v5.5h-4V14H4.5v-4H10V4.5Z" fill={C.green} fillOpacity={0.14} stroke={C.green} strokeWidth={SW} />
      <circle cx="12" cy="12" r="1.4" fill={C.orange} />
    </Icon>
  );
}

// Psicología — mente (violeta) con chispa naranja.
function MkPsicologia(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M13 4.5c3.7 0 6.6 2.9 6.6 6.4v.3l1.2 2.1c.2.4 0 .8-.4.9l-1.3.4v1.9c0 1.1-.9 1.9-1.9 1.9h-1.4v2.1h-6v-3.2c-2-1.3-3.3-3.5-3.3-6C6.5 7.4 9.4 4.5 13 4.5Z" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="m12.6 8 .7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" fill={C.orange} />
    </Icon>
  );
}

// Iglesia / religión — templo (índigo) con cruz naranja.
function MkIglesia(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3.2v3.2M10.6 4.8h2.8" stroke={C.orange} strokeWidth={1.7} />
      <path d="M6.5 12.2 12 7.6l5.5 4.6" stroke={C.indigo} strokeWidth={SW} />
      <path d="M7.6 12.2v7.3h8.8v-7.3" fill={C.indigo} fillOpacity={0.14} stroke={C.indigo} strokeWidth={SW} />
      <path d="M10.8 19.5v-2.8c0-.7.5-1.2 1.2-1.2s1.2.5 1.2 1.2v2.8" stroke={C.indigo} strokeWidth={1.5} />
      <path d="M5.5 19.5h13" stroke={C.indigo} strokeWidth={SW} />
    </Icon>
  );
}

// Fundación / ONG — corazón naranja acogido en un cuenco (rosa).
function MkFundacion(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 12.6c-1.8-1.2-3.1-2.4-3.1-3.8 0-1 .8-1.8 1.7-1.8.6 0 1 .3 1.4.9.4-.6.8-.9 1.4-.9.9 0 1.7.8 1.7 1.8 0 1.4-1.3 2.6-3.1 3.8Z" fill={C.orange} />
      <path d="M4.6 13.4a7.4 7.4 0 0 0 14.8 0" fill={C.rose} fillOpacity={0.14} stroke={C.rose} strokeWidth={SW} />
      <path d="M4.6 13.4 3.4 12M19.4 13.4l1.2-1.4" stroke={C.rose} strokeWidth={1.6} />
    </Icon>
  );
}

// Gobierno — cúpula (índigo) con remate naranja.
function MkGobierno(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="4.6" r="1" fill={C.orange} />
      <path d="M7 12a5 5 0 0 1 10 0" fill={C.indigo} fillOpacity={0.14} stroke={C.indigo} strokeWidth={SW} />
      <path d="M12 5.6V7" stroke={C.indigo} strokeWidth={1.5} />
      <path d="M7.5 12v5M10.5 12v5M13.5 12v5M16.5 12v5" stroke={C.indigo} strokeWidth={1.6} />
      <path d="M5.5 17h13M4.5 19.6h15" stroke={C.indigo} strokeWidth={SW} />
    </Icon>
  );
}

// Energía — rayo naranja en círculo (ámbar).
function MkEnergia(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8" fill={C.amber} fillOpacity={0.12} stroke={C.amber} strokeWidth={SW} />
      <path d="M12.9 6.5 8.6 13h3l-.9 4.5 4.9-6.7h-3.1l.4-4.3Z" fill={C.orange} />
    </Icon>
  );
}

// Solar / renovables — panel (verde) con sol naranja.
function MkSolar(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="6.6" cy="6.4" r="2.1" fill={C.orange} fillOpacity={0.9} />
      <path d="M6.6 2.6v1M2.8 6.4h1M10.4 6.4h-1M6.6 10.2v-1" stroke={C.orange} strokeWidth={1.4} />
      <path d="M8.5 17.2 10.2 12.4h9.3l1.7 4.8H8.5Z" fill={C.green} fillOpacity={0.14} stroke={C.green} strokeWidth={SW} />
      <path d="M13.2 12.4 12.4 17.2M16.4 12.4l.8 4.8" stroke={C.green} strokeWidth={1.3} />
      <path d="M14.9 17.2v2.4M11.2 19.6h7.4" stroke={C.green} strokeWidth={1.5} />
    </Icon>
  );
}

// Minería — casco minero (coral) con lámpara naranja.
function MkMineria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 15.2v-1c0-4.2 3.1-7.3 7-7.3s7 3.1 7 7.3v1" fill={C.coral} fillOpacity={0.14} stroke={C.coral} strokeWidth={SW} />
      <path d="M3.6 15.2h16.8" stroke={C.coral} strokeWidth={SW} />
      <circle cx="12" cy="10.2" r="1.6" fill={C.orange} />
    </Icon>
  );
}

// Logística / transporte — camión (azul) con ruedas naranjas.
function MkLogistica(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.2 7.5h9.8v9H3.2Z" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={SW} />
      <path d="M13 16.5V10h3.6c.4 0 .8.2 1 .5l2.1 2.7c.2.3.3.6.3 1v2.3H13Z" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={SW} />
      <circle cx="7" cy="17.6" r="1.8" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.6} />
      <circle cx="16.4" cy="17.6" r="1.8" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Seguridad — escudo (índigo) con check naranja.
function MkSeguridad(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3.8 19 6.4v4.9c0 4.2-2.9 7.3-7 8.6-4.1-1.3-7-4.4-7-8.6V6.4l7-2.6Z" fill={C.indigo} fillOpacity={0.14} stroke={C.indigo} strokeWidth={SW} />
      <path d="m9 12 2.2 2.2 4-4.6" stroke={C.orange} strokeWidth={1.8} />
    </Icon>
  );
}

// Seguros — paraguas (teal) con punta naranja.
function MkSeguros(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="3.9" r="1" fill={C.orange} />
      <path d="M4 12a8 8 0 0 1 16 0H4Z" fill={C.teal} fillOpacity={0.16} stroke={C.teal} strokeWidth={SW} />
      <path d="M12 12v5.5c0 1.1.9 2 2 2s2-.9 2-2" stroke={C.teal} strokeWidth={SW} />
    </Icon>
  );
}

// Contabilidad — calculadora (verde) con tecla naranja.
function MkContabilidad(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="6.5" y="3.5" width="11" height="17" rx="2" fill={C.green} fillOpacity={0.12} stroke={C.green} strokeWidth={SW} />
      <rect x="9" y="6" width="6" height="3" rx="0.8" fill={C.green} fillOpacity={0.2} stroke={C.green} strokeWidth={1.3} />
      <circle cx="9.7" cy="12.4" r="0.9" fill={C.green} />
      <circle cx="12" cy="12.4" r="0.9" fill={C.green} />
      <circle cx="14.3" cy="12.4" r="0.9" fill={C.green} />
      <circle cx="9.7" cy="15.3" r="0.9" fill={C.green} />
      <circle cx="12" cy="15.3" r="0.9" fill={C.green} />
      <circle cx="9.7" cy="18.2" r="0.9" fill={C.green} />
      <rect x="13.2" y="14.4" width="2.2" height="4.6" rx="0.8" fill={C.orange} />
    </Icon>
  );
}

// Talento humano — persona (azul) con estrella naranja.
function MkTalento(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="10" cy="8.2" r="2.9" fill={C.blue} fillOpacity={0.16} stroke={C.blue} strokeWidth={SW} />
      <path d="M4.8 19.2a5.2 5.2 0 0 1 10.4 0" stroke={C.blue} strokeWidth={SW} />
      <path d="m17.5 5.4.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3.9-1.8Z" fill={C.orange} />
    </Icon>
  );
}

// Música — notas (violeta) con cabeza naranja.
function MkMusica(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9.2 16.4V6.4l9-1.8v10" stroke={C.violet} strokeWidth={SW} />
      <circle cx="7" cy="16.6" r="2.2" fill={C.violet} fillOpacity={0.16} stroke={C.violet} strokeWidth={1.6} />
      <circle cx="16" cy="14.8" r="2.2" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Arte y cultura — pincel (rosa) con trazo naranja.
function MkArte(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4.5 8.2C6.6 5.8 9.6 4.6 12.8 5" stroke={C.orange} strokeWidth={1.7} />
      <path d="m19.5 5.5-7.6 7.6" stroke={C.rose} strokeWidth={SW} />
      <path d="M11.6 12.6c-1.1-.1-2.2.3-2.9 1.1-.9.9-.8 2.2-1.7 3.1-.6.6-1.4.8-2.4.6.3 1.9 1.7 3.2 3.6 3.2 2.3 0 4.1-1.8 4.1-4.1 0-.6-.1-1.2-.4-1.7l-.3-2.2Z" fill={C.rose} fillOpacity={0.16} stroke={C.rose} strokeWidth={1.6} />
    </Icon>
  );
}

// Joyería — diamante (celeste) con destello naranja.
function MkJoyeria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M7.2 5.5h9.6L20 9.7 12 19.8 4 9.7l3.2-4.2Z" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={SW} />
      <path d="M4 9.7h16M12 19.8 8.8 9.7 12 5.5l3.2 4.2L12 19.8Z" stroke={C.sky} strokeWidth={1.2} />
      <path d="m20.2 2.8.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z" fill={C.orange} />
    </Icon>
  );
}

// Floristería — flor (rosa) con centro naranja.
function MkFloristeria(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="6.2" r="2.3" fill={C.rose} fillOpacity={0.16} stroke={C.rose} strokeWidth={1.4} />
      <circle cx="8.3" cy="8.9" r="2.3" fill={C.rose} fillOpacity={0.16} stroke={C.rose} strokeWidth={1.4} />
      <circle cx="15.7" cy="8.9" r="2.3" fill={C.rose} fillOpacity={0.16} stroke={C.rose} strokeWidth={1.4} />
      <circle cx="9.7" cy="12.9" r="2.3" fill={C.rose} fillOpacity={0.16} stroke={C.rose} strokeWidth={1.4} />
      <circle cx="14.3" cy="12.9" r="2.3" fill={C.rose} fillOpacity={0.16} stroke={C.rose} strokeWidth={1.4} />
      <circle cx="12" cy="9.9" r="1.7" fill={C.orange} />
      <path d="M12 15.2V20M12 18c-1.7 0-3-.8-3.6-2.4 1.7-.4 3.1.3 3.6 2.4Z" stroke={C.rose} strokeWidth={1.5} />
    </Icon>
  );
}

// Panadería / repostería — cupcake (ámbar) con cereza naranja.
function MkPanaderia(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="3.9" r="1.2" fill={C.orange} />
      <path d="M6 13c-.8-.5-1.3-1.4-1.3-2.4 0-1.6 1.3-2.9 2.9-2.9.2-2 2-3.6 4.4-3.6s4.2 1.6 4.4 3.6c1.6 0 2.9 1.3 2.9 2.9 0 1-.5 1.9-1.3 2.4" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={SW} />
      <path d="M6.5 13h11l-1.2 5.9c-.1.7-.7 1.2-1.5 1.2H9.2c-.8 0-1.4-.5-1.5-1.2L6.5 13Z" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={SW} />
    </Icon>
  );
}

// Café — taza (coral) con vapor naranja.
function MkCafe(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8.5 4.2c-.5 1 .5 1.6 0 2.6M12 4.2c-.5 1 .5 1.6 0 2.6" stroke={C.orange} strokeWidth={1.5} />
      <path d="M5.5 9.5h10V15a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V9.5Z" fill={C.coral} fillOpacity={0.14} stroke={C.coral} strokeWidth={SW} />
      <path d="M15.5 11h1.4a2.4 2.4 0 0 1 0 4.8h-1.6" stroke={C.coral} strokeWidth={1.6} />
    </Icon>
  );
}

// Bares y licores — copa (violeta) con aceituna naranja.
function MkLicores(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4.5 5.5h15L12 13 4.5 5.5Z" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="M12 13v5.5M8.5 19.5h7" stroke={C.violet} strokeWidth={SW} />
      <circle cx="14.8" cy="7.6" r="1.2" fill={C.orange} />
      <path d="m14.8 7.6 2.2-2.8" stroke={C.orange} strokeWidth={1.3} />
    </Icon>
  );
}

// Supermercado — carrito (verde) con ruedas naranjas.
function MkSupermercado(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M7.3 7.2h12.6l-1.9 6.1c-.1.4-.5.7-1 .7H9.7c-.5 0-.9-.3-1-.8L7.3 7.2Z" fill={C.green} fillOpacity={0.14} stroke={C.green} strokeWidth={SW} />
      <path d="M4 5.5h1.9c.5 0 .9.3 1 .8l.4 1" stroke={C.green} strokeWidth={SW} />
      <circle cx="10" cy="18.4" r="1.4" fill={C.orange} />
      <circle cx="16.4" cy="18.4" r="1.4" fill={C.orange} />
    </Icon>
  );
}

// E-commerce — celular (teal) con bolsa naranja.
function MkEcommerce(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="8.2" y="3.5" width="7.6" height="17" rx="2" fill={C.teal} fillOpacity={0.14} stroke={C.teal} strokeWidth={SW} />
      <path d="M10.3 10.6h3.4l-.4 4.1c0 .4-.4.7-.8.7h-1c-.4 0-.8-.3-.8-.7l-.4-4.1Z" fill={C.orange} fillOpacity={0.9} />
      <path d="M11.2 10.6v-.5a.8.8 0 0 1 1.6 0v.5" stroke={C.orange} strokeWidth={1.2} />
      <path d="M11.3 18.2h1.4" stroke={C.teal} strokeWidth={1.4} />
    </Icon>
  );
}

// Software / apps — ventana con código naranja (violeta).
function MkSoftware(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" fill={C.violet} fillOpacity={0.12} stroke={C.violet} strokeWidth={SW} />
      <path d="M3.5 8.5h17" stroke={C.violet} strokeWidth={1.3} />
      <circle cx="5.9" cy="6.8" r="0.7" fill={C.violet} />
      <circle cx="8.1" cy="6.8" r="0.7" fill={C.violet} />
      <path d="M9.8 12.2 7.6 14l2.2 1.8M14.2 12.2l2.2 1.8-2.2 1.8" stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Náutica — velero (azul) con banderín naranja.
function MkNautica(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3.4v1.4M12 3.4l2.4.8-2.4.8" stroke={C.orange} strokeWidth={1.4} />
      <path d="M12 16.5V4.8" stroke={C.blue} strokeWidth={1.6} />
      <path d="M12.8 6c3 1.7 4.9 4.6 5.4 8.7h-5.4V6Z" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={1.6} />
      <path d="M11.2 8c-2.3 1.5-3.6 3.7-4.1 6.7h4.1V8Z" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={1.6} />
      <path d="M4.5 16.5h15l-1.8 2.8c-.2.4-.6.6-1.1.6H7.4c-.5 0-.9-.2-1.1-.6L4.5 16.5Z" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={SW} />
    </Icon>
  );
}

// Laboratorio / ciencia — matraz (teal) con burbujas naranjas.
function MkLaboratorio(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M10.2 4.5v4.2l-4.8 8.2c-.8 1.4.2 3.1 1.8 3.1h9.6c1.6 0 2.6-1.7 1.8-3.1l-4.8-8.2V4.5" stroke={C.teal} strokeWidth={SW} />
      <path d="M8.8 4.5h6.4" stroke={C.teal} strokeWidth={SW} />
      <path d="M7.2 14.6h9.6l1 1.7c.6 1-.1 2.2-1.2 2.2H7.4c-1.1 0-1.8-1.2-1.2-2.2l1-1.7Z" fill={C.teal} fillOpacity={0.25} />
      <circle cx="11" cy="16.6" r="0.8" fill={C.orange} />
      <circle cx="13.7" cy="17.3" r="0.6" fill={C.orange} />
    </Icon>
  );
}

// Industria / manufactura — fábrica (índigo) con ventanas naranjas.
function MkIndustria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 19.5v-7.4l4.3 2.7v-2.7l4.3 2.7v-2.7l4.4 2.7v4.7H4Z" fill={C.indigo} fillOpacity={0.14} stroke={C.indigo} strokeWidth={SW} />
      <path d="M17 12.4V5h2.6v14.5" stroke={C.indigo} strokeWidth={1.6} />
      <circle cx="6.9" cy="16.8" r="0.9" fill={C.orange} />
      <circle cx="10.5" cy="16.8" r="0.9" fill={C.orange} />
      <circle cx="14.1" cy="16.8" r="0.9" fill={C.orange} />
      <path d="M3 19.5h18" stroke={C.indigo} strokeWidth={SW} />
    </Icon>
  );
}

// Imprenta / papelería — impresora (azul) con testigo naranja.
function MkImprenta(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8 9.5V4.8h8v4.7" stroke={C.blue} strokeWidth={SW} />
      <rect x="4.5" y="9.5" width="15" height="7" rx="1.5" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={SW} />
      <path d="M8 14.5h8v4.7H8Z" fill={C.blue} fillOpacity={0.08} stroke={C.blue} strokeWidth={1.5} />
      <circle cx="17.2" cy="11.8" r="0.9" fill={C.orange} />
    </Icon>
  );
}

// Ambiental / sostenibilidad — hoja (verde) con gota naranja.
function MkAmbiental(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 17.5c0-7 5-11.3 13.2-11.3.5 7.3-3.6 12.3-10.2 12.3-1 0-2-.3-3-1Z" fill={C.green} fillOpacity={0.16} stroke={C.green} strokeWidth={SW} />
      <path d="M6 17.5c-.8 1-1.3 1.8-1.6 2.7" stroke={C.green} strokeWidth={1.6} />
      <path d="M6.8 16.4c2.4-3.9 5.5-6.6 9.4-8.2" stroke={C.green} strokeWidth={1.3} />
      <circle cx="10.8" cy="12.2" r="1.1" fill={C.orange} />
    </Icon>
  );
}

// Agua — gota (celeste) con brillo naranja.
function MkAgua(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 4c3.6 4.2 6 7.4 6 10.4a6 6 0 0 1-12 0C6 11.4 8.4 8.2 12 4Z" fill={C.sky} fillOpacity={0.16} stroke={C.sky} strokeWidth={SW} />
      <path d="M9.2 14.6a3 3 0 0 0 2 2.7" stroke={C.orange} strokeWidth={1.5} />
    </Icon>
  );
}

// Gas y petróleo — llama (coral) con núcleo naranja.
function MkGas(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 4.5c.6 2.6 2 4.2 3.5 5.8 1.4 1.5 2.5 3 2.5 5a6 6 0 0 1-12 0c0-1.6.7-3 1.7-4.3.5 1 1.2 1.7 2.2 2.1-.4-2.9.3-6 2.1-8.6Z" fill={C.coral} fillOpacity={0.16} stroke={C.coral} strokeWidth={SW} />
      <path d="M12 12.5c1.5 1.3 2.3 2.4 2.3 3.7a2.3 2.3 0 0 1-4.6 0c0-1.3.8-2.4 2.3-3.7Z" fill={C.orange} fillOpacity={0.9} />
    </Icon>
  );
}

// Peluquería / barbería — tijeras (rosa) con eje naranja.
function MkPeluqueria(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="5.8" cy="8.2" r="2.1" fill={C.rose} fillOpacity={0.16} stroke={C.rose} strokeWidth={1.6} />
      <circle cx="5.8" cy="15.8" r="2.1" fill={C.rose} fillOpacity={0.16} stroke={C.rose} strokeWidth={1.6} />
      <path d="M7.6 9.3 19.5 16M7.6 14.7 19.5 8" stroke={C.rose} strokeWidth={1.7} />
      <circle cx="11.5" cy="12" r="1" fill={C.orange} />
    </Icon>
  );
}

// Spa / bienestar — loto (teal) con centro naranja.
function MkSpa(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 5.5c1.6 1.7 2.4 3.5 2.4 5.5 0 2-1 3.6-2.4 4.4-1.4-.8-2.4-2.4-2.4-4.4 0-2 .8-3.8 2.4-5.5Z" fill={C.teal} fillOpacity={0.16} stroke={C.teal} strokeWidth={1.6} />
      <path d="M4.4 12.9c1.2 3.3 4 5.3 7.6 5.3s6.4-2 7.6-5.3" fill={C.teal} fillOpacity={0.12} stroke={C.teal} strokeWidth={SW} />
      <circle cx="12" cy="11.2" r="1" fill={C.orange} />
    </Icon>
  );
}

// Bicicletas / movilidad — bici (verde) con plato naranja.
function MkBicicletas(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="6.3" cy="15.4" r="3.4" fill={C.green} fillOpacity={0.12} stroke={C.green} strokeWidth={1.6} />
      <circle cx="17.7" cy="15.4" r="3.4" fill={C.green} fillOpacity={0.12} stroke={C.green} strokeWidth={1.6} />
      <path d="m6.3 15.4 3.3-6h5.2l2.9 6M9.6 9.4l3.3 6h-6.6M8.3 8.6h2.5M14.5 9.4l-.8-1.8h2" stroke={C.green} strokeWidth={1.5} />
      <circle cx="12.9" cy="15.4" r="1.1" fill={C.orange} />
    </Icon>
  );
}

// Limpieza — burbujas (celeste) con destello naranja.
function MkLimpieza(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="9.2" cy="13.4" r="4.6" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={SW} />
      <circle cx="16.4" cy="9.2" r="2.6" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={1.6} />
      <circle cx="17" cy="15.8" r="1.8" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={1.5} />
      <path d="m12.6 3.4.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7Z" fill={C.orange} />
    </Icon>
  );
}

// Corporativo / consultoría — maletín (índigo) con broche naranja.
function MkOficina(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9.5 8V6.6c0-.9.7-1.6 1.6-1.6h1.8c.9 0 1.6.7 1.6 1.6V8" stroke={C.indigo} strokeWidth={SW} />
      <rect x="4" y="8" width="16" height="11" rx="2" fill={C.indigo} fillOpacity={0.14} stroke={C.indigo} strokeWidth={SW} />
      <path d="M4 12.5h6.9M13.1 12.5H20" stroke={C.indigo} strokeWidth={1.3} />
      <rect x="10.9" y="11.4" width="2.2" height="2.2" rx="0.5" fill={C.orange} />
    </Icon>
  );
}

// Óptica / oftalmología — gafas (violeta) con brillo naranja.
function MkOptica(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="7.5" cy="13" r="3.2" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <circle cx="16.5" cy="13" r="3.2" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="M10.7 12.6c.8-.7 1.8-.7 2.6 0M4.3 12.4 3 11.2M19.7 12.4l1.3-1.2" stroke={C.violet} strokeWidth={1.5} />
      <path d="M6 12.3a1.9 1.9 0 0 1 1.4-1.2" stroke={C.orange} strokeWidth={1.4} />
    </Icon>
  );
}

// Infantil / juguetería — bloque y pelota (ámbar) con estrella naranja.
function MkInfantil(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="4.5" y="10.5" width="7" height="7" rx="1" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.6} />
      <path d="m8 12.1.6 1.2 1.3.2-.9.9.2 1.3-1.2-.6-1.2.6.2-1.3-.9-.9 1.3-.2.6-1.2Z" fill={C.orange} />
      <circle cx="16.7" cy="14" r="3.4" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.6} />
      <path d="M13.5 12.9c1 .8 2.1 1.2 3.4 1.2 1.2 0 2.3-.3 3.3-1" stroke={C.amber} strokeWidth={1.3} />
    </Icon>
  );
}

// Notaría — documento (coral) con sello naranja.
function MkNotaria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6.5 3.8h7.4l3.6 3.6v8h-11V3.8Z" fill={C.coral} fillOpacity={0.12} stroke={C.coral} strokeWidth={1.6} />
      <path d="M13.9 3.8v3.6h3.6M9 10h6M9 12.6h4" stroke={C.coral} strokeWidth={1.4} />
      <circle cx="15.5" cy="17.3" r="2.6" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.6} />
      <path d="m14.4 19.5-.9 2M16.6 19.5l.9 2" stroke={C.orange} strokeWidth={1.4} />
    </Icon>
  );
}

/* ═══════════════ Registro ═══════════════ */

export const SECTOR_MARKS: LsMark[] = [
  { key: "moda", label: "Moda", k: "moda ropa textil diseno vestido", fb: "👗", Icon: MkModa },
  { key: "salud", label: "Salud", k: "salud medicina medico clinica hospital doctor odontologia", fb: "🩺", Icon: MkSalud },
  { key: "legal", label: "Legal", k: "legal abogado derecho justicia bufete balanza", fb: "⚖️", Icon: MkLegal },
  { key: "ingenieria", label: "Ingeniería", k: "ingenieria construccion obra casco arquitectura", fb: "🏗️", Icon: MkIngenieria },
  { key: "tecnologia", label: "Tecnología", k: "tecnologia software chip startup sistemas informatica", fb: "💻", Icon: MkTecnologia },
  { key: "gastronomia", label: "Gastronomía", k: "gastronomia restaurante comida chef cocina", fb: "🍽️", Icon: MkGastronomia },
  { key: "educacion", label: "Educación", k: "educacion universidad colegio academia curso graduacion", fb: "🎓", Icon: MkEducacion },
  { key: "finanzas", label: "Finanzas", k: "finanzas banco banca inversiones seguros contabilidad", fb: "🏦", Icon: MkFinanzas },
  { key: "inmobiliaria", label: "Inmobiliaria", k: "inmobiliaria bienes raices constructora vivienda edificios", fb: "🏘️", Icon: MkInmobiliaria },
  { key: "retail", label: "Retail", k: "retail comercio tienda compras almacen marca", fb: "🛍️", Icon: MkRetail },
  { key: "belleza", label: "Belleza", k: "belleza estetica cosmetica maquillaje spa", fb: "💄", Icon: MkBelleza },
  { key: "deporte", label: "Deporte", k: "deporte futbol gimnasio fitness club", fb: "⚽", Icon: MkDeporte },
  { key: "turismo", label: "Turismo", k: "turismo hotel viajes agencia hospedaje", fb: "✈️", Icon: MkTurismo },
  { key: "automotriz", label: "Automotriz", k: "automotriz carros autos taller concesionario", fb: "🚗", Icon: MkAutomotriz },
  { key: "agro", label: "Agro", k: "agro campo agricultura ganaderia cultivo", fb: "🌾", Icon: MkAgro },
  { key: "medios", label: "Medios", k: "medios prensa radio television noticias emisora", fb: "📡", Icon: MkMedios },
  // ── 2ª tanda: catálogo ampliado ──
  { key: "odontologia", label: "Odontología", k: "odontologia dental diente odontologo ortodoncia", fb: "🦷", Icon: MkOdontologia },
  { key: "farmacia", label: "Farmacia", k: "farmacia drogueria medicamentos pastillas", fb: "💊", Icon: MkFarmacia },
  { key: "psicologia", label: "Psicología", k: "psicologia mente terapia salud mental coaching", fb: "🧠", Icon: MkPsicologia },
  { key: "optica", label: "Óptica", k: "optica gafas lentes oftalmologia vision", fb: "👓", Icon: MkOptica },
  { key: "veterinaria", label: "Veterinaria", k: "veterinaria mascotas animales huella perro gato", fb: "🐾", Icon: MkVeterinaria },
  { key: "arquitectura", label: "Arquitectura", k: "arquitectura arquitecto diseno planos compas", fb: "📐", Icon: MkArquitectura },
  { key: "construccion", label: "Construcción", k: "construccion constructora obra grua edificacion", fb: "🏗️", Icon: MkConstruccion },
  { key: "vias", label: "Vías y puentes", k: "vias puentes infraestructura carreteras obras civiles", fb: "🌉", Icon: MkVias },
  { key: "industria", label: "Industria", k: "industria fabrica manufactura planta produccion", fb: "🏭", Icon: MkIndustria },
  { key: "mineria", label: "Minería", k: "mineria mina casco lampara extraccion", fb: "⛏️", Icon: MkMineria },
  { key: "energia", label: "Energía", k: "energia electrica rayo luz servicios publicos", fb: "⚡", Icon: MkEnergia },
  { key: "solar", label: "Renovables", k: "solar renovables paneles energia limpia eolica", fb: "☀️", Icon: MkSolar },
  { key: "gas", label: "Gas y petróleo", k: "gas petroleo llama combustible hidrocarburos", fb: "🔥", Icon: MkGas },
  { key: "agua", label: "Agua", k: "agua acueducto gota hidrico saneamiento", fb: "💧", Icon: MkAgua },
  { key: "ambiental", label: "Ambiental", k: "ambiental sostenibilidad ecologia reciclaje verde hoja", fb: "🌿", Icon: MkAmbiental },
  { key: "logistica", label: "Logística", k: "logistica transporte camion carga envios flota", fb: "🚚", Icon: MkLogistica },
  { key: "nautica", label: "Náutica", k: "nautica barco velero puerto marina pesca", fb: "⛵", Icon: MkNautica },
  { key: "bicicletas", label: "Bicicletas", k: "bicicletas bici ciclismo movilidad motos", fb: "🚲", Icon: MkBicicletas },
  { key: "software", label: "Software", k: "software apps desarrollo codigo programacion digital", fb: "🖥️", Icon: MkSoftware },
  { key: "ecommerce", label: "E-commerce", k: "ecommerce tienda online ventas digital celular", fb: "🛍️", Icon: MkEcommerce },
  { key: "laboratorio", label: "Laboratorio", k: "laboratorio ciencia quimica matraz investigacion biotecnologia", fb: "🧪", Icon: MkLaboratorio },
  { key: "seguridad", label: "Seguridad", k: "seguridad vigilancia escudo proteccion ciberseguridad", fb: "🛡️", Icon: MkSeguridad },
  { key: "seguros", label: "Seguros", k: "seguros aseguradora paraguas polizas proteccion", fb: "☂️", Icon: MkSeguros },
  { key: "contabilidad", label: "Contabilidad", k: "contabilidad contador calculadora impuestos auditoria", fb: "🧮", Icon: MkContabilidad },
  { key: "oficina", label: "Corporativo", k: "corporativo consultoria oficina maletin negocios empresa", fb: "💼", Icon: MkOficina },
  { key: "talento", label: "Talento humano", k: "talento humano rrhh personal reclutamiento headhunter", fb: "🙋", Icon: MkTalento },
  { key: "notaria", label: "Notaría", k: "notaria sello documento escrituras tramites", fb: "📜", Icon: MkNotaria },
  { key: "gobierno", label: "Gobierno", k: "gobierno publico alcaldia ministerio estado capitolio", fb: "🏛️", Icon: MkGobierno },
  { key: "fundacion", label: "Fundación", k: "fundacion ong sin animo de lucro social donaciones caridad", fb: "🤝", Icon: MkFundacion },
  { key: "iglesia", label: "Iglesia", k: "iglesia religion fe templo cristiano parroquia", fb: "⛪", Icon: MkIglesia },
  { key: "musica", label: "Música", k: "musica banda artista nota disquera entretenimiento", fb: "🎵", Icon: MkMusica },
  { key: "arte", label: "Arte y cultura", k: "arte cultura pintura galeria museo pincel", fb: "🎨", Icon: MkArte },
  { key: "infantil", label: "Infantil", k: "infantil ninos jugueteria jardin preescolar bebes", fb: "🧸", Icon: MkInfantil },
  { key: "joyeria", label: "Joyería", k: "joyeria diamante lujo accesorios relojeria", fb: "💎", Icon: MkJoyeria },
  { key: "floristeria", label: "Floristería", k: "floristeria flores flor jardin vivero", fb: "🌸", Icon: MkFloristeria },
  { key: "panaderia", label: "Panadería", k: "panaderia reposteria pasteleria cupcake dulces", fb: "🧁", Icon: MkPanaderia },
  { key: "cafe", label: "Café", k: "cafe cafeteria barista taza tostion", fb: "☕", Icon: MkCafe },
  { key: "licores", label: "Bar y licores", k: "bar licores copa cocteles cerveceria discoteca", fb: "🍸", Icon: MkLicores },
  { key: "supermercado", label: "Supermercado", k: "supermercado mercado carrito abarrotes tienda", fb: "🛒", Icon: MkSupermercado },
  { key: "peluqueria", label: "Peluquería", k: "peluqueria barberia tijeras salon estilista", fb: "✂️", Icon: MkPeluqueria },
  { key: "spa", label: "Spa", k: "spa bienestar loto relajacion masajes yoga", fb: "🧖", Icon: MkSpa },
  { key: "limpieza", label: "Limpieza", k: "limpieza aseo burbujas lavanderia mantenimiento", fb: "🧼", Icon: MkLimpieza },
  { key: "imprenta", label: "Imprenta", k: "imprenta papeleria impresion litografia publicidad impresa", fb: "🖨️", Icon: MkImprenta },
];

export const PROJECT_MARKS: LsMark[] = [
  { key: "fotografia", label: "Fotografía", k: "fotografia foto camara sesion retrato producto", fb: "📸", Icon: MkFotografia },
  { key: "video", label: "Video", k: "video institucional comercial filmacion produccion", fb: "🎥", Icon: MkVideo },
  { key: "redes", label: "Redes sociales", k: "redes sociales social media contenido instagram tiktok", fb: "📱", Icon: MkRedes },
  { key: "marketing", label: "Marketing", k: "marketing plan estrategia objetivo diana", fb: "🎯", Icon: MkMarketing },
  { key: "branding", label: "Branding", k: "branding marca diseno identidad logo paleta", fb: "🎨", Icon: MkBranding },
  { key: "evento", label: "Evento", k: "evento cobertura lanzamiento boleta concierto", fb: "🎟️", Icon: MkEvento },
  { key: "animacion", label: "Animación", k: "animacion motion graphics 2d 3d", fb: "✨", Icon: MkAnimacion },
  { key: "podcast", label: "Podcast", k: "podcast audio voz microfono estudio grabacion", fb: "🎙️", Icon: MkPodcast },
  { key: "web", label: "Web", k: "web pagina sitio digital internet landing", fb: "🌐", Icon: MkWeb },
  { key: "campana", label: "Campaña", k: "campana pauta publicidad anuncio megafono ads", fb: "📣", Icon: MkCampana },
  { key: "dron", label: "Dron", k: "dron aereas tomas vuelo aerea", fb: "🛸", Icon: MkDron },
  { key: "streaming", label: "Streaming", k: "streaming en vivo live transmision directo", fb: "📡", Icon: MkStreaming },
];

// Índice clave → marca (sectores + tipos juntos; las claves no chocan).
const BY_KEY = new Map<string, LsMark>([...SECTOR_MARKS, ...PROJECT_MARKS].map((m) => [m.key, m]));

// Devuelve la marca si `value` es un token "ls:<clave>" conocido; si no, null.
export function lsMark(value?: string | null): LsMark | null {
  if (!value || !value.startsWith(LS_PREFIX)) return null;
  return BY_KEY.get(value.slice(LS_PREFIX.length)) ?? null;
}

// Para contextos de SOLO texto (títulos de canal, líneas de calendario, exports):
// un token se degrada a su emoji de respaldo; un emoji normal pasa tal cual.
export function emojiToText(value?: string | null, fallback = ""): string {
  const mark = lsMark(value);
  if (mark) return mark.fb;
  return value || fallback;
}

// Renderer universal del campo `emoji`: pinta el ícono Labstream si es token, o el
// emoji/fallback como texto. El tamaño sigue al texto circundante (1.15em), así que
// funciona igual en una tabla, un título o la burbuja de la portada.
export function EntityEmoji({
  value,
  fallback,
  className,
}: {
  value?: string | null;
  fallback?: React.ReactNode;
  className?: string;
}) {
  const mark = lsMark(value);
  if (mark) {
    return <mark.Icon className={cn("inline-block size-[1.15em] align-[-0.18em]", className)} label={mark.label} />;
  }
  return <>{value || fallback || null}</>;
}
