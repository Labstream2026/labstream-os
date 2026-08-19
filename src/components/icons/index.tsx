import * as React from "react";
import { cn } from "@/lib/utils";

// ── Íconos propios de Labstream ──
// Set de TINTA Y ACENTO, hecho a medida (no depende de librerías externas): el cuerpo del ícono
// se dibuja con el color del TEXTO que lo rodea y solo un detalle lleva el naranja de marca
// (#F47A20), con el trazo redondeado y geométrico del logo. Los rellenos usan opacidad
// (fill-opacity) para que se vean bien en tema claro y oscuro sin variantes. API igual que un
// ícono de UI: reciben `className` (por defecto size-6) y un `label` opcional para
// accesibilidad; sin label son decorativos.
//
// Hasta 2026-08-19 cada ícono traía su propio tono saturado. Se cambió por dos razones: nueve
// colores distintos en una columna de nueve renglones compiten entre sí, y —lo que de verdad
// obligaba— el color iba ESCRITO DENTRO del svg, así que el ícono no podía saber si su pestaña
// estaba activa: el texto se ponía naranja y el ícono se quedaba violeta. Heredando el color
// del texto eso se resuelve solo, y el tema oscuro también.
//
// Fase 1 = núcleo de secciones/áreas más usadas. Fase 2 = ampliar el set y cablearlos en más
// superficies. Para usarlos: import { IconProyectos } from "@/components/icons".
//
// ── CUÁL DE LOS DOS SETS USAR ──
// La app tiene dos lenguajes de ícono a propósito, y mezclarlos al azar es lo que hace que la
// misma cosa se vea distinta en dos pantallas. La regla:
//
//   ESTE SET (tinta + acento naranja) = IDENTIDAD. Qué ES algo.
//     · el ícono de la cabecera de una página (PageHeader / routeMeta)
//     · un resultado del buscador — cada tipo con su ícono
//     · una entidad: cliente, proyecto (EntityEmoji con el token "ls:")
//     · pestañas DENTRO de una entidad (las del proyecto), que nombran tipos de contenido
//
//   LUCIDE (línea, monocromo) = CROMO Y MANDOS. Qué HACE algo, o dónde estás.
//     · el rail y los menús de navegación — se decidió a propósito que fueran de línea, para
//       que a 20 px y en columna todos pesen igual (ver el comentario en sidebar.tsx)
//     · botones y afordancias: guardar, borrar, cerrar, cargando, desplegar
//
// La prueba de fuego: si el mismo concepto aparece DOS VECES EN LA MISMA VISTA con dos dibujos
// distintos, hay un error — sin importar de qué set sea cada uno.

// Paleta de la familia. El naranja es el ÚNICO color propio: el hilo de marca, reservado para
// UN detalle por ícono. Todo lo demás es `currentColor` — el color del texto que lo rodea.
//
// Las claves de tono siguen existiendo (y todas valen lo mismo) a propósito: los ~150 íconos de
// este archivo y de marks.tsx se escribieron nombrando su tono, y conservar los nombres deja el
// cambio en UNA línea, reversible, sin tocar ni un `path`. Además guarda la intención original
// de cada trazo por si algún día se quiere volver a teñir algo.
// El acento va por variable CSS para que una superficie INVERTIDA pueda apagarlo: en el botón
// flotante naranja, un acento naranja sobre naranja se ve como un agujero (la burbuja del chat
// salía con dos puntos en vez de tres). Ahí basta con `[--icono-acento:currentColor]` y el
// ícono queda de un solo color. Sin la variable, el naranja de marca de siempre.
const TINTA = "currentColor";
export const ACENTO = "var(--icono-acento, #F47A20)";
export const C = {
  orange: ACENTO,
  violet: TINTA,
  blue: TINTA,
  teal: TINTA,
  green: TINTA,
  amber: TINTA,
  rose: TINTA,
  indigo: TINTA,
  coral: TINTA,
  sky: TINTA,
} as const;

