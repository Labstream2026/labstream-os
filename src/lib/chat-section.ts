// Secciones/dependencias de la app a las que se puede ASIGNAR un grupo de chat. Cada una exige el
// permiso de VER esa sección para participar (entrar, añadir miembros, etiquetar). Los PROYECTOS y
// CLIENTES no están aquí: ya tienen su chat por defecto y no se reasignan.
// PURO (sin imports de servidor): lo usa también el cliente (channel-settings). Los chequeos de
// acceso que necesitan sesión/BD viven en chat-section-access.ts.
export const CHAT_SECTIONS: Record<string, { label: string; href: string; perm: string }> = {
  wiki: { label: "Wiki", href: "/wiki", perm: "ver_wiki" },
  biblioteca: { label: "Biblioteca", href: "/biblioteca", perm: "ver_biblioteca" },
  reportes: { label: "Reportes", href: "/reportes", perm: "ver_reportes" },
  cotizaciones: { label: "Cotizaciones", href: "/cotizaciones", perm: "ver_cotizaciones" },
  calendario: { label: "Calendario", href: "/calendario", perm: "ver_calendario" },
};

export function sectionMeta(section: string | null | undefined) {
  return section ? CHAT_SECTIONS[section] ?? null : null;
}
