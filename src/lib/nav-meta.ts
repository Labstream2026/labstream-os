// Mapeo de ruta → ícono del set Labstream + etiqueta para la cabecera y las pestañas.
// Centralizado aquí para que la topbar (migaja) y la barra de pestañas usen exactamente
// las mismas etiquetas, sin duplicar la lógica. El ícono es una CLAVE de LABSTREAM_ICONS
// (así este módulo sigue siendo importable desde servidor sin arrastrar JSX).

import type { IconName } from "@/components/icons";

export type RouteMeta = { icon: IconName | null; label: string };

export function routeMeta(pathname: string): RouteMeta {
  if (pathname === "/") return { icon: "inicio", label: "Inicio" };
  if (pathname.startsWith("/mis-tareas")) return { icon: "tareas", label: "Mis tareas" };
  if (pathname.startsWith("/mis-entregas")) return { icon: "entregas", label: "Mis entregas" };
  if (pathname.startsWith("/estados")) return { icon: "chat", label: "Chat del día" };
  if (pathname.startsWith("/chat")) return { icon: "chat", label: "Chats" };
  if (pathname.startsWith("/notas")) return { icon: "notas", label: "Notas" };
  if (pathname.startsWith("/recordatorios")) return { icon: "recordatorios", label: "Recordatorios" };
  if (pathname.startsWith("/proyectos/nuevo")) return { icon: "propuestas", label: "Nuevo proyecto" };
  if (pathname.startsWith("/proyectos")) return { icon: "proyectos", label: "Proyectos" };
  if (pathname.startsWith("/plantillas")) return { icon: "tarjetas", label: "Plantillas" };
  if (pathname.startsWith("/calendario")) return { icon: "calendario", label: "Calendario" };
  if (pathname.startsWith("/wiki")) return { icon: "wiki", label: "Wiki del equipo" };
  if (pathname.startsWith("/clientes/nuevo")) return { icon: "propuestas", label: "Nuevo cliente" };
  if (pathname === "/clientes") return { icon: "cliente", label: "Clientes" };
  if (pathname.startsWith("/clientes")) return { icon: "cliente", label: "Cliente" };
  if (pathname.startsWith("/configuracion")) return { icon: "configuracion", label: "Configuración" };
  if (pathname.startsWith("/comercial")) return { icon: "comercial", label: "Embudo comercial" };
  if (pathname.startsWith("/cotizaciones")) return { icon: "cotizacion", label: "Cotizaciones" };
  if (pathname.startsWith("/facturacion")) return { icon: "facturacion", label: "Facturación" };
  if (pathname.startsWith("/biblioteca")) return { icon: "biblioteca", label: "Biblioteca" };
  if (pathname.startsWith("/revisiones")) return { icon: "revisiones", label: "Revisiones" };
  if (pathname.startsWith("/reportes")) return { icon: "reportes", label: "Reportes" };
  if (pathname.startsWith("/timeline")) return { icon: "horas", label: "Timeline" };
  if (pathname.startsWith("/asistente")) return { icon: "marcebot", label: "Asistente IA" };
  if (pathname.startsWith("/perfil")) return { icon: "personalizacion", label: "Mi perfil" };
  return { icon: null, label: "Labstream" };
}
