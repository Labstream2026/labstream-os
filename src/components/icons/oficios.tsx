import * as React from "react";
import { Icon, C, SW, type IconProps } from "./index";

// ── Íconos de oficios e industrias (para fichas de cliente) ──
// Misma familia duotono del set base (./index.tsx): un color saturado propio por ícono +
// el naranja de marca como acento, trazo redondeado, rellenos con opacidad (sirven en tema
// claro y oscuro). Pensados para identificar visualmente a qué se dedica cada cliente.
// OFICIO_ICONS (al final) es el catálogo key → label → componente para un selector.

// ── Salud ──

// Dermatólogo — piel con lunares (rosa) bajo la lupa naranja.
export function IconDermatologo(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="3.5" width="12.5" height="12.5" rx="3" fill={C.rose} fillOpacity={0.14} stroke={C.rose} strokeWidth={SW} />
      <circle cx="7.3" cy="7.3" r="1" fill={C.rose} />
      <circle cx="10.8" cy="10" r="0.8" fill={C.rose} />
      <circle cx="14.8" cy="14.8" r="3.4" fill={C.orange} fillOpacity={0.14} stroke={C.orange} strokeWidth={1.8} />
      <path d="M17.3 17.3l3.2 3.2" stroke={C.orange} strokeWidth={2} />
    </Icon>
  );
}

// Médico estético — jeringa (teal) con destello naranja.
export function IconMedicoEstetico(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 20.3l4.1-4.1" stroke={C.teal} strokeWidth={SW} />
      <path d="M6.6 14.6l7-7 3.1 3.1-7 7Z" fill={C.teal} fillOpacity={0.16} stroke={C.teal} strokeWidth={SW} />
      <path d="M15.2 9.1l3-3M16.9 4.8l2.6 2.6" stroke={C.teal} strokeWidth={SW} />
      <path d="M5.5 3.9l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6Z" fill={C.orange} />
    </Icon>
  );
}

// Médico general — estetoscopio (azul) con campana naranja.
export function IconMedicoGeneral(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6.2 3.8v4.9c0 2.5 1.7 4.5 3.9 4.5s3.9-2 3.9-4.5V3.8" stroke={C.blue} strokeWidth={SW} />
      <path d="M4.8 3.8h2.8M12.6 3.8h2.8" stroke={C.blue} strokeWidth={1.6} />
      <path d="M10.1 13.2v2.3c0 2.7 2 4.7 4.7 4.7 2.3 0 4.2-1.5 4.7-3.6" stroke={C.blue} strokeWidth={SW} />
      <circle cx="19.8" cy="14" r="2.3" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.7} />
      <circle cx="19.8" cy="14" r="0.8" fill={C.orange} />
    </Icon>
  );
}

// Odontólogo — diente (celeste) con destello naranja.
export function IconOdontologo(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 5.1c-1.2-1-2.9-1.3-4.4-.6C5.7 5.4 4.8 7.4 5.3 9.5c.4 1.6 1 3 1.3 4.7.3 1.8.4 3.7 1.4 5.2.4.7 1.4.5 1.7-.2.5-1.4.7-3.2 2.3-3.2s1.8 1.8 2.3 3.2c.3.7 1.3.9 1.7.2 1-1.5 1.1-3.4 1.4-5.2.3-1.7.9-3.1 1.3-4.7.5-2.1-.4-4.1-2.3-5-1.5-.7-3.2-.4-4.4.6Z" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={SW} />
      <path d="M19.6 2.9l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6Z" fill={C.orange} />
    </Icon>
  );
}

// Oftalmólogo — ojo (violeta) con pupila naranja.
export function IconOftalmologo(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2.8 12c2.3-4 5.4-6 9.2-6s6.9 2 9.2 6c-2.3 4-5.4 6-9.2 6s-6.9-2-9.2-6Z" fill={C.violet} fillOpacity={0.12} stroke={C.violet} strokeWidth={SW} />
      <circle cx="12" cy="12" r="2.9" fill={C.violet} fillOpacity={0.2} stroke={C.violet} strokeWidth={SW} />
      <circle cx="12" cy="12" r="1.2" fill={C.orange} />
    </Icon>
  );
}

// Cirujano plástico — bisturí horizontal (coral) con puntos de sutura naranjas.
export function IconCirujanoPlastico(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="13.1" y="8.1" width="7.4" height="3.1" rx="1.5" fill={C.coral} fillOpacity={0.16} stroke={C.coral} strokeWidth={1.6} />
      <path d="M13.6 8.1H8.9c-2.3 0-4.4 1.7-5.4 4 2.4 1 5 1.4 7.6 1.1l1.5-.2c.6-.1 1-.6 1-1.2V8.1Z" fill={C.coral} fillOpacity={0.14} stroke={C.coral} strokeWidth={SW} />
      <path d="M6.5 17.5v.01M10 17.5v.01M13.5 17.5v.01M17 17.5v.01" stroke={C.orange} strokeWidth={2.2} />
    </Icon>
  );
}

