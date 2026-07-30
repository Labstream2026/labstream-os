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
  // Disco RETIRADO: su historia se conserva en el mapa, pero ya no es una copia viva (puede
  // estar desmantelado o vendido). Contarlo como respaldo daba falsa confianza: un proyecto
  // cuya única copia estaba en un disco retirado salía «3-2-1 ✓».
  diskRetired?: boolean;
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
    if (loc.diskRetired) continue; // un disco retirado no es una copia viva
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

// ── Cuánto espacio hay, de verdad ──────────────────────────────────────────────

// Un disco se pone en ámbar a partir de aquí. UNO solo para el resumen y para la barra de
// cada disco: antes el resumen alertaba al 85 % y la barra al 90, así que un NAS al 87 %
// salía en alerta arriba y en azul tranquilo abajo.
export const DISK_FULL_PCT = 85;

export type EspacioDiscos = {
  capacidadGB: number; // solo de los discos MEDIDOS
  usadoGB: number;
  libreGB: number;
  pct: number | null; // null = nada medido todavía
  medidos: number;
  sinMedir: number; // registrados pero sin capacidad y/o sin ocupación anotada
};

// Suma SOLO los discos de los que se sabe capacidad Y ocupación. Antes, un disco con
// capacidad pero sin ocupación anotada (lo normal: casi nadie la escribe) sumaba toda su
// capacidad y CERO de uso, así que el panel inventaba decenas de TB libres que no existían;
// y uno con ocupación pero sin capacidad se descartaba entero, perdiendo su uso. Lo que no
// se puede medir se cuenta aparte y se dice, en vez de fingir que está vacío.
export function resumenEspacio(discos: { capacityGB: number | null; usedGB: number | null }[]): EspacioDiscos {
  let capacidadGB = 0;
  let usadoGB = 0;
  let medidos = 0;
  let sinMedir = 0;
  for (const d of discos) {
    if (d.capacityGB == null || d.capacityGB <= 0 || d.usedGB == null) {
      sinMedir++;
      continue;
    }
    capacidadGB += d.capacityGB;
    usadoGB += Math.min(d.capacityGB, Math.max(0, d.usedGB));
    medidos++;
  }
  return {
    capacidadGB,
    usadoGB,
    libreGB: Math.max(0, capacidadGB - usadoGB),
    pct: capacidadGB > 0 ? Math.round((usadoGB / capacidadGB) * 100) : null,
    medidos,
    sinMedir,
  };
}

// ── Cuándo toca verificar un disco ─────────────────────────────────────────────

// Cada cuánto hay que conectar un disco y comprobar que abre (mismo plazo que el barrido
// que manda los avisos, en lib/disk-checks.ts).
export const DISK_CHECK_DAYS = 180;

// ¿Este disco pide atención? Tiene que decir LO MISMO que el barrido de avisos: la nube no se
// conecta a nada, y un disco recién registrado sin verificar no alarma hasta que lleva tiempo.
// Antes la pantalla marcaba en rojo permanente entradas de nube que el barrido jamás
// notificaba — una alerta que no había forma de apagar.
export function diskNeedsCheck(d: {
  kind: string;
  status: string;
  lastCheckDays: number | null;
  ageDays: number | null; // días desde que se registró
}): boolean {
  if (d.status === "RETIRADO" || d.kind === "NUBE") return false;
  if (d.lastCheckDays == null) return (d.ageDays ?? 0) >= DISK_CHECK_DAYS;
  return d.lastCheckDays >= DISK_CHECK_DAYS;
}

// ── Caducidad del material ─────────────────────────────────────────────────────
// «¿Cuándo puedo borrar esto?». Es OTRO reloj distinto del de verificación («¿sigue ahí?»),
// y por eso se pintan por separado. Viene de la columna «Caducidad» de la vieja tabla de
// Ubicación de la Wiki, que se fusionó aquí: los umbrales son los mismos que tenía su
// semáforo para que nadie note un cambio de criterio.

// A partir de aquí cuenta como «por vencer» (y es lo que suman los chips de aviso).
export const MATERIAL_EXPIRY_SOON_DAYS = 30;

export type ExpiryLevel = "NINGUNA" | "VENCIDO" | "PRONTO" | "MEDIO" | "OK";
export type MaterialExpiry = { level: ExpiryLevel; days: number | null; label: string };

const mesFmt = new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric" });

// Día calendario EN BOGOTÁ, no instante: dos fechas del mismo día distan 0 aunque las separen
// horas. Ojo con `setHours(0,0,0,0)`, que era lo de antes: usa la medianoche del SERVIDOR, y el
// contenedor va en UTC → la frontera del día caía a las 7 de la tarde de Bogotá. Un material que
// vencía hoy decía «venció ayer» desde las 19:00. Se compara el día calendario de allá.
const YMD_BOGOTA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function aMedianoche(d: Date): number {
  // "2026-07-30" → epoch de ese día; solo se usa para RESTAR días entre dos fechas, así que
  // basta con que ambas se midan con la misma vara.
  const [y, m, day] = YMD_BOGOTA.format(d).split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

export function expiryTone(expiresAt: Date | null | undefined, now: Date): MaterialExpiry {
  if (!expiresAt) return { level: "NINGUNA", days: null, label: "Sin caducidad" };
  const days = Math.round((aMedianoche(expiresAt) - aMedianoche(now)) / 86400000);
  if (days < 0) {
    return { level: "VENCIDO", days, label: days === -1 ? "Venció ayer" : `Venció hace ${-days} días` };
  }
  if (days === 0) return { level: "PRONTO", days, label: "Vence hoy" };
  if (days <= MATERIAL_EXPIRY_SOON_DAYS) {
    return { level: "PRONTO", days, label: `Vence en ${days} ${days === 1 ? "día" : "días"}` };
  }
  if (days <= 90) {
    const meses = Math.max(1, Math.round(days / 30));
    return { level: "MEDIO", days, label: `~${meses} ${meses === 1 ? "mes" : "meses"}` };
  }
  return { level: "OK", days, label: mesFmt.format(expiresAt) };
}
