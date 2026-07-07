import * as React from "react";
import { cn } from "@/lib/utils";

// ── Íconos propios de Labstream ──
// Set duotono y vívido, hecho a medida (no depende de librerías externas): cada ícono usa un
// color saturado propio + el naranja de marca (#F47A20) como acento recurrente, con el trazo
// redondeado y geométrico del logo. Los rellenos usan opacidad (fill-opacity) para que se vean
// bien en tema claro y oscuro sin variantes. API igual que un ícono de UI: reciben `className`
// (por defecto size-6) y un `label` opcional para accesibilidad; sin label son decorativos.
//
// Fase 1 = núcleo de secciones/áreas más usadas. Fase 2 = ampliar el set y cablearlos en más
// superficies. Para usarlos: import { IconProyectos } from "@/components/icons".

// Paleta viva de la familia (saturada, legible en ambos temas). El naranja es el hilo de marca.
export const C = {
  orange: "#F47A20",
  violet: "#7C5CFC",
  blue: "#2E90FA",
  teal: "#12B5A6",
  green: "#16A34A",
  amber: "#F59E0B",
  rose: "#EC4899",
  indigo: "#4F46E5",
  coral: "#F0503A",
  sky: "#0EA5E9",
} as const;

export type IconName =
  | "proyectos" | "equipo" | "tareas" | "calendario" | "rodaje" | "facturacion"
  | "cotizacion" | "cliente" | "reportes" | "wiki" | "chat" | "notas"
  | "buscar" | "notificaciones" | "marcebot" | "revisiones" | "archivo" | "horas"
  | "inicio" | "entregas" | "comercial" | "biblioteca" | "papelera" | "configuracion";

export type IconProps = { className?: string; label?: string };

// Lienzo común: viewBox 24, trazo redondeado. Con `label` es role="img"; sin él, decorativo.
export function Icon({ className, label, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-6 shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {label ? <title>{label}</title> : null}
      {children}
    </svg>
  );
}

export const SW = 1.8; // grosor de trazo base (eco de los trazos gruesos del logo)

// Proyectos — cohete (violeta) con ventana y llama naranja.
export function IconProyectos(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 2.5c2.9 2.3 4.3 5.5 4.3 9.1v3.2H7.7v-3.2c0-3.6 1.4-6.8 4.3-9.1Z" fill={C.violet} fillOpacity={0.16} stroke={C.violet} strokeWidth={SW} />
      <circle cx="12" cy="9.6" r="1.9" fill={C.orange} />
      <path d="M7.7 12.6 5 15.2v2.6l2.7-1.3M16.3 12.6 19 15.2v2.6l-2.7-1.3" stroke={C.violet} strokeWidth={SW} />
      <path d="M10 18.6c.5 1.6 1.1 2.5 2 3.1.9-.6 1.5-1.5 2-3.1" fill={C.orange} fillOpacity={0.9} stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Equipo — dos personas (azul + teal).
export function IconEquipo(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="9" cy="8" r="3.1" fill={C.blue} fillOpacity={0.16} stroke={C.blue} strokeWidth={SW} />
      <path d="M3.7 19.2c0-2.9 2.4-5.3 5.3-5.3s5.3 2.4 5.3 5.3" stroke={C.blue} strokeWidth={SW} />
      <circle cx="16.6" cy="9.2" r="2.4" fill={C.teal} fillOpacity={0.18} stroke={C.teal} strokeWidth={SW} />
      <path d="M15.2 14.4c2.6.1 4.9 2.2 4.9 4.8" stroke={C.teal} strokeWidth={SW} />
    </Icon>
  );
}

// Tareas — portapapeles (verde) con check naranja.
export function IconTareas(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="5.5" y="4.5" width="13" height="16" rx="3" fill={C.green} fillOpacity={0.14} stroke={C.green} strokeWidth={SW} />
      <rect x="9" y="2.7" width="6" height="3.4" rx="1.5" fill={C.green} />
      <path d="M8.8 12.6l2.1 2.1 4-4.6" stroke={C.orange} strokeWidth={2} />
    </Icon>
  );
}

