import { getTaskLabels } from "./workflow-labels";

// ¿La key de estado corresponde a un estado "Terminada" (isDone)?
export async function isDoneStatus(key: string): Promise<boolean> {
  const { statuses } = await getTaskLabels();
  return !!statuses.find((s) => s.key === key)?.isDone;
}

// Calcula el valor de `completedAt` al cambiar una tarea a `newStatus`:
// - estado terminado → conserva la marca previa si ya existía, o pone "ahora".
// - estado abierto   → null (la tarea se reabrió).
// Devuelve el valor a guardar y si esta transición es una *nueva* finalización
// (para registrar la actividad correspondiente).
export async function completionTransition(
  newStatus: string,
  prevCompletedAt: Date | null,
): Promise<{ completedAt: Date | null; justCompleted: boolean }> {
  const done = await isDoneStatus(newStatus);
  if (!done) return { completedAt: null, justCompleted: false };
  if (prevCompletedAt) return { completedAt: prevCompletedAt, justCompleted: false };
  return { completedAt: new Date(), justCompleted: true };
}
