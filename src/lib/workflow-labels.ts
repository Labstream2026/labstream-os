import { db } from "@/lib/db";
import type { LabelRow } from "@/lib/colors";

// Carga los estados y prioridades de tarea configurables (ordenados por posición).
// Si por alguna razón no hay filas, devuelve listas vacías (la UI cae a la key cruda).
export async function getTaskLabels(): Promise<{ statuses: LabelRow[]; priorities: LabelRow[] }> {
  const rows = await db.workflowLabel.findMany({ orderBy: [{ position: "asc" }] });
  const pick = (kind: "TASK_STATUS" | "TASK_PRIORITY"): LabelRow[] =>
    rows
      .filter((r) => r.kind === kind)
      .map((r) => ({ key: r.key, label: r.label, color: r.color, isDefault: r.isDefault, isDone: r.isDone }));
  return { statuses: pick("TASK_STATUS"), priorities: pick("TASK_PRIORITY") };
}

// Etiqueta visible de una key (para registros de actividad, notificaciones…).
export async function statusLabelOf(key: string): Promise<string> {
  const row = await db.workflowLabel.findUnique({ where: { kind_key: { kind: "TASK_STATUS", key } } });
  return row?.label ?? key;
}