// Calendario — hoja (coral) con día resaltado en naranja.
export function IconCalendario(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" fill={C.coral} fillOpacity={0.14} stroke={C.coral} strokeWidth={SW} />
      <path d="M3.5 9.6h17" stroke={C.coral} strokeWidth={SW} />
      <path d="M8 3v3.2M16 3v3.2" stroke={C.coral} strokeWidth={SW} />
      <circle cx="12" cy="14.6" r="2" fill={C.orange} />
    </Icon>
  );
}

// Rodaje — claqueta (índigo) con franjas naranjas. Muy de productora audiovisual.
export function IconRodaje(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3" y="9" width="18" height="11" rx="2.6" fill={C.indigo} fillOpacity={0.14} stroke={C.indigo} strokeWidth={SW} />
      <path d="M3.4 9 4.6 5.4c.2-.6.8-.9 1.4-.7l13.4 2.6c.7.1 1.1.9.8 1.6L19.6 9" fill={C.indigo} fillOpacity={0.2} stroke={C.indigo} strokeWidth={SW} />
      <path d="M8.4 5.3 6.7 8.9M12.7 6.1 11 9.5M17 7 15.3 9.7" stroke={C.orange} strokeWidth={1.7} />
    </Icon>
  );
}

// Facturación — recibo (verde) con línea de acento naranja.
export function IconFacturacion(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3Z" fill={C.green} fillOpacity={0.14} stroke={C.green} strokeWidth={SW} />
      <path d="M9 8h6M9 11.5h6" stroke={C.green} strokeWidth={SW} />
      <path d="M9 15h3.5" stroke={C.orange} strokeWidth={2} />
    </Icon>
  );
}

// Cotización / propuesta — documento (ámbar) con destello naranja.
export function IconCotizacion(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 3.5h7l5 5v12H6Z" fill={C.amber} fillOpacity={0.14} stroke={C.amber} strokeWidth={SW} />
      <path d="M13 3.5v5h5" stroke={C.amber} strokeWidth={SW} />
      <path d="M12 11.6l.85 2.05 2.05.85-2.05.85L12 17.4l-.85-2.05-2.05-.85 2.05-.85Z" fill={C.orange} />
    </Icon>
  );
}

// Cliente — edificio (celeste) con puerta naranja.
export function IconCliente(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="5" y="3.5" width="14" height="17" rx="2.6" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={SW} />
      <path d="M9 7.6h2M13 7.6h2M9 11.1h2M13 11.1h2" stroke={C.sky} strokeWidth={SW} />
      <path d="M10 20.5v-3.6h4v3.6" stroke={C.orange} strokeWidth={SW} />
    </Icon>
  );
}

// Reportes — barras (teal) con la barra destacada en naranja.
export function IconReportes(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 20h16" stroke={C.teal} strokeWidth={SW} />
      <rect x="5.5" y="12" width="3.3" height="6.2" rx="1.3" fill={C.teal} fillOpacity={0.2} stroke={C.teal} strokeWidth={1.6} />
      <rect x="10.35" y="8" width="3.3" height="10.2" rx="1.3" fill={C.orange} fillOpacity={0.22} stroke={C.orange} strokeWidth={1.6} />
      <rect x="15.2" y="5" width="3.3" height="13.2" rx="1.3" fill={C.teal} fillOpacity={0.2} stroke={C.teal} strokeWidth={1.6} />
    </Icon>
  );
}

// Wiki — libro abierto (rosa) con lomo naranja.
export function IconWiki(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 4.6c2-1 5-1 7 .3 2-1.3 5-1.3 7-.3v13c-2-1-5-1-7 .3-2-1.3-5-1.3-7-.3Z" fill={C.rose} fillOpacity={0.14} stroke={C.rose} strokeWidth={SW} />
      <path d="M12 4.9v13" stroke={C.orange} strokeWidth={1.7} />
    </Icon>
  );
}