// Psicólogo — cabeza de perfil (rosa) con corazón naranja.
export function IconPsicologo(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8.5 20.5v-2.8H6.9c-.8 0-1.3-.8-.9-1.5l1-1.8c-.6-4.2 1.7-9 6.5-9 3.9 0 6.7 2.8 6.7 6.4 0 3.4-2.2 5.8-5.5 6.2v2.5" fill={C.rose} fillOpacity={0.12} stroke={C.rose} strokeWidth={SW} />
      <path d="M13 13.4s-2.6-1.5-2.6-3.3c0-1 .8-1.7 1.6-1.7.5 0 .8.2 1 .6.2-.4.5-.6 1-.6.8 0 1.6.7 1.6 1.7 0 1.8-2.6 3.3-2.6 3.3Z" fill={C.orange} />
    </Icon>
  );
}

// Nutricionista — manzana (verde) con hoja naranja.
export function IconNutricionista(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 8.5c1-.8 2.4-1.1 3.7-.6 2.3.8 3.2 3.6 2.3 6.4-.8 2.6-2.7 5.2-4.6 5.2-.5 0-1-.2-1.4-.4-.4.2-.9.4-1.4.4-1.9 0-3.8-2.6-4.6-5.2-.9-2.8 0-5.6 2.3-6.4 1.3-.5 2.7-.2 3.7.6Z" fill={C.green} fillOpacity={0.14} stroke={C.green} strokeWidth={SW} />
      <path d="M12 8.3c0-1.6.6-2.8 1.8-3.6" stroke={C.green} strokeWidth={1.7} />
      <path d="M13.8 5.5c1.1-.9 2.5-1.1 3.8-.5-.4 1.4-1.4 2.3-2.9 2.5-.6.1-1-.1-1.2-.6-.2-.5-.1-1 .3-1.4Z" fill={C.orange} fillOpacity={0.25} stroke={C.orange} strokeWidth={1.4} />
    </Icon>
  );
}

// Veterinaria — huella (ámbar) con un dedo naranja.
export function IconVeterinaria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 12.6c1.9 0 3.8 1.5 3.8 3.6 0 1.9-1.3 3.3-3.8 3.3s-3.8-1.4-3.8-3.3c0-2.1 1.9-3.6 3.8-3.6Z" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.6} />
      <circle cx="6.6" cy="10.2" r="1.6" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.4} />
      <circle cx="10" cy="7.4" r="1.6" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.4} />
      <circle cx="14" cy="7.4" r="1.6" fill={C.orange} />
      <circle cx="17.4" cy="10.2" r="1.6" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.4} />
    </Icon>
  );
}

// Farmacia — cápsula (índigo) con mitad naranja.
export function IconFarmacia(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5.6 13.4l7.8-7.8c1.5-1.5 3.9-1.5 5.4 0s1.5 3.9 0 5.4l-7.8 7.8c-1.5 1.5-3.9 1.5-5.4 0s-1.5-3.9 0-5.4Z" fill={C.indigo} fillOpacity={0.14} stroke={C.indigo} strokeWidth={SW} />
      <path d="M5.6 13.4l3.9-3.9 5.4 5.4-3.9 3.9c-1.5 1.5-3.9 1.5-5.4 0s-1.5-3.9 0-5.4Z" fill={C.orange} fillOpacity={0.25} stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Laboratorio clínico — matraz (teal) con burbujas naranjas.
export function IconLaboratorio(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M10.2 3.5v5.1L5.6 16.8c-.8 1.4.2 3.2 1.9 3.2h9c1.7 0 2.7-1.8 1.9-3.2L13.8 8.6V3.5" fill={C.teal} fillOpacity={0.12} stroke={C.teal} strokeWidth={SW} />
      <path d="M9 3.5h6" stroke={C.teal} strokeWidth={SW} />
      <path d="M7.9 14.5h8.2" stroke={C.teal} strokeWidth={1.5} />
      <circle cx="10.7" cy="17" r="0.9" fill={C.orange} />
      <circle cx="13.8" cy="15.6" r="0.6" fill={C.orange} />
    </Icon>
  );
}

// ── Legal y finanzas ──

// Abogado — balanza (índigo) con base naranja.
export function IconAbogado(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 4.5v15M5 7h14" stroke={C.indigo} strokeWidth={SW} />
      <circle cx="12" cy="4.5" r="1.2" fill={C.indigo} />
      <path d="M5 7l-2.4 5M5 7l2.4 5M19 7l-2.4 5M19 7l2.4 5" stroke={C.indigo} strokeWidth={1.4} />
      <path d="M2.1 12a2.9 2.9 0 0 0 5.8 0Z" fill={C.indigo} fillOpacity={0.16} stroke={C.indigo} strokeWidth={1.6} />
      <path d="M16.1 12a2.9 2.9 0 0 0 5.8 0Z" fill={C.indigo} fillOpacity={0.16} stroke={C.indigo} strokeWidth={1.6} />
      <path d="M8.5 19.5h7" stroke={C.orange} strokeWidth={2} />
    </Icon>
  );
}

// Notaría — sello (coral) con base naranja.
export function IconNotaria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9 16.5l.7-3.4c.1-.6-.3-1.1-.9-1.3-1.3-.4-2.2-1.4-2.2-2.9 0-1.9 1.7-3.4 5.4-3.4s5.4 1.5 5.4 3.4c0 1.5-.9 2.5-2.2 2.9-.6.2-1 .7-.9 1.3l.7 3.4" fill={C.coral} fillOpacity={0.14} stroke={C.coral} strokeWidth={SW} />
      <rect x="5.5" y="16.5" width="13" height="3.5" rx="1.2" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Contador — calculadora (verde) con tecla naranja.
