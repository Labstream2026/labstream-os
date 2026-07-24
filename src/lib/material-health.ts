// Salud de respaldo de un proyecto según la regla 3-2-1: tres copias del material,
// en dos soportes distintos, una fuera del estudio.
//
// Solo cuentan las copias REALES del material original: BRUTO y RESPALDO.
// EDICION y EXPORTES son derivados (se pueden reconstruir); ubicarlos sirve para
// encontrarlos, pero no salvan el material si el disco del bruto muere.
//
// PURO a propósito (sin BD ni alias @/): vitest no resuelve el alias, y así la
// regla se prueba sola. Ver material-health.test.ts.

export type MaterialLocationLite = {
  role: string; // BRUTO | EDICION | EXPORTES | RESPALDO
  diskId: string;
  diskKind: string; // NAS | HDD | SSD | LTO | NUBE
  offsite: boolean;
};

export type HealthLevel = "SIN_REGISTRO" | "SIN_RESPALDO" | "PARCIAL" | "OK";

export type MaterialHealth = {
  level: HealthLevel;
  copies: number; // discos distintos con BRUTO o RESPALDO
  media: number; // soportes distintos entre esas copias (HDD, NAS, NUBE…)
  offsite: number; // cuántas de esas copias están fuera del estudio
  label: string; // texto corto para el chip
};

// Roles que cuentan como copia del material original.
const COPY_ROLES = new Set(["BRUTO", "RESPALDO"]);

export function materialHealth(locations: MaterialLocationLite[]): MaterialHealth {
  const byDisk = new Map<string, MaterialLocationLite>();
  for (const loc of locations) {
    if (!COPY_ROLES.has(loc.role)) continue;
    // Un disco cuenta UNA vez aunque tenga bruto y respaldo (misma caja, mismo riesgo).
    if (!byDisk.has(loc.diskId)) byDisk.set(loc.diskId, loc);
  }
  const copies = byDisk.size;
  const media = new Set([...byDisk.values()].map((l) => l.diskKind)).size;
  // La nube siempre está «fuera del estudio» aunque nadie marque el flag.
  const offsite = [...byDisk.values()].filter((l) => l.offsite || l.diskKind === "NUBE").length;

  if (copies === 0) return { level: "SIN_REGISTRO", copies, media, offsite, label: "Sin registrar" };
  if (copies === 1) return { level: "SIN_RESPALDO", copies, media, offsite, label: "Sin respaldo" };
  if (copies >= 3 && media >= 2 && offsite >= 1) return { level: "OK", copies, media, offsite, label: "3-2-1 ✓" };
  return { level: "PARCIAL", copies, media, offsite, label: `${copies} copias` };
}

// Etiquetas humanas de los roles del mapa (compartidas por todas las vistas).
export const MATERIAL_ROLES = ["BRUTO", "EDICION", "EXPORTES", "RESPALDO"] as const;
export const ROLE_LABEL: Record<string, string> = {
  BRUTO: "Bruto",
  EDICION: "Edición",
  EXPORTES: "Exportes",
  RESPALDO: "Respaldo",
};

export const DISK_KINDS = ["NAS", "HDD", "SSD", "LTO", "NUBE"] as const;
export const DISK_KIND_LABEL: Record<string, string> = {
  NAS: "NAS",
  HDD: "HDD externo",
  SSD: "SSD",
  LTO: "Cinta LTO",
  NUBE: "Nube",
};

// ¿Hace cuánto no se verifica un disco? null = nunca. Devuelve días enteros.
export function daysSince(date: Date | null | undefined, now: Date): number | null {
  if (!date) return null;
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}