export type IconName =
  | "proyectos" | "equipo" | "tareas" | "calendario" | "rodaje" | "facturacion"
  | "cotizacion" | "cliente" | "reportes" | "wiki" | "chat" | "notas"
  | "buscar" | "notificaciones" | "marcebot" | "revisiones" | "archivo" | "horas"
  | "inicio" | "entregas" | "comercial" | "biblioteca" | "papelera" | "configuracion" | "recordatorios"
  | "usuarios" | "etiquetas" | "roles" | "auditoria" | "integraciones" | "api"
  | "marca" | "flujo" | "personalizacion"
  | "tablero" | "tableroH" | "cronograma" | "lista" | "tarjetas" | "tabla" | "galeria" | "archivador"
  | "midia" | "completadas" | "raci" | "propuestas" | "actividad" | "mas"
  | "solicitudes" | "portada" | "disco" | "mapa" | "correo";

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
      {/* Era el único ícono ENTERAMENTE naranja: nació así cuando el naranja era un color más
          entre nueve. Con el set en tinta se leía como un manchón. Cuerpo en tinta y los OJOS
          de acento — que además es donde se ve que el bot está encendido. */}
      <rect x="4" y="8" width="16" height="11" rx="4" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="M12 8V4.9" stroke={C.violet} strokeWidth={SW} />
      <circle cx="12" cy="3.7" r="1.4" fill={C.violet} />
      <circle cx="9.3" cy="13" r="1.5" fill={C.orange} />
      <circle cx="14.7" cy="13" r="1.5" fill={C.orange} />
      <path d="M9.6 16.3h4.8" stroke={C.violet} strokeWidth={1.6} />
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

// Recordatorios — despertador (violeta) con manecillas naranjas.
export function IconRecordatorios(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="13" r="7" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="M12 9.6V13l2.7 1.9" stroke={C.orange} strokeWidth={1.9} />
      <path d="M3.6 7.4a4.6 4.6 0 0 1 3-3.3M20.4 7.4a4.6 4.6 0 0 0-3-3.3" stroke={C.violet} strokeWidth={SW} />
      <path d="m7.1 19.1-1.3 1.5M16.9 19.1l1.3 1.5" stroke={C.violet} strokeWidth={1.6} />
    </Icon>
  );
}

// Usuarios — carné de identidad (azul) con persona y línea de acento naranja.
export function IconUsuarios(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.6" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={SW} />
      <circle cx="8.7" cy="10.2" r="1.8" fill={C.blue} fillOpacity={0.18} stroke={C.blue} strokeWidth={1.6} />
      <path d="M5.9 15.8c.4-1.7 1.5-2.7 2.8-2.7s2.4 1 2.8 2.7" stroke={C.blue} strokeWidth={1.6} />
      <path d="M13.7 9.4h3.8M13.7 12.2h3.8" stroke={C.blue} strokeWidth={1.6} />
      <path d="M13.7 15.2h2.4" stroke={C.orange} strokeWidth={2} />
    </Icon>
  );
}

// Estados y prioridades — etiqueta (rosa) con ojal naranja.
export function IconEtiquetas(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 5.6C4 4.7 4.7 4 5.6 4h5.3c.42 0 .83.17 1.13.47l7.5 7.5c.62.62.62 1.64 0 2.26l-5.3 5.3c-.62.62-1.64.62-2.26 0l-7.5-7.5A1.6 1.6 0 0 1 4 10.9V5.6Z" fill={C.rose} fillOpacity={0.14} stroke={C.rose} strokeWidth={SW} />
      <circle cx="8.1" cy="8.1" r="1.5" fill={C.orange} />
    </Icon>
  );
}

// Roles y permisos — escudo (teal) con cerradura naranja.
export function IconRoles(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3.4l6.7 2.5v5.2c0 4.3-2.7 7.4-6.7 9-4-1.6-6.7-4.7-6.7-9V5.9L12 3.4Z" fill={C.teal} fillOpacity={0.14} stroke={C.teal} strokeWidth={SW} />
      <circle cx="12" cy="10.6" r="1.7" fill={C.orange} />
      <path d="M12 12v3.2" stroke={C.orange} strokeWidth={1.9} />
    </Icon>
  );
}

// Auditoría — registro (índigo) revisado con lupa naranja.
export function IconAuditoria(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="5" y="3.5" width="12" height="17" rx="2.5" fill={C.indigo} fillOpacity={0.14} stroke={C.indigo} strokeWidth={SW} />
      <path d="M8 8h6M8 11h6M8 14h3" stroke={C.indigo} strokeWidth={1.6} />
      <circle cx="15.2" cy="15.2" r="3.1" fill={C.orange} fillOpacity={0.16} stroke={C.orange} strokeWidth={1.8} />
      <path d="M17.5 17.5l3 3" stroke={C.orange} strokeWidth={2} />
    </Icon>
  );
}