export function IconContador(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="5.5" y="3.5" width="13" height="17" rx="2.5" fill={C.green} fillOpacity={0.12} stroke={C.green} strokeWidth={SW} />
      <rect x="8" y="6" width="8" height="3" rx="1" fill={C.green} fillOpacity={0.25} stroke={C.green} strokeWidth={1.4} />
      <circle cx="8.9" cy="12.4" r="0.95" fill={C.green} />
      <circle cx="12" cy="12.4" r="0.95" fill={C.green} />
      <circle cx="15.1" cy="12.4" r="0.95" fill={C.green} />
      <circle cx="8.9" cy="15.6" r="0.95" fill={C.green} />
      <circle cx="12" cy="15.6" r="0.95" fill={C.green} />
      <rect x="14" y="14.6" width="2.2" height="3.6" rx="1.1" fill={C.orange} />
    </Icon>
  );
}

// Banca — frontón con columnas (azul) y moneda naranja.
export function IconBanca(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 9.5 12 4l8 5.5Z" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={SW} />
      <path d="M6.5 12v5M10.3 12v5M13.7 12v5M17.5 12v5" stroke={C.blue} strokeWidth={SW} />
      <path d="M4.5 19.5h15" stroke={C.blue} strokeWidth={SW} />
      <circle cx="12" cy="7.3" r="1.1" fill={C.orange} />
    </Icon>
  );
}

// Seguros — paraguas (celeste) con mango naranja.
export function IconSeguros(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.5 12a8.5 8.5 0 0 1 17 0c-1.4-1-2.8-1-4.2 0-1.4-1-2.9-1-4.3 0-1.4-1-2.9-1-4.3 0-1.4-1-2.8-1-4.2 0Z" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={SW} />
      <path d="M12 2.6v1.2" stroke={C.sky} strokeWidth={SW} />
      <path d="M12 12v6.2a1.8 1.8 0 0 1-3.6 0" stroke={C.orange} strokeWidth={1.8} />
    </Icon>
  );
}

// ── Construcción y técnicos ──

// Arquitecto — compás (violeta) con arco naranja.
export function IconArquitecto(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 6.5 7 19M12 6.5l5 12.5" stroke={C.violet} strokeWidth={SW} />
      <circle cx="12" cy="5.2" r="1.7" fill={C.violet} fillOpacity={0.2} stroke={C.violet} strokeWidth={SW} />
      <path d="M12 2.3v1.2" stroke={C.violet} strokeWidth={SW} />
      <path d="M8.3 15.6c2.4 1.4 5 1.4 7.4 0" stroke={C.orange} strokeWidth={1.8} />
    </Icon>
  );
}

// Ingeniería — casco (ámbar) con franja naranja.
export function IconIngenieria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4.5 14.7v-.8c0-4.5 3.3-7.9 7.5-7.9s7.5 3.4 7.5 7.9v.8Z" fill={C.amber} fillOpacity={0.14} stroke={C.amber} strokeWidth={SW} />
      <path d="M3.5 17.5h17" stroke={C.amber} strokeWidth={2.2} />
      <path d="M12 6v3.4" stroke={C.orange} strokeWidth={1.9} />
    </Icon>
  );
}

// Constructora — grúa torre (índigo) con contrapeso y gancho naranja.
export function IconConstructora(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M7 20.5V4.3M3.8 6.6h15.9M7 4.3 3.8 6.6M7 4.3l5.4 2.3" stroke={C.indigo} strokeWidth={SW} />
      <path d="M3.9 20.5h6.2" stroke={C.indigo} strokeWidth={SW} />
      <rect x="3.4" y="6.6" width="3" height="2.8" rx="0.7" fill={C.indigo} fillOpacity={0.16} stroke={C.indigo} strokeWidth={1.5} />
      <path d="M17.6 6.6v2.8" stroke={C.indigo} strokeWidth={1.6} />
      <path d="M17.6 9.4v1.7a1.7 1.7 0 0 1-3.4 0" stroke={C.orange} strokeWidth={1.8} />
    </Icon>
  );
}

// Electricista — rayo (ámbar) con chispas naranjas.
export function IconElectricista(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M13.2 3.5 5.5 13.5h5l-1.7 7 7.7-10h-5l1.7-7Z" fill={C.amber} fillOpacity={0.18} stroke={C.amber} strokeWidth={SW} />
      <circle cx="17.8" cy="5.5" r="1" fill={C.orange} />
      <circle cx="19.6" cy="8.8" r="0.7" fill={C.orange} />
    </Icon>
  );
}

// Plomería — llave inglesa (azul) con gota naranja.
export function IconPlomeria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M14.8 4.3a4.6 4.6 0 0 0-5 6.3L4.3 16c-1 1-1 2.6 0 3.6s2.6 1 3.6 0l5.4-5.4a4.6 4.6 0 0 0 6.3-5l-3 3-3-.9-.9-3 3.1-3Z" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={SW} />
      <path d="M19 14.7c1 1.4 1.9 2.5 1.9 3.6 0 1.2-.9 2-1.9 2s-1.9-.8-1.9-2c0-1.1.9-2.2 1.9-3.6Z" fill={C.orange} fillOpacity={0.25} stroke={C.orange} strokeWidth={1.5} />
    </Icon>
  );
}

