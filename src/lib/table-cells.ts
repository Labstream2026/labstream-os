// Construye el mapa columnId→valor de una fila de tabla, enmascarando las celdas
// de columnas PASSWORD: nunca se envía el valor real al cliente (se revela bajo demanda).
export const PW_MASK = "__pw_set__"; // marcador: "hay una contraseña guardada"

type Col = { id: string; type: string };
type Cell = { columnId: string; value: unknown };

export function cellsToMap(columns: Col[], cells: Cell[]): Record<string, unknown> {
  const pw = new Set(columns.filter((c) => c.type === "PASSWORD").map((c) => c.id));
  return Object.fromEntries(
    cells.map((c) => [c.columnId, pw.has(c.columnId) ? (c.value ? PW_MASK : "") : c.value]),
  );
}