// Chat — burbuja (azul) con puntos, el último naranja.
export function IconChat(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 10.4c0-3.4 3.2-6.1 7.1-6.1s7.1 2.7 7.1 6.1-3.2 6.1-7.1 6.1c-.9 0-1.8-.1-2.7-.4L5 17.9l.8-2.8C4.7 14 4 12.3 4 10.4Z" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={SW} />
      <circle cx="8.4" cy="10.4" r="1" fill={C.blue} />
      <circle cx="11.6" cy="10.4" r="1" fill={C.blue} />
      <circle cx="14.8" cy="10.4" r="1" fill={C.orange} />
    </Icon>
  );
}

// Notas — hoja con esquina doblada (violeta) y renglones.
export function IconNotas(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 4.5h14v9.5l-5 5H5Z" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="M19 14h-5v5" stroke={C.violet} strokeWidth={SW} />
      <path d="M8 8.6h8M8 11.6h5" stroke={C.orange} strokeWidth={1.7} />
    </Icon>
  );
}

// Buscar — lupa (azul) con mango naranja.
export function IconBuscar(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="10.5" cy="10.5" r="6" fill={C.blue} fillOpacity={0.12} stroke={C.blue} strokeWidth={SW} />
      <path d="M14.9 14.9 19.5 19.5" stroke={C.orange} strokeWidth={2.2} />
    </Icon>
  );
}

// Notificaciones — campana (ámbar) con punto de alerta coral.
export function IconNotificaciones(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 16.8c1-1 1.5-2.6 1.5-5.1 0-2.8 2-5 4.5-5s4.5 2.2 4.5 5c0 2.5.5 4.1 1.5 5.1Z" fill={C.amber} fillOpacity={0.14} stroke={C.amber} strokeWidth={SW} />
      <path d="M10 20c.4.9 1.1 1.3 2 1.3s1.6-.4 2-1.3" stroke={C.amber} strokeWidth={SW} />
      <circle cx="17" cy="6" r="2.3" fill={C.coral} />
    </Icon>
  );
}

// Marcebot — el copiloto: cara de robot en naranja de marca.
export function IconMarcebot(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="4" y="8" width="16" height="11" rx="4" fill={C.orange} fillOpacity={0.16} stroke={C.orange} strokeWidth={SW} />
      <path d="M12 8V4.9" stroke={C.orange} strokeWidth={SW} />
      <circle cx="12" cy="3.7" r="1.4" fill={C.orange} />
      <circle cx="9.3" cy="13" r="1.5" fill={C.orange} />
      <circle cx="14.7" cy="13" r="1.5" fill={C.orange} />
      <path d="M9.6 16.3h4.8" stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Revisiones — insignia de aprobación (violeta) con check naranja.
export function IconRevisiones(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="M8.4 12.2l2.4 2.4 4.7-5.1" stroke={C.orange} strokeWidth={2} />
    </Icon>
  );
}

// Archivo — carpeta (celeste) con pestaña naranja.
export function IconArchivo(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 8c0-1.1.9-2 2-2h3.2c.5 0 1 .2 1.4.6L12 8h6c1.1 0 2 .9 2 2v7c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2Z" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={SW} />
      <path d="M4 11.2h6.5" stroke={C.orange} strokeWidth={1.7} />
    </Icon>
  );
}

// Horas — reloj (ámbar) con manecillas naranjas. Para control de tiempo / rentabilidad.
export function IconHoras(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8" fill={C.amber} fillOpacity={0.14} stroke={C.amber} strokeWidth={SW} />
      <path d="M12 7.6V12l3 2" stroke={C.orange} strokeWidth={2} />
    </Icon>
  );
}

// Inicio — casa (violeta) con puerta naranja.
export function IconInicio(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 11.4 12 4.6l8 6.8" stroke={C.violet} strokeWidth={SW} />
      <path d="M6.2 10.2v8.1c0 .7.5 1.2 1.2 1.2h9.2c.7 0 1.2-.5 1.2-1.2v-8.1" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="M10.5 19.5v-4.3c0-.7.5-1.2 1.2-1.2h.6c.7 0 1.2.5 1.2 1.2v4.3" fill={C.orange} fillOpacity={0.85} stroke={C.orange} strokeWidth={1.5} />
    </Icon>
  );
}