// Carpintería / muebles — silla (coral) con asiento naranja.
export function IconCarpinteria(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="7" y="3.5" width="10" height="6" rx="1.5" fill={C.coral} fillOpacity={0.14} stroke={C.coral} strokeWidth={SW} />
      <path d="M9 9.5v2.8M15 9.5v2.8" stroke={C.coral} strokeWidth={1.6} />
      <rect x="6.5" y="12.3" width="11" height="2.4" rx="1.2" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.6} />
      <path d="M7.7 14.7l-1 5.8M16.3 14.7l1 5.8" stroke={C.coral} strokeWidth={SW} />
    </Icon>
  );
}

// Ferretería — martillo diagonal (teal) con mango naranja.
export function IconFerreteria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12.5 3.5l8 8-2.5 2.5-8-8Z" fill={C.teal} fillOpacity={0.16} stroke={C.teal} strokeWidth={SW} />
      <path d="M13.2 10.8 5 19" stroke={C.orange} strokeWidth={2.7} />
    </Icon>
  );
}

// Mecánica — tuerca (celeste) con centro naranja.
export function IconMecanica(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3.8l6.8 3.9v7.8L12 19.4l-6.8-3.9V7.7L12 3.8Z" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={SW} />
      <circle cx="12" cy="11.6" r="2.7" stroke={C.orange} strokeWidth={1.8} fill={C.orange} fillOpacity={0.15} />
    </Icon>
  );
}

// ── Comida y hospitalidad ──

// Restaurante — tenedor (verde) y cuchillo naranja.
export function IconRestaurante(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4.7 3.5v2.9c0 1.4 1 2.4 2.3 2.4s2.3-1 2.3-2.4V3.5" stroke={C.green} strokeWidth={SW} />
      <path d="M7 3.5v2.9M7 8.8v11.7" stroke={C.green} strokeWidth={SW} />
      <path d="M17 3.5c-2 2-3 4.6-3 7.2 0 1.5 1.3 2.3 3 2.3v7.5" stroke={C.orange} strokeWidth={1.8} />
    </Icon>
  );
}

// Chef — gorro (celeste) con banda naranja.
export function IconChef(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8.2 16.8v-2.9c-2.6-.3-4.7-2.3-4.7-4.7C3.5 6.7 5.5 4.8 8 4.8h.3C9.1 3.1 10.4 2 12 2s2.9 1.1 3.7 2.8h.3c2.5 0 4.5 1.9 4.5 4.4 0 2.4-2.1 4.4-4.7 4.7v2.9Z" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={SW} />
      <rect x="8.2" y="16.8" width="7.6" height="3.4" rx="1.4" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Panadería — pan (ámbar) con cortes naranjas.
export function IconPanaderia(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4.5 16.5v-3C4.5 9.9 7.8 7.5 12 7.5s7.5 2.4 7.5 6v3c0 .8-.7 1.5-1.5 1.5H6c-.8 0-1.5-.7-1.5-1.5Z" fill={C.amber} fillOpacity={0.14} stroke={C.amber} strokeWidth={SW} />
      <path d="M9 10.6l-1 1.8M12.5 10.3l-1 1.8M16 10.6l-1 1.8" stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Cafetería — taza (coral) con vapor naranja.
export function IconCafeteria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 10.5h11v4.5c0 3-2.5 5.5-5.5 5.5S5 18 5 15v-4.5Z" fill={C.coral} fillOpacity={0.14} stroke={C.coral} strokeWidth={SW} />
      <path d="M16 11.5h1.4c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1H16" stroke={C.coral} strokeWidth={SW} />
      <path d="M8.5 7.5c-.6-1 .6-1.6 0-2.9M12.5 7.5c-.6-1 .6-1.6 0-2.9" stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Bar — copa martini (violeta) con oliva naranja.
export function IconBar(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4.5 4.5h15L12 12.5 4.5 4.5Z" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="M12 12.5v6M8.5 20.5h7" stroke={C.violet} strokeWidth={SW} />
      <circle cx="14.6" cy="6.6" r="1.2" fill={C.orange} />
      <path d="M14.6 6.6l2.4-2.4" stroke={C.orange} strokeWidth={1.4} />
    </Icon>
  );
}

// Hotel — cama (azul) con almohada naranja.
export function IconHotel(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.5 19.5v-13" stroke={C.blue} strokeWidth={SW} />
      <path d="M3.5 14h13.3c2.1 0 3.7 1.6 3.7 3.7v1.8H3.5Z" fill={C.blue} fillOpacity={0.12} stroke={C.blue} strokeWidth={SW} />
      <circle cx="7" cy="11.4" r="1.7" fill={C.orange} fillOpacity={0.25} stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Turismo — maleta (celeste) con sticker naranja.
export function IconTurismo(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="4" y="8" width="16" height="11.5" rx="2.5" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={SW} />
      <path d="M9.2 8V6.2c0-.9.7-1.7 1.7-1.7h2.2c.9 0 1.7.7 1.7 1.7V8" stroke={C.sky} strokeWidth={SW} />
      <path d="M8.5 8v11.5M15.5 8v11.5" stroke={C.sky} strokeWidth={1.4} />
      <circle cx="12" cy="13.8" r="1.3" fill={C.orange} />
    </Icon>
  );
}

// ── Comercio ──

// Tienda — bolsa de compras (ámbar) con punto naranja.
export function IconTienda(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5.5 8.5h13l-1 11c-.07.6-.55 1-1.15 1H7.65c-.6 0-1.08-.4-1.15-1l-1-11Z" fill={C.amber} fillOpacity={0.14} stroke={C.amber} strokeWidth={SW} />
      <path d="M8.8 8.5V7a3.2 3.2 0 0 1 6.4 0v1.5" stroke={C.amber} strokeWidth={SW} />
      <circle cx="12" cy="14.5" r="1.3" fill={C.orange} />
    </Icon>
  );
}

