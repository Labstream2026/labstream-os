import { db } from "@/lib/db";
import { notifyMany } from "@/lib/notify";

// Recordatorio de VERIFICACIÓN DE DISCOS (Biblioteca): un disco físico que lleva
// CHECK_DAYS sin verificarse (conectarlo y ver que abre) avisa UNA vez a quienes
// gestionan la biblioteca. Mismo patrón que las tareas estancadas: marca
// checkNotifiedAt para no repetir; «Verificado hoy» la limpia y re-arma el aviso.
// La nube (kind NUBE) no se barre: no hay nada que conectar.
const CHECK_DAYS = 180; // ~6 meses
const SWEEP_THROTTLE_MS = 12 * 60 * 60_000; // 12 h: esto se mide en meses
let lastSweepAt = 0;

export async function sweepDiskChecks(opts?: { force?: boolean }): Promise<{ notified: number } | null> {
  if (!opts?.force && Date.now() - lastSweepAt < SWEEP_THROTTLE_MS) return null;
  lastSweepAt = Date.now();
  const cutoff = new Date(Date.now() - CHECK_DAYS * 86_400_000);

  const disks = await db.storageDisk.findMany({
    where: {
      status: "ACTIVO",
      kind: { not: "NUBE" },
      checkNotifiedAt: null,
      // «Nunca verificado» solo alarma si el disco ya lleva tiempo registrado
      // (los recién creados nacen con lastCheckAt = hoy).
      OR: [
        { lastCheckAt: { lte: cutoff } },
        { lastCheckAt: null, createdAt: { lte: cutoff } },
      ],
    },
    take: 10,
    select: {
      id: true,
      name: true,
      lastCheckAt: true,
      locations: { select: { projectId: true } },
    },
  });
  if (disks.length === 0) return { notified: 0 };

  // Destinatarios: quienes GESTIONAN la biblioteca (más el admin, todopoderoso por código).
  const managers = await db.user.findMany({
    where: {
      active: true,
      role: {
        OR: [
          { key: "admin" },
          { permissions: { some: { permission: { key: "gestionar_biblioteca" } } } },
        ],
      },
    },
    select: { id: true },
  });
  if (managers.length === 0) return { notified: 0 };
  const recipientIds = managers.map((m) => m.id);

  let notified = 0;
  for (const d of disks) {
    // Reclamo atómico (varios procesos barren): avisa solo quien ponga la marca primero.
    const claimed = await db.storageDisk.updateMany({
      where: { id: d.id, checkNotifiedAt: null },
      data: { checkNotifiedAt: new Date() },
    });
    if (claimed.count !== 1) continue;
    const months = d.lastCheckAt ? Math.max(1, Math.round((Date.now() - d.lastCheckAt.getTime()) / (30 * 86_400_000))) : null;
    const nProjects = new Set(d.locations.map((l) => l.projectId)).size;
    await notifyMany(recipientIds, {
      type: "system",
      event: "disk_check",
      title: `Toca verificar «${d.name}»`,
      body: `${months ? `Lleva ~${months} meses sin verificarse` : "Nunca se ha verificado"}${nProjects ? ` y guarda material de ${nProjects} proyecto${nProjects === 1 ? "" : "s"}` : ""}. Conéctalo, confirma que abre y marca «Verificado hoy» en Biblioteca → Discos.`,
      link: "/biblioteca?tab=discos",
      groupKey: "disk-check",
    });
    notified++;
  }
  return { notified };
}