// Mis entregas — bandeja de entrada (celeste) con aviso naranja.
export function IconEntregas(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.5 13.5 5.9 7.6c.3-.8 1-1.3 1.9-1.3h8.4c.9 0 1.6.5 1.9 1.3l2.4 5.9V17c0 1.4-1.1 2.5-2.5 2.5H6c-1.4 0-2.5-1.1-2.5-2.5v-3.5Z" fill={C.sky} fillOpacity={0.14} stroke={C.sky} strokeWidth={SW} />
      <path d="M3.5 13.5h4.6l1.1 2h5.6l1.1-2h4.6" stroke={C.sky} strokeWidth={SW} />
      <circle cx="19.4" cy="4.9" r="1.7" fill={C.orange} />
    </Icon>
  );
}

// Comercial — embudo (verde) con moneda naranja.
export function IconComercial(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 5.2h16l-6 7.1v5.3l-4 2.2v-7.5L4 5.2Z" fill={C.green} fillOpacity={0.14} stroke={C.green} strokeWidth={SW} />
      <circle cx="18.4" cy="16.8" r="2.7" fill={C.orange} fillOpacity={0.18} stroke={C.orange} strokeWidth={1.6} />
      <path d="M18.4 15.6v2.4" stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Biblioteca — lomos de libros (ámbar) con uno inclinado naranja.
export function IconBiblioteca(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="4" y="5" width="3.6" height="14.6" rx="0.9" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.6} />
      <rect x="9" y="5" width="3.6" height="14.6" rx="0.9" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={1.6} />
      <path d="m14.6 6.6 3.2-.9 3.7 13.5-3.2.9-3.7-13.5Z" fill={C.orange} fillOpacity={0.18} stroke={C.orange} strokeWidth={1.6} />
      <path d="M5.8 8.2h0M10.8 8.2h0" stroke={C.amber} strokeWidth={1.8} />
    </Icon>
  );
}

// Papelera — caneca (coral) con ranuras naranjas.
export function IconPapelera(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4.5 6.6h15" stroke={C.coral} strokeWidth={SW} />
      <path d="M9.4 6.6V5.5c0-.5.4-.9.9-.9h3.4c.5 0 .9.4.9.9v1.1" stroke={C.coral} strokeWidth={1.6} />
      <path d="m6.1 6.6.9 12c.1 1 .9 1.8 1.9 1.8h6.2c1 0 1.8-.8 1.9-1.8l.9-12" fill={C.coral} fillOpacity={0.14} stroke={C.coral} strokeWidth={SW} />
      <path d="M10 10.6v5.8M14 10.6v5.8" stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Configuración — engranaje (índigo) con núcleo naranja.
export function IconConfiguracion(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="5.4" fill={C.indigo} fillOpacity={0.14} stroke={C.indigo} strokeWidth={SW} />
      <path d="M12 3.4v2.5M12 18.1v2.5M3.4 12h2.5M18.1 12h2.5M5.9 5.9l1.8 1.8M16.3 16.3l1.8 1.8M18.1 5.9l-1.8 1.8M7.7 16.3l-1.8 1.8" stroke={C.indigo} strokeWidth={1.7} />
      <circle cx="12" cy="12" r="2" fill={C.orange} />
    </Icon>
  );
}

// Mapa por nombre, para usarlos dinámicamente (p. ej. desde datos o navegación).
export const LABSTREAM_ICONS: Record<IconName, (p: IconProps) => React.ReactElement> = {
  proyectos: IconProyectos,
  equipo: IconEquipo,
  tareas: IconTareas,
  calendario: IconCalendario,
  rodaje: IconRodaje,
  facturacion: IconFacturacion,
  cotizacion: IconCotizacion,
  cliente: IconCliente,
  reportes: IconReportes,
  wiki: IconWiki,
  chat: IconChat,
  notas: IconNotas,
  buscar: IconBuscar,
  notificaciones: IconNotificaciones,
  marcebot: IconMarcebot,
  revisiones: IconRevisiones,
  archivo: IconArchivo,
  horas: IconHoras,
  inicio: IconInicio,
  entregas: IconEntregas,
  comercial: IconComercial,
  biblioteca: IconBiblioteca,
  papelera: IconPapelera,
  configuracion: IconConfiguracion,
};