// Integraciones — enchufe (azul) con cable naranja.
export function IconIntegraciones(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9.2 3.2v3.6M14.8 3.2v3.6" stroke={C.blue} strokeWidth={SW} />
      <path d="M6.4 6.8h11.2v3.4c0 3.1-2.5 5.6-5.6 5.6s-5.6-2.5-5.6-5.6V6.8Z" fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={SW} />
      <path d="M12 15.8v2.2c0 1.5 1.2 2.3 2.7 2.3" stroke={C.orange} strokeWidth={1.8} />
    </Icon>
  );
}

// API — llave (ámbar) con centro y dientes naranjas (credenciales).
export function IconApi(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="8.2" cy="8.2" r="4.1" fill={C.amber} fillOpacity={0.16} stroke={C.amber} strokeWidth={SW} />
      <circle cx="8.2" cy="8.2" r="1.4" fill={C.orange} />
      <path d="M11.2 11.2l8.6 8.6" stroke={C.amber} strokeWidth={SW} />
      <path d="M15.7 15.7l2.1-2.1M18.3 18.3l2.1-2.1" stroke={C.orange} strokeWidth={1.8} />
    </Icon>
  );
}

// Marca — rodillo de pintura (rosa) con mango naranja.
export function IconMarca(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.2" y="3.6" width="14" height="5.6" rx="2" fill={C.rose} fillOpacity={0.14} stroke={C.rose} strokeWidth={SW} />
      <path d="M17.2 6.4h1.9c1 0 1.9.8 1.9 1.9v1.7c0 1-.8 1.9-1.9 1.9h-6.6c-1 0-1.9.8-1.9 1.9v2.1" stroke={C.rose} strokeWidth={SW} />
      <rect x="9.3" y="15.9" width="2.6" height="4.6" rx="1.1" fill={C.orange} fillOpacity={0.9} stroke={C.orange} strokeWidth={1.5} />
    </Icon>
  );
}

// Estados de proyecto — flujo de nodos (índigo) con el estado activo en naranja.
export function IconFlujo(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M7 14.4l3.4-4.8M13.6 9.6l3.4 4.8" stroke={C.indigo} strokeWidth={1.7} />
      <circle cx="5.5" cy="16.6" r="2.5" fill={C.indigo} fillOpacity={0.16} stroke={C.indigo} strokeWidth={1.7} />
      <circle cx="12" cy="7.4" r="2.5" fill={C.orange} fillOpacity={0.2} stroke={C.orange} strokeWidth={1.7} />
      <circle cx="12" cy="7.4" r="1" fill={C.orange} />
      <circle cx="18.5" cy="16.6" r="2.5" fill={C.indigo} fillOpacity={0.16} stroke={C.indigo} strokeWidth={1.7} />
    </Icon>
  );
}

// Mi personalización — paleta de pintor (violeta) con óleos de la familia y uno naranja.
export function IconPersonalizacion(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3.6C7.2 3.6 3.4 7.2 3.4 11.8c0 4.6 3.8 8.3 8.6 8.3 1 0 1.7-.7 1.7-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6h2c2.6 0 4.8-2.1 4.8-4.7 0-3.9-4.1-6.4-9.3-6.4Z" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <circle cx="7.7" cy="9.7" r="1.05" fill={C.blue} />
      <circle cx="11" cy="7.1" r="1.05" fill={C.teal} />
      <circle cx="14.9" cy="7.6" r="1.05" fill={C.rose} />
      <circle cx="17.2" cy="10.6" r="1.05" fill={C.orange} />
    </Icon>
  );
}

// ── Vistas y pestañas (unificación: fuera emojis ▤ ☰ 📋 ⭐ …) ──

