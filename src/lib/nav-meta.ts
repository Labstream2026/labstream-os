// Mapeo de ruta → emoji + etiqueta para la cabecera y las pestañas.
// Centralizado aquí para que la topbar (migaja) y la barra de pestañas usen
// exactamente las mismas etiquetas, sin duplicar la lógica.

export type RouteMeta = { emoji: string; label: string };

export function routeMeta(pathname: string): RouteMeta {
  if (pathname === "/") return { emoji: "🏠", label: "Inicio" };
  if (pathname.startsWith("/mis-tareas")) return { emoji: "✅", label: "Mis tareas" };
  if (pathname.startsWith("/estados")) return { emoji: "💬", label: "Chat del día" };
  if (pathname.startsWith("/chat")) return { emoji: "💬", label: "Chats" };
  if (pathname.startsWith("/proyectos/nuevo")) return { emoji: "✨", label: "Nuevo proyecto" };
  if (pathname.startsWith("/proyectos")) return { emoji: "🗂️", label: "Proyectos" };
  if (pathname.startsWith("/plantillas")) return { emoji: "🧩", label: "Plantillas" };
  if (pathname.startsWith("/calendario")) return { emoji: "📅", label: "Calendario" };
  if (pathname.startsWith("/wiki")) return { emoji: "📚", label: "Wiki del equipo" };
  if (pathname.startsWith("/clientes/nuevo")) return { emoji: "✨", label: "Nuevo cliente" };
  if (pathname === "/clientes") return { emoji: "🏢", label: "Clientes" };
  if (pathname.startsWith("/clientes")) return { emoji: "🏢", label: "Cliente" };
  if (pathname.startsWith("/configuracion")) return { emoji: "⚙️", label: "Configuración" };
  if (pathname.startsWith("/cotizaciones")) return { emoji: "📄", label: "Cotizaciones" };
  if (pathname.startsWith("/facturacion")) return { emoji: "🧾", label: "Facturación" };
  if (pathname.startsWith("/biblioteca")) return { emoji: "📁", label: "Biblioteca" };
  if (pathname.startsWith("/revisiones")) return { emoji: "🎬", label: "Revisiones" };
  if (pathname.startsWith("/reportes")) return { emoji: "📊", label: "Reportes" };
  if (pathname.startsWith("/timeline")) return { emoji: "🗓️", label: "Timeline" };
  if (pathname.startsWith("/asistente")) return { emoji: "✨", label: "Asistente IA" };
  if (pathname.startsWith("/perfil")) return { emoji: "🙂", label: "Mi perfil" };
  return { emoji: "•", label: "Labstream" };
}