// Supermercado — carrito (azul) con ruedas naranjas.
export function IconSupermercado(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.5 4.5h1.9c.5 0 .9.3 1 .8L6.9 8" stroke={C.blue} strokeWidth={SW} />
      <path d="M6.9 8h13.5l-1.6 6.9c-.1.5-.6.9-1.1.9h-8c-.5 0-1-.4-1.1-.9L6.9 8Z" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={SW} />
      <circle cx="10" cy="19.3" r="1.4" fill={C.orange} fillOpacity={0.25} stroke={C.orange} strokeWidth={1.6} />
      <circle cx="16.7" cy="19.3" r="1.4" fill={C.orange} fillOpacity={0.25} stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Moda — camiseta (rosa) con cuello naranja.
export function IconModa(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8.3 4.5 5 6.7c-.9.6-1.3 1.7-1 2.7l.6 1.9c.2.8 1.1 1.2 1.9 1l1.5-.5v7c0 .7.5 1.2 1.2 1.2h5.6c.7 0 1.2-.5 1.2-1.2v-7l1.5.5c.8.2 1.7-.2 1.9-1l.6-1.9c.3-1-.1-2.1-1-2.7l-3.3-2.2c-.6.9-1.6 1.5-2.7 1.5s-2.1-.6-2.7-1.5Z" fill={C.rose} fillOpacity={0.14} stroke={C.rose} strokeWidth={SW} />
      <path d="M9.3 4.5c.6.9 1.6 1.5 2.7 1.5s2.1-.6 2.7-1.5" stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Joyería — diamante (violeta) con destello naranja.
export function IconJoyeria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M7.2 4.5h9.6L20.5 9 12 20 3.5 9l3.7-4.5Z" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="M3.5 9h17M8.5 9 12 20l3.5-11" stroke={C.violet} strokeWidth={1.4} />
      <path d="M20 2.3l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5Z" fill={C.orange} />
    </Icon>
  );
}

// Floristería — flor (coral) con centro naranja.
export function IconFloristeria(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="6.2" r="2.5" fill={C.coral} fillOpacity={0.16} stroke={C.coral} strokeWidth={1.5} />
      <circle cx="7.9" cy="9.2" r="2.5" fill={C.coral} fillOpacity={0.16} stroke={C.coral} strokeWidth={1.5} />
      <circle cx="9.5" cy="14" r="2.5" fill={C.coral} fillOpacity={0.16} stroke={C.coral} strokeWidth={1.5} />
      <circle cx="14.5" cy="14" r="2.5" fill={C.coral} fillOpacity={0.16} stroke={C.coral} strokeWidth={1.5} />
      <circle cx="16.1" cy="9.2" r="2.5" fill={C.coral} fillOpacity={0.16} stroke={C.coral} strokeWidth={1.5} />
      <circle cx="12" cy="10.5" r="2" fill={C.orange} />
      <path d="M12 16.5v4" stroke={C.coral} strokeWidth={1.7} />
    </Icon>
  );
}

// ── Belleza y deporte ──

// Peluquería — tijeras (rosa) con eje naranja.
export function IconPeluqueria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M19.5 5.5 7.4 14.1M19.5 18.5 7.4 9.9" stroke={C.rose} strokeWidth={SW} />
      <circle cx="5.5" cy="8.9" r="2.1" fill={C.rose} fillOpacity={0.16} stroke={C.rose} strokeWidth={SW} />
      <circle cx="5.5" cy="15.1" r="2.1" fill={C.rose} fillOpacity={0.16} stroke={C.rose} strokeWidth={SW} />
      <circle cx="11.6" cy="12" r="1" fill={C.orange} />
    </Icon>
  );
}

// Barbería — poste (azul) con franjas naranjas.
export function IconBarberia(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="8.5" y="4.5" width="7" height="15" rx="3.4" fill={C.blue} fillOpacity={0.12} stroke={C.blue} strokeWidth={SW} />
      <path d="M9 8.6l6-2.8M8.7 12.2l6.6-3.1M8.7 15.7l6.6-3.1M9.3 18.9l5.7-2.7" stroke={C.orange} strokeWidth={1.7} />
    </Icon>
  );
}

// Spa — loto (teal) con agua naranja.
export function IconSpa(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 4.5c1.5 1.7 2.3 3.6 2.3 5.6S13.5 13.8 12 15c-1.5-1.2-2.3-2.9-2.3-4.9S10.5 6.2 12 4.5Z" fill={C.teal} fillOpacity={0.16} stroke={C.teal} strokeWidth={1.6} />
      <path d="M4.5 9.5c2.3.4 4.2 1.4 5.5 3 .9 1.1 1.5 2.5 1.7 4-2.3-.1-4.3-.9-5.6-2.4-1-1.2-1.6-2.8-1.6-4.6Z" fill={C.teal} fillOpacity={0.14} stroke={C.teal} strokeWidth={1.6} />
      <path d="M19.5 9.5c-2.3.4-4.2 1.4-5.5 3-.9 1.1-1.5 2.5-1.7 4 2.3-.1 4.3-.9 5.6-2.4 1-1.2 1.6-2.8 1.6-4.6Z" fill={C.teal} fillOpacity={0.14} stroke={C.teal} strokeWidth={1.6} />
      <path d="M6.5 19c3.4 1.3 7.6 1.3 11 0" stroke={C.orange} strokeWidth={1.7} />
    </Icon>
  );
}