// Tablero (kanban vertical) — columnas (violeta) con la central naranja.
export function IconTablero(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="4" width="4.6" height="13" rx="1.5" fill={C.violet} fillOpacity={0.16} stroke={C.violet} strokeWidth={1.6} />
      <rect x="9.7" y="4" width="4.6" height="16.5" rx="1.5" fill={C.orange} fillOpacity={0.18} stroke={C.orange} strokeWidth={1.6} />
      <rect x="15.9" y="4" width="4.6" height="10" rx="1.5" fill={C.violet} fillOpacity={0.16} stroke={C.violet} strokeWidth={1.6} />
    </Icon>
  );
}

// Tablero horizontal — carriles (violeta) con el central naranja.
export function IconTableroH(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="4.2" width="17" height="4.4" rx="1.5" fill={C.violet} fillOpacity={0.16} stroke={C.violet} strokeWidth={1.6} />
      <rect x="3.5" y="10.2" width="13" height="4.4" rx="1.5" fill={C.orange} fillOpacity={0.18} stroke={C.orange} strokeWidth={1.6} />
      <rect x="3.5" y="16.2" width="15.5" height="4.4" rx="1.5" fill={C.violet} fillOpacity={0.16} stroke={C.violet} strokeWidth={1.6} />
    </Icon>
  );
}

// Cronograma (Gantt) — barras ESCALONADAS: cada una empieza donde la tarea empieza. Es lo
// único que la separa de IconTableroH, cuyos carriles arrancan todos del margen izquierdo; a
// 16 px el escalón se lee y la longitud sola no. La del medio, en naranja, es la de hoy.
export function IconCronograma(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.4" y="5.2" width="9" height="3.6" rx="1.4" fill={C.teal} fillOpacity={0.16} stroke={C.teal} strokeWidth={1.6} />
      <rect x="8.4" y="10.2" width="10" height="3.6" rx="1.4" fill={C.orange} fillOpacity={0.18} stroke={C.orange} strokeWidth={1.6} />
      <rect x="6" y="15.2" width="7.6" height="3.6" rx="1.4" fill={C.teal} fillOpacity={0.16} stroke={C.teal} strokeWidth={1.6} />
    </Icon>
  );
}

// Lista — renglones con viñeta (azul), el del medio naranja.
export function IconLista(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="5.2" cy="6.6" r="1.2" fill={C.blue} />
      <path d="M9 6.6h11" stroke={C.blue} strokeWidth={1.8} />
      <circle cx="5.2" cy="12" r="1.2" fill={C.orange} />
      <path d="M9 12h8" stroke={C.orange} strokeWidth={1.8} />
      <circle cx="5.2" cy="17.4" r="1.2" fill={C.blue} />
      <path d="M9 17.4h9.5" stroke={C.blue} strokeWidth={1.8} />
    </Icon>
  );
}

// Tarjetas — retícula 2×2 (teal) con una naranja.
export function IconTarjetas(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.8" fill={C.teal} fillOpacity={0.16} stroke={C.teal} strokeWidth={1.6} />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.8" fill={C.teal} fillOpacity={0.16} stroke={C.teal} strokeWidth={1.6} />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.8" fill={C.teal} fillOpacity={0.16} stroke={C.teal} strokeWidth={1.6} />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.8" fill={C.orange} fillOpacity={0.18} stroke={C.orange} strokeWidth={1.6} />
    </Icon>
  );
}

// Tabla — rejilla con cabecera (índigo) y celda activa naranja.
export function IconTabla(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" fill={C.indigo} fillOpacity={0.12} stroke={C.indigo} strokeWidth={SW} />
      <path d="M3.5 6.5c0-1.1.9-2 2-2h13c1.1 0 2 .9 2 2V9h-17Z" fill={C.indigo} fillOpacity={0.2} />
      <path d="M3.5 9h17M3.5 14.2h17M10.2 9v10.5M16.9 9v10.5" stroke={C.indigo} strokeWidth={1.4} />
      <circle cx="6.85" cy="11.6" r="1" fill={C.orange} />
    </Icon>
  );
}

// Galería — marco (rosa) con sol naranja y montañas.
export function IconGaleria(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill={C.rose} fillOpacity={0.14} stroke={C.rose} strokeWidth={SW} />
      <circle cx="8.3" cy="9.3" r="1.6" fill={C.orange} />
      <path d="M5.5 19.4l4.6-5.4c.5-.6 1.4-.6 1.9 0l2.1 2.5 1.6-1.9c.5-.6 1.4-.6 1.9 0l2.9 3.4" stroke={C.rose} strokeWidth={1.7} />
    </Icon>
  );
}

