// Catálogo de EVENTOS que generan notificaciones en la app. Es la lista que el administrador
// activa/desactiva para todo el equipo (panel en Configuración → Notificaciones).
//
// Este módulo es PURO (sin acceso a base de datos) para poder importarse también desde el
// componente cliente del panel. La compuerta real (saber qué está desactivado) vive en
// `@/lib/notify` (servidor). Cada llamada a notify*/notifyAndEmail pasa su `event: <key>`;
// si ese key está desactivado, no se envía (ni in-app, ni push, ni correo).
//
// Añadir un evento nuevo = añadir una entrada aquí y pasar su key en la llamada correspondiente.
// No requiere migración: por defecto TODO está activo y la BD solo guarda lo que se desactiva.

export type NotificationCategory =
  | "Tareas"
  | "Entregables y revisiones"
  | "Chat"
  | "Agenda"
  | "Administración"
  | "Recordatorios"
  | "Marcebot";

export type NotificationEventDef = {
  key: string;
  label: string;
  description: string;
  category: NotificationCategory;
  // Recomendado dejarlo SIEMPRE activo (avisos sensibles de cuenta/permisos). Se puede
  // desactivar igual, pero la UI lo señala para evitar apagar algo importante por error.
  essential?: boolean;
};

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "Tareas",
  "Entregables y revisiones",
  "Chat",
  "Agenda",
  "Administración",
  "Recordatorios",
  "Marcebot",
];

export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  // ── Tareas ──
  { key: "task_assigned", label: "Asignación de tarea", description: "Cuando te asignan una tarea (nueva o reasignada).", category: "Tareas" },
  { key: "task_unassigned", label: "Te quitan de una tarea", description: "Cuando dejas de ser responsable de una tarea.", category: "Tareas" },
  { key: "task_due_date", label: "Cambio de fecha de entrega (tarea)", description: "Cuando cambian la fecha de entrega de tu tarea.", category: "Tareas" },
  { key: "task_shoot_date", label: "Cambio de fecha de rodaje", description: "Cuando fijan o cambian la fecha de rodaje de tu tarea.", category: "Tareas" },
  { key: "task_schedule", label: "Reprogramación en el cronograma", description: "Cuando mueven tus tareas arrastrando en el cronograma (Gantt).", category: "Tareas" },
  { key: "task_comment", label: "Comentario en una tarea", description: "Cuando comentan una tarea tuya.", category: "Tareas" },
  { key: "task_recurring", label: "Tarea recurrente generada", description: "Cuando el sistema crea automáticamente una tarea recurrente y te la asigna.", category: "Tareas" },

  // ── Entregables y revisiones ──
  { key: "review_pending", label: "Versión nueva por revisar", description: "Cuando suben una versión y quedas como responsable de pre-aprobarla.", category: "Entregables y revisiones" },
  { key: "review_reviewer", label: "Te asignan como revisor", description: "Cuando te ponen como responsable de la revisión de un entregable.", category: "Entregables y revisiones" },
  { key: "review_changes", label: "Cambios solicitados en un entregable", description: "Cuando se piden cambios internos y hay que rehacer el material.", category: "Entregables y revisiones" },
  { key: "review_checklist", label: "Punto del checklist resuelto", description: "Cuando alguien marca como hecho un cambio del checklist de revisión.", category: "Entregables y revisiones" },
  { key: "review_client", label: "El cliente revisó", description: "Cuando el cliente aprueba o pide cambios desde el portal de revisión.", category: "Entregables y revisiones" },
  { key: "client_deliverable_ready", label: "Entregable listo (para el cliente)", description: "Avisa al cliente cuando el equipo termina un entregable y queda listo para su revisión.", category: "Entregables y revisiones" },

  // ── Chat ──
  { key: "chat_mention", label: "Menciones", description: "Cuando te mencionan (@) en el chat o en una tabla.", category: "Chat" },
  { key: "chat_dm", label: "Mensajes directos", description: "Cuando te escriben un mensaje directo.", category: "Chat" },
  { key: "chat_channel", label: "Mensajes en canales", description: "Cuando llega un mensaje a un canal del que eres miembro.", category: "Chat" },

  // ── Agenda ──
  { key: "calendar_event", label: "Citas de calendario", description: "Invitaciones, cambios y cancelaciones de citas/eventos.", category: "Agenda" },
  { key: "client_project_date", label: "Cambio de fecha del proyecto (para el cliente)", description: "Avisa al cliente cuando cambia la fecha de entrega de su proyecto.", category: "Agenda" },

  // ── Administración ──
  { key: "admin_role", label: "Cambios de rol y permisos", description: "Cuando cambian tu rol o tus permisos.", category: "Administración", essential: true },

  // ── Recordatorios ──
  { key: "reminder_fire", label: "Recordatorio programado", description: "Cuando llega la hora de un recordatorio tuyo (puntual o recurrente).", category: "Recordatorios" },
  { key: "reminder_assigned", label: "Te dejan un recordatorio", description: "Cuando otra persona te crea o programa un recordatorio.", category: "Recordatorios" },

  // ── Marcebot ──
  { key: "marcebot", label: "Mensajes de Marcebot", description: "Resúmenes y avisos del copiloto Marcebot.", category: "Marcebot" },
];

export const NOTIFICATION_EVENT_KEYS = new Set(NOTIFICATION_EVENTS.map((e) => e.key));

export function notificationEventsByCategory(): { category: NotificationCategory; events: NotificationEventDef[] }[] {
  return NOTIFICATION_CATEGORIES.map((category) => ({
    category,
    events: NOTIFICATION_EVENTS.filter((e) => e.category === category),
  })).filter((g) => g.events.length > 0);
}
