// Grupos de acciones de auditoría, compartidos entre el panel (chips/filtros del cliente)
// y las acciones de servidor (filtro por prefijo). Módulo plano SIN "use server": un módulo
// de servidor solo puede exportar funciones async, y esta tabla la necesita también el cliente.

export const GROUP_PREFIXES: Record<string, string[]> = {
  tareas: ["task.", "checklist.", "recurring."],
  proyectos: ["project.", "equipos."],
  entregables: ["deliverable."],
  clientes: ["client."],
  archivos: ["file.", "folder."],
  chat: ["chat.", "message."],
  wiki: ["wiki."],
  notas: ["note."],
  recordatorios: ["reminder.", "snooze"],
  calendario: ["event.", "calendar."],
  facturacion: ["quote.", "invoice.", "proposal."],
  config: ["user.", "users.", "role.", "settings.", "label.", "projectstatus.", "branding."],
  sesiones: ["session."],
  api: ["api.", "apikey."],
};

// Etiqueta y color del chip por grupo (el color es un hex fijo, legible en ambos temas).
export const GROUP_META: Record<string, { label: string; color: string }> = {
  tareas: { label: "Tareas", color: "#6366f1" },
  proyectos: { label: "Proyectos", color: "#0ea5e9" },
  entregables: { label: "Entregables", color: "#8b5cf6" },
  clientes: { label: "Clientes", color: "#10b981" },
  archivos: { label: "Archivos", color: "#06b6d4" },
  chat: { label: "Chat", color: "#f59e0b" },
  wiki: { label: "Wiki", color: "#14b8a6" },
  notas: { label: "Notas", color: "#84cc16" },
  recordatorios: { label: "Recordatorios", color: "#f43f5e" },
  calendario: { label: "Calendario", color: "#3b82f6" },
  facturacion: { label: "Facturación", color: "#f97316" },
  config: { label: "Config", color: "#ef4444" },
  sesiones: { label: "Sesión", color: "#64748b" },
  api: { label: "API", color: "#a855f7" },
};

export function groupOf(action: string): string | null {
  for (const [g, prefixes] of Object.entries(GROUP_PREFIXES)) {
    if (prefixes.some((p) => action.startsWith(p))) return g;
  }
  return null;
}