// Gimnasio — mancuerna (índigo) con discos naranjas.
export function IconGimnasio(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8.8 12h6.4" stroke={C.indigo} strokeWidth={SW} />
      <rect x="5.6" y="7.6" width="2.6" height="8.8" rx="1.2" fill={C.indigo} fillOpacity={0.16} stroke={C.indigo} strokeWidth={1.6} />
      <rect x="15.8" y="7.6" width="2.6" height="8.8" rx="1.2" fill={C.indigo} fillOpacity={0.16} stroke={C.indigo} strokeWidth={1.6} />
      <rect x="2.8" y="9.4" width="2" height="5.2" rx="1" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.5} />
      <rect x="19.2" y="9.4" width="2" height="5.2" rx="1" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.5} />
    </Icon>
  );
}

// Deportes — balón (verde) con pentágono naranja.
export function IconDeportes(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.2" fill={C.green} fillOpacity={0.12} stroke={C.green} strokeWidth={SW} />
      <path d="M12 8.8l2.4 1.75-.92 2.85h-2.96L9.6 10.55Z" fill={C.orange} />
      <path d="M12 8.8V5.2M14.4 10.6l3.4-1.1M13.5 13.4l2.1 2.9M10.5 13.4l-2.1 2.9M9.6 10.6 6.2 9.5" stroke={C.green} strokeWidth={1.5} />
    </Icon>
  );
}

// ── Creativos y servicios ──

// Fotógrafo — cámara (violeta) con lente naranja.
export function IconFotografo(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="M8.5 7.5 9.6 5.3c.25-.5.76-.8 1.3-.8h2.2c.54 0 1.05.3 1.3.8l1.1 2.2" stroke={C.violet} strokeWidth={SW} />
      <circle cx="12" cy="13.4" r="3.6" fill={C.violet} fillOpacity={0.18} stroke={C.violet} strokeWidth={SW} />
      <circle cx="12" cy="13.4" r="1.5" fill={C.orange} />
      <circle cx="17.7" cy="10.3" r="0.8" fill={C.violet} />
    </Icon>
  );
}

// Música — notas (rosa) con cabeza naranja.
export function IconMusica(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9.5 18.2V6.5l9-2v11.2" stroke={C.rose} strokeWidth={SW} />
      <circle cx="7.2" cy="18.2" r="2.3" fill={C.rose} fillOpacity={0.2} stroke={C.rose} strokeWidth={SW} />
      <circle cx="16.2" cy="15.7" r="2.3" fill={C.orange} fillOpacity={0.25} stroke={C.orange} strokeWidth={1.7} />
    </Icon>
  );
}

// Publicidad — megáfono (coral) con ondas naranjas.
export function IconPublicidad(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.5 10.3c0-.6.4-1.2 1-1.4L15 4.6c.7-.3 1.5.2 1.5.9v12c0 .7-.8 1.2-1.5.9L4.5 14.1c-.6-.2-1-.8-1-1.4v-2.4Z" fill={C.coral} fillOpacity={0.14} stroke={C.coral} strokeWidth={SW} />
      <path d="M7 14.9v3c0 .9.7 1.6 1.6 1.6s1.6-.7 1.6-1.6v-1.8" stroke={C.coral} strokeWidth={1.6} />
      <path d="M19.3 8.3c2.4 1.9 2.4 5.5 0 7.4" stroke={C.orange} strokeWidth={1.7} />
    </Icon>
  );
}

// Tecnología — código (azul) con barra naranja.
export function IconTecnologia(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8 7.5 3.5 12 8 16.5M16 7.5 20.5 12 16 16.5" stroke={C.blue} strokeWidth={2} />
      <path d="M13.4 5.5l-2.8 13" stroke={C.orange} strokeWidth={1.8} />
    </Icon>
  );
}

// Educación — birrete (índigo) con borla naranja.
export function IconEducacion(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2.8 9.2 12 4.5l9.2 4.7L12 13.9 2.8 9.2Z" fill={C.indigo} fillOpacity={0.16} stroke={C.indigo} strokeWidth={SW} />
      <path d="M6.5 11.5v4.2c0 1.5 2.5 2.8 5.5 2.8s5.5-1.3 5.5-2.8v-4.2" stroke={C.indigo} strokeWidth={SW} />
      <path d="M21.2 9.4v4.2" stroke={C.orange} strokeWidth={1.8} />
      <circle cx="21.2" cy="14.6" r="0.9" fill={C.orange} />
    </Icon>
  );
}

// Eventos — boleta (ámbar) con perforado naranja.
export function IconEventos(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.5 8c0-.8.7-1.5 1.5-1.5h14c.8 0 1.5.7 1.5 1.5v2.2a1.8 1.8 0 0 0 0 3.6V16c0 .8-.7 1.5-1.5 1.5H5c-.8 0-1.5-.7-1.5-1.5v-2.2a1.8 1.8 0 0 0 0-3.6V8Z" fill={C.amber} fillOpacity={0.14} stroke={C.amber} strokeWidth={SW} />
      <path d="M14.8 8.2v.4M14.8 11.8v.4M14.8 15.4v.4" stroke={C.orange} strokeWidth={2} />
    </Icon>
  );
}