// Archivador — cajonera (ámbar) con el cajón medio naranja.
export function IconArchivador(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.2" fill={C.amber} fillOpacity={0.14} stroke={C.amber} strokeWidth={SW} />
      <path d="M4.5 9.2h15M4.5 14.9h15" stroke={C.amber} strokeWidth={1.6} />
      <path d="M10.5 6.4h3" stroke={C.amber} strokeWidth={1.8} />
      <path d="M10.5 12.1h3" stroke={C.orange} strokeWidth={2} />
      <path d="M10.5 17.7h3" stroke={C.amber} strokeWidth={1.8} />
    </Icon>
  );
}

// Mi día — estrella (ámbar) con centro naranja (las tareas que marco para hoy).
export function IconMiDia(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.13 5.11a.56.56 0 0 0 .47.35l5.52.44c.5.04.7.66.32.99l-4.2 3.6a.56.56 0 0 0-.18.56l1.28 5.38a.56.56 0 0 1-.84.61l-4.72-2.88a.56.56 0 0 0-.59 0L6.98 20.54a.56.56 0 0 1-.84-.61l1.29-5.38a.56.56 0 0 0-.19-.56l-4.2-3.6a.56.56 0 0 1 .32-.99l5.52-.44a.56.56 0 0 0 .47-.35L11.48 3.5Z" fill={C.amber} fillOpacity={0.18} stroke={C.amber} strokeWidth={SW} />
      <circle cx="12" cy="11.6" r="1.7" fill={C.orange} />
    </Icon>
  );
}

// Completadas — círculo (verde) con doble check (el principal naranja).
export function IconCompletadas(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.2" fill={C.green} fillOpacity={0.12} stroke={C.green} strokeWidth={SW} />
      <path d="M6.6 12.6l2.7 2.7 4.2-5" stroke={C.orange} strokeWidth={2} />
      <path d="M12.6 14.7l1.6 1.6 4-4.8" stroke={C.green} strokeWidth={1.8} />
    </Icon>
  );
}

// RACI — brújula (índigo) con aguja naranja (quién hace qué).
export function IconRaci(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.2" fill={C.indigo} fillOpacity={0.12} stroke={C.indigo} strokeWidth={SW} />
      <path d="M15.2 8.8l-1.7 4.7-4.7 1.7 1.7-4.7Z" fill={C.orange} fillOpacity={0.8} stroke={C.orange} strokeWidth={1.4} />
      <circle cx="12" cy="5.4" r="0.8" fill={C.indigo} />
    </Icon>
  );
}

// Propuestas — destellos (ámbar) con chispa naranja.
export function IconPropuestas(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M10.8 3.5l1.8 4.5 4.5 1.8-4.5 1.8-1.8 4.5-1.8-4.5-4.5-1.8 4.5-1.8Z" fill={C.amber} fillOpacity={0.18} stroke={C.amber} strokeWidth={1.7} />
      <path d="M18 14.6l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9Z" fill={C.orange} />
    </Icon>
  );
}

// Actividad — línea de pulso (teal) con punto naranja.
export function IconActividad(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.5 13h3.2l2.1-5 3.3 8.2 2.4-5.7 1.1 2.5h2.9" stroke={C.teal} strokeWidth={1.9} />
      <circle cx="20" cy="13" r="1.4" fill={C.orange} />
    </Icon>
  );
}

// Más — tres puntos (violeta) con el central naranja (menú del móvil).
export function IconMas(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="5.5" cy="12" r="1.9" fill={C.violet} fillOpacity={0.85} />
      <circle cx="12" cy="12" r="1.9" fill={C.orange} />
      <circle cx="18.5" cy="12" r="1.9" fill={C.violet} fillOpacity={0.85} />
    </Icon>
  );
}

/* ═══════════ Conceptos que no tenían dibujo propio (2026-08-19) ═══════════ */
// Cinco pantallas resolvían su identidad con un ícono de lucide, que por la regla de arriba es
// para MANDOS, no para decir qué ES algo. Dibujados ya en tinta + un acento: al no haber que
// elegir tono, el trabajo es solo decidir cuál es EL detalle que cuenta.
//
// NO se dibujaron dos que estaban en la lista, porque ya existen y repetirlos sería ruido:
// «checklist» lo cubre IconTareas (un portapapeles con su check) y «entregable», IconEntregas.

