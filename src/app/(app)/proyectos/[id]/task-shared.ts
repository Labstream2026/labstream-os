// Tipos y helpers compartidos por las vistas de tareas (Tablero / Lista / Calendario).
import { TASK_STATUS, PRIORITY } from "@/lib/ui";

export type ChecklistItem = { id: string; label: string; done: boolean };
export type Task = {
  id: string;
  title: string;
  status: string;
  stage: string | null;
  priority: string;
  shootDate: Date | string | null;
  assignee: { initials: string | null; avatarColor: string | null } | null;
  checklist: ChecklistItem[];
};
export type TeamMember = { id: string; name: string; initials: string | null; avatarColor: string | null };

export const STATUS_OPTIONS = Object.entries(TASK_STATUS).map(([value, m]) => ({ value, label: m.label }));
export const PRIORITY_OPTIONS = Object.entries(PRIORITY).map(([value, m]) => ({ value, label: m.label }));

// Date → "YYYY-MM-DD" (para <input type=date>), usando UTC para coincidir con el anclaje a mediodía UTC.
export function toDateInputValue(d: Date | string | null): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