// Inmobiliaria — casa (verde) con precio naranja.
export function IconInmobiliaria(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.8 11.5 12 4.8l8.2 6.7" stroke={C.green} strokeWidth={SW} />
      <path d="M6 10v8.3c0 .7.5 1.2 1.2 1.2h9.6c.7 0 1.2-.5 1.2-1.2V10" fill={C.green} fillOpacity={0.12} stroke={C.green} strokeWidth={SW} />
      <circle cx="12" cy="14.4" r="2.4" fill={C.orange} fillOpacity={0.18} stroke={C.orange} strokeWidth={1.6} />
      <path d="M12 13.2v2.4" stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Transporte — camión (índigo) con rueda naranja.
export function IconTransporte(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="2.8" y="6.5" width="11.2" height="9" rx="1.5" fill={C.indigo} fillOpacity={0.14} stroke={C.indigo} strokeWidth={SW} />
      <path d="M14 15.5V9.5h3.2c.5 0 1 .2 1.2.6l2.4 3.1c.2.3.3.6.3 1v1.3" fill={C.indigo} fillOpacity={0.14} stroke={C.indigo} strokeWidth={SW} />
      <circle cx="7" cy="17.5" r="1.9" fill={C.indigo} fillOpacity={0.2} stroke={C.indigo} strokeWidth={SW} />
      <circle cx="17" cy="17.5" r="1.9" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={SW} />
    </Icon>
  );
}

// Automotriz — carro (coral) con ruedas naranjas.
export function IconAutomotriz(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 15.1c0-1 .6-1.8 1.5-2.1L6 8.9C6.4 7.8 7.4 7 8.6 7h6.8c1.2 0 2.2.8 2.6 1.9l1.5 4.1c.9.3 1.5 1.1 1.5 2.1v3.4H3v-3.4Z" fill={C.coral} fillOpacity={0.14} stroke={C.coral} strokeWidth={SW} />
      <path d="M4.5 13h15" stroke={C.coral} strokeWidth={1.4} />
      <circle cx="7.3" cy="18.4" r="1.8" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.7} />
      <circle cx="16.7" cy="18.4" r="1.8" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.7} />
    </Icon>
  );
}

// Agro — planta (verde) con tierra naranja.
export function IconAgro(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 20v-7.5" stroke={C.green} strokeWidth={SW} />
      <path d="M12 12.5c-4.5 0-7-2.5-7.5-6.5 4.5 0 7 2.5 7.5 6.5Z" fill={C.green} fillOpacity={0.18} stroke={C.green} strokeWidth={1.6} />
      <path d="M12 15.5c4.5 0 7-2.5 7.5-6.5-4.5 0-7 2.5-7.5 6.5Z" fill={C.green} fillOpacity={0.18} stroke={C.green} strokeWidth={1.6} />
      <path d="M7.5 20.5h9" stroke={C.orange} strokeWidth={1.8} />
    </Icon>
  );
}

// Energía — panel solar (celeste) con sol naranja.
export function IconEnergia(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="7.4" r="2.4" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.7} />
      <path d="M12 3.2v1.4M7.9 4.9 9 6M16.1 4.9 15 6" stroke={C.orange} strokeWidth={1.5} />
      <path d="M6 13.5h12l1.6 5.5c.2.7-.3 1.5-1.1 1.5H5.5c-.8 0-1.3-.8-1.1-1.5L6 13.5Z" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={SW} />
      <path d="M12 13.5v7M5.5 17h13" stroke={C.sky} strokeWidth={1.4} />
    </Icon>
  );
}

// Ambiental — hoja (teal) con nervadura naranja.
export function IconAmbiental(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M19.5 4.5C10 5 5.2 10.5 5 19.5c9-.2 14.5-5 14.5-15Z" fill={C.teal} fillOpacity={0.14} stroke={C.teal} strokeWidth={SW} />
      <path d="M6.5 17.5C9 12.5 13 8.5 17.5 6.5" stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Seguridad — candado (índigo) con cerradura naranja.
export function IconSeguridadPrivada(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5" fill={C.indigo} fillOpacity={0.14} stroke={C.indigo} strokeWidth={SW} />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke={C.indigo} strokeWidth={SW} />
      <circle cx="12" cy="14.4" r="1.5" fill={C.orange} />
      <path d="M12 15.6v2" stroke={C.orange} strokeWidth={1.7} />
    </Icon>
  );
}

// Limpieza — atomizador (celeste) con gotas naranjas.
export function IconLimpieza(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9 10.5h6l1 9c.06.55-.4 1-.95 1h-6.1c-.55 0-1-.45-.95-1l1-9Z" fill={C.sky} fillOpacity={0.12} stroke={C.sky} strokeWidth={SW} />
      <path d="M11 10.5V6h3l2.5.9" stroke={C.sky} strokeWidth={1.7} />
      <circle cx="18.6" cy="5" r="0.8" fill={C.orange} />
      <circle cx="20.2" cy="7.2" r="0.8" fill={C.orange} />
      <circle cx="18.8" cy="9.2" r="0.6" fill={C.orange} />
    </Icon>
  );
}

