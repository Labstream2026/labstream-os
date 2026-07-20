// Mapeo de ruta → ícono del set Labstream + etiqueta + descripción corta para la cabecera
// de la barra superior y las pestañas. Centralizado aquí para que la topbar y la barra de
// pestañas usen exactamente las mismas etiquetas, sin duplicar la lógica. El ícono es una
// CLAVE de LABSTREAM_ICONS (así este módulo sigue siendo importable desde servidor sin
// arrastrar JSX). La descripción es la línea pequeña bajo el título EN LA BARRA; las páginas
// con datos vivos (conteos) la sobreescriben inyectando su propia identidad (PageHeader).

import type { IconName } from "@/components/icons";

export type RouteMeta = { icon: IconName | null; label: string; desc?: string };

export function routeMeta(pathname: string): RouteMeta {
  if (pathname === "/") return { icon: "inicio", label: "Inicio", desc: "Tu día de un vistazo: pendientes, avisos y actividad" };
  if (pathname.startsWith("/mis-tareas")) return { icon: "tareas", label: "Mis tareas", desc: "Todo lo tuyo, de todos los proyectos" };
  if (pathname.startsWith("/mis-entregas")) return { icon: "entregas", label: "Mis entregas", desc: "Tus proyectos y material para revisar" };
  if (pathname.startsWith("/estados")) return { icon: "chat", label: "Chat del día", desc: "El pulso del equipo, hoy" };
  if (pathname.startsWith("/chat")) return { icon: "chat", label: "Chats", desc: "Canales, directos y clientes" };
  if (pathname.startsWith("/notas")) return { icon: "notas", label: "Notas", desc: "Ideas y apuntes rápidos del equipo" };
  if (pathname.startsWith("/recordatorios")) return { icon: "recordatorios", label: "Recordatorios", desc: "Avisos puntuales o recurrentes, tuyos o del equipo" };
  if (pathname.startsWith("/proyectos/nuevo")) return { icon: "propuestas", label: "Nuevo proyecto", desc: "Crea un proyecto para un cliente" };
  if (pathname.startsWith("/proyectos")) return { icon: "proyectos", label: "Proyectos", desc: "Toda la producción del estudio" };
  if (pathname.startsWith("/plantillas")) return { icon: "tarjetas", label: "Plantillas", desc: "Documentos y flujos reutilizables" };
  if (pathname.startsWith("/calendario")) return { icon: "calendario", label: "Calendario del equipo", desc: "Citas, rodajes y entregas de todo el estudio" };
  if (pathname.startsWith("/wiki")) return { icon: "wiki", label: "Wiki del equipo", desc: "Documentación, inventario y accesos" };
  if (pathname.startsWith("/clientes/nuevo")) return { icon: "propuestas", label: "Nuevo cliente", desc: "Da de alta un cliente del estudio" };
  if (pathname === "/clientes") return { icon: "cliente", label: "Clientes", desc: "Las cuentas del estudio y sus proyectos" };
  if (pathname.startsWith("/clientes")) return { icon: "cliente", label: "Cliente", desc: "Ficha, proyectos y facturación de la cuenta" };
  if (pathname.startsWith("/configuracion")) return { icon: "configuracion", label: "Configuración", desc: "Usuarios, roles, integraciones y auditoría" };
  if (pathname.startsWith("/comercial")) return { icon: "comercial", label: "Embudo comercial", desc: "Oportunidades y seguimiento de ventas" };
  if (pathname.startsWith("/cotizaciones")) return { icon: "cotizacion", label: "Cotizaciones", desc: "Propuestas económicas para clientes" };
  if (pathname.startsWith("/facturacion")) return { icon: "facturacion", label: "Facturación", desc: "Facturas, pagos y cartera" };
  if (pathname.startsWith("/biblioteca")) return { icon: "biblioteca", label: "Biblioteca", desc: "Material de referencia del estudio" };
  if (pathname.startsWith("/revisiones")) return { icon: "revisiones", label: "Revisiones", desc: "Entregables esperando tu visto bueno" };
  if (pathname.startsWith("/reportes")) return { icon: "reportes", label: "Reportes", desc: "Métricas de producción y del equipo" };
  if (pathname.startsWith("/timeline")) return { icon: "horas", label: "Timeline", desc: "La línea de tiempo de todo el estudio" };
  if (pathname.startsWith("/asistente")) return { icon: "marcebot", label: "Asistente IA", desc: "Marcebot: pregunta, crea y automatiza" };
  if (pathname.startsWith("/perfil")) return { icon: "personalizacion", label: "Mi perfil", desc: "Tu cuenta y preferencias" };
  if (pathname.startsWith("/ajustes")) return { icon: "configuracion", label: "Ajustes", desc: "Tu cuenta, apariencia y preferencias" };
  if (pathname.startsWith("/papelera")) return { icon: "papelera", label: "Papelera", desc: "Borrado suave: restaura lo que necesites" };
  return { icon: null, label: "Labstream" };
}