// Solicitudes — burbuja con la cola a la DERECHA (llega de fuera, del cliente) y un más de
// acento. Se conserva la metáfora del ícono de lucide que había: el equipo ya la reconoce.
export function IconSolicitudes(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v7.6a2.8 2.8 0 0 1-2.8 2.8h-.6v3.2l-4-3.2H6.8A2.8 2.8 0 0 1 4 14.4V6.8Z" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="M12 8.1v5M9.5 10.6h5" stroke={C.orange} strokeWidth={2} />
    </Icon>
  );
}

// Portada — una PÁGINA cuya banda de arriba es la imagen (con su sol de acento), no un cuadro
// lleno de foto: eso ya es IconGaleria. Lo que distingue una portada es que encabeza algo.
export function IconPortada(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" fill={C.violet} fillOpacity={0.12} stroke={C.violet} strokeWidth={SW} />
      <path d="M4 10.6h16" stroke={C.violet} strokeWidth={1.6} />
      <circle cx="8.2" cy="7" r="1.5" fill={C.orange} />
      <path d="M7.2 14.2h9.6M7.2 17.2h5.8" stroke={C.violet} strokeWidth={1.6} />
    </Icon>
  );
}

// Disco — dos bahías con su testigo encendido de acento. Ni libros (IconBiblioteca) ni cajones
// (IconArchivador): esto es la máquina donde vive el material.
export function IconDisco(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="M3.5 12h17" stroke={C.violet} strokeWidth={1.6} />
      <path d="M6.4 9h5.2M6.4 15h5.2" stroke={C.violet} strokeWidth={1.5} />
      <circle cx="17.3" cy="9" r="1.1" fill={C.orange} />
      <circle cx="17.3" cy="15" r="1.1" fill={C.violet} />
    </Icon>
  );
}

// Mapa — el plegado clásico con el alfiler de acento: dónde está el material.
export function IconMapa(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.6 6.9 9.2 4.7l5.6 2.2 5.6-2.2v12.4l-5.6 2.2-5.6-2.2-5.6 2.2V6.9Z" fill={C.violet} fillOpacity={0.12} stroke={C.violet} strokeWidth={SW} />
      <path d="M9.2 4.7v12.4M14.8 6.9v12.4" stroke={C.violet} strokeWidth={1.4} />
      <path d="M12 7.8a2.1 2.1 0 0 1 2.1 2.1c0 1.5-2.1 3.8-2.1 3.8s-2.1-2.3-2.1-3.8A2.1 2.1 0 0 1 12 7.8Z" fill={C.orange} />
    </Icon>
  );
}

// Correo — el sobre, con la solapa de acento (es lo único que se mueve al abrirlo).
export function IconCorreo(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.2" y="5.5" width="17.6" height="13" rx="2.5" fill={C.violet} fillOpacity={0.14} stroke={C.violet} strokeWidth={SW} />
      <path d="m3.8 7.4 6.9 5c.8.6 1.8.6 2.6 0l6.9-5" stroke={C.orange} strokeWidth={1.8} />
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
  recordatorios: IconRecordatorios,
  usuarios: IconUsuarios,
  etiquetas: IconEtiquetas,
  roles: IconRoles,
  auditoria: IconAuditoria,
  integraciones: IconIntegraciones,
  api: IconApi,
  marca: IconMarca,
  flujo: IconFlujo,
  personalizacion: IconPersonalizacion,
  tablero: IconTablero,
  tableroH: IconTableroH,
  cronograma: IconCronograma,
  lista: IconLista,
  tarjetas: IconTarjetas,
  tabla: IconTabla,
  galeria: IconGaleria,
  archivador: IconArchivador,
  midia: IconMiDia,
  completadas: IconCompletadas,
  raci: IconRaci,
  propuestas: IconPropuestas,
  actividad: IconActividad,
  mas: IconMas,
  solicitudes: IconSolicitudes,
  portada: IconPortada,
  disco: IconDisco,
  mapa: IconMapa,
  correo: IconCorreo,
};
