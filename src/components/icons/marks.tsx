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