// Podcast / medios — micrófono (violeta) con base naranja.
export function IconPodcast(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="9.4" y="3" width="5.2" height="10" rx="2.6" fill={C.violet} fillOpacity={0.16} stroke={C.violet} strokeWidth={SW} />
      <path d="M6.2 11.2c0 3.4 2.5 5.8 5.8 5.8s5.8-2.4 5.8-5.8" stroke={C.violet} strokeWidth={SW} />
      <path d="M12 17v3.5" stroke={C.violet} strokeWidth={SW} />
      <path d="M8.8 20.5h6.4" stroke={C.orange} strokeWidth={1.8} />
    </Icon>
  );
}

// ── Catálogo (key → label → ícono) para el selector de oficio de un cliente ──
export const OFICIO_ICONS: { key: string; label: string; Icon: (p: IconProps) => React.ReactElement }[] = [
  // Salud
  { key: "dermatologo", label: "Dermatólogo", Icon: IconDermatologo },
  { key: "medico-estetico", label: "Médico estético", Icon: IconMedicoEstetico },
  { key: "medico", label: "Médico general", Icon: IconMedicoGeneral },
  { key: "odontologo", label: "Odontólogo", Icon: IconOdontologo },
  { key: "oftalmologo", label: "Oftalmólogo", Icon: IconOftalmologo },
  { key: "cirujano-plastico", label: "Cirujano plástico", Icon: IconCirujanoPlastico },
  { key: "psicologo", label: "Psicólogo", Icon: IconPsicologo },
  { key: "nutricionista", label: "Nutricionista", Icon: IconNutricionista },
  { key: "veterinaria", label: "Veterinaria", Icon: IconVeterinaria },
  { key: "farmacia", label: "Farmacia", Icon: IconFarmacia },
  { key: "laboratorio", label: "Laboratorio clínico", Icon: IconLaboratorio },
  // Legal y finanzas
  { key: "abogado", label: "Abogado", Icon: IconAbogado },
  { key: "notaria", label: "Notaría", Icon: IconNotaria },
  { key: "contador", label: "Contador", Icon: IconContador },
  { key: "banca", label: "Banca", Icon: IconBanca },
  { key: "seguros", label: "Seguros", Icon: IconSeguros },
  // Construcción y técnicos
  { key: "arquitecto", label: "Arquitecto", Icon: IconArquitecto },
  { key: "ingenieria", label: "Ingeniería", Icon: IconIngenieria },
  { key: "constructora", label: "Constructora", Icon: IconConstructora },
  { key: "electricista", label: "Electricista", Icon: IconElectricista },
  { key: "plomeria", label: "Plomería", Icon: IconPlomeria },
  { key: "carpinteria", label: "Carpintería y muebles", Icon: IconCarpinteria },
  { key: "ferreteria", label: "Ferretería", Icon: IconFerreteria },
  { key: "mecanica", label: "Mecánica", Icon: IconMecanica },
  // Comida y hospitalidad
  { key: "restaurante", label: "Restaurante", Icon: IconRestaurante },
  { key: "chef", label: "Chef", Icon: IconChef },
  { key: "panaderia", label: "Panadería", Icon: IconPanaderia },
  { key: "cafeteria", label: "Cafetería", Icon: IconCafeteria },
  { key: "bar", label: "Bar", Icon: IconBar },
  { key: "hotel", label: "Hotel", Icon: IconHotel },
  { key: "turismo", label: "Turismo", Icon: IconTurismo },
  // Comercio
  { key: "tienda", label: "Tienda", Icon: IconTienda },
  { key: "supermercado", label: "Supermercado", Icon: IconSupermercado },
  { key: "moda", label: "Moda", Icon: IconModa },
  { key: "joyeria", label: "Joyería", Icon: IconJoyeria },
  { key: "floristeria", label: "Floristería", Icon: IconFloristeria },
  // Belleza y deporte
  { key: "peluqueria", label: "Peluquería", Icon: IconPeluqueria },
  { key: "barberia", label: "Barbería", Icon: IconBarberia },
  { key: "spa", label: "Spa", Icon: IconSpa },
  { key: "gimnasio", label: "Gimnasio", Icon: IconGimnasio },
  { key: "deportes", label: "Deportes", Icon: IconDeportes },
  // Creativos y servicios
  { key: "fotografo", label: "Fotógrafo", Icon: IconFotografo },
  { key: "musica", label: "Música", Icon: IconMusica },
  { key: "publicidad", label: "Publicidad", Icon: IconPublicidad },
  { key: "tecnologia", label: "Tecnología", Icon: IconTecnologia },
  { key: "educacion", label: "Educación", Icon: IconEducacion },
  { key: "eventos", label: "Eventos", Icon: IconEventos },
  { key: "inmobiliaria", label: "Inmobiliaria", Icon: IconInmobiliaria },
  { key: "transporte", label: "Transporte", Icon: IconTransporte },
  { key: "automotriz", label: "Automotriz", Icon: IconAutomotriz },
  { key: "agro", label: "Agro", Icon: IconAgro },
  { key: "energia", label: "Energía", Icon: IconEnergia },
  { key: "ambiental", label: "Ambiental", Icon: IconAmbiental },
  { key: "seguridad", label: "Seguridad", Icon: IconSeguridadPrivada },
  { key: "limpieza", label: "Limpieza", Icon: IconLimpieza },
  { key: "podcast", label: "Podcast y medios", Icon: IconPodcast },
];
