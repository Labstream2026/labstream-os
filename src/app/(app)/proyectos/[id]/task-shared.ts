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
  // Campos del cronograma (opcionales: las vistas tablero/lista/calendario no los usan).
  startDate?: Date | string | null;
  estimatedMinutes?: number | null;
  loggedMinutes?: number; // suma de TimeEntry.minutes
  assigneeId: string | null;
  assignee: { initials: string | null; avatarColor: string | null } | null;
  checklist: ChecklistItem[];
};
export type TeamMember = { id: string; name: string; initials: string | null; avatarColor: string | null };

// Date → "YYYY-MM-DD" (para <input type=date>), usando UTC para coincidir con el anclaje a mediodía UTC.
export function toDateInputValue(d: Date | string | null): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
