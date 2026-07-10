// Tipos y helpers compartidos por las vistas de tareas (Tablero / Lista / Calendario).
export type ChecklistItem = { id: string; label: string; done: boolean };
export type Task = {
  id: string;
  title: string;
  status: string;
  stage: string | null;
  priority: string;
  shootDate: Date | string | null;
  dueDate: Date | string | null;
  dueTime?: string | null; // "HH:mm" opcional: hora de finalización (la tarea sale a esa hora en el calendario)
  // Campos del cronograma (opcionales: las vistas tablero/lista/calendario no los usan).
  startDate?: Date | string | null;
  estimatedMinutes?: number | null;
  loggedMinutes?: number; // suma de TimeEntry.minutes
  // La barra cuenta desde la creación de la tarea; completedAt marca el cierre real.
  createdAt?: Date | string | null;
  completedAt?: Date | string | null;
  assigneeId: string | null;
  assignee: { initials: string | null; avatarColor: string | null } | null;
  checklist: ChecklistItem[];
  // Descripción/notas fijas de la tarea (brief, instrucciones, enlaces). Compartida con el equipo.
  description?: string | null;
  // Nº de comentarios/notas (para el contador 💬 de la tarjeta).
  commentCount?: number;
  // Etiquetas (chips de color) de la tarea; se muestran en la tarjeta y el detalle.
  tags?: { id: string; label: string; color: string }[];
  // Ítem de ENTREGABLE: elegible al crear un entregable; se completa sola al mandar la versión.
  isDeliverableWork?: boolean;
  // Incumplimiento del flujo de entregables (revisión/corrección vencida). Chip «Incumplida».
  breachedAt?: Date | string | null;
};
export type TeamMember = { id: string; name: string; initials: string | null; avatarColor: string | null };

// Date → "YYYY-MM-DD" (para <input type=date>), usando UTC para coincidir con el anclaje a mediodía UTC.
export function toDateInputValue(d: Date | string | null): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
