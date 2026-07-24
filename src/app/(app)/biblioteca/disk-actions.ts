"use server";

import { noAutorizado } from "@/lib/authz-error";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { DISK_KINDS, MATERIAL_ROLES } from "@/lib/material-health";

// Discos y mapa del material: gestionar requiere gestionar_biblioteca (mismo
// permiso que los recursos); ver lo controla la página con ver_biblioteca.

// Paleta de etiquetas para los chips del mapa (se asigna sola al crear).
const DISK_COLORS = ["#2563eb", "#d97706", "#7c3aed", "#16a34a", "#dc2626", "#0891b2", "#db2777", "#65a30d"];

function requireManage(session: Awaited<ReturnType<typeof getSession>>) {
  if (!hasPermission(session, "gestionar_biblioteca")) noAutorizado();
}

// "3,5" o "3.5" TB → GB enteros; vacío/asqueroso → null.
function tbToGB(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim().replace(",", ".");
  if (!s) return null;
  const tb = Number(s);
  if (!Number.isFinite(tb) || tb < 0 || tb > 10000) return null;
  return Math.round(tb * 1000);
}

function diskFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const rawKind = String(formData.get("kind") ?? "HDD");
  const kind = (DISK_KINDS as readonly string[]).includes(rawKind) ? rawKind : "HDD";
  const location = String(formData.get("location") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const offsite = formData.get("offsite") === "on";
  const isNas = formData.get("isNas") === "on";
  return { name, kind, location, notes, offsite, isNas, capacityGB: tbToGB(formData.get("capacityTB")), usedGB: tbToGB(formData.get("usedTB")) };
}

export async function addStorageDisk(formData: FormData) {
  const session = await getSession();
  requireManage(session);
  const f = diskFields(formData);
  if (!f.name) return;
  const count = await db.storageDisk.count();
  await db.storageDisk.create({
    data: {
      ...f,
      color: DISK_COLORS[count % DISK_COLORS.length],
      // Quien registra el disco normalmente lo tiene en la mano: nace verificado.
      lastCheckAt: new Date(),
      createdById: session!.id,
    },
  });
  revalidatePath("/biblioteca");
}

export async function updateStorageDisk(id: string, formData: FormData) {
  const session = await getSession();
  requireManage(session);
  const f = diskFields(formData);
  if (!f.name) return;
  await db.storageDisk.update({ where: { id }, data: f });
  revalidatePath("/biblioteca");
}

// «Verificado hoy»: conecté el disco y abre. Apaga el aviso pendiente del barrido.
export async function markDiskChecked(id: string) {
  const session = await getSession();
  requireManage(session);
  await db.storageDisk.update({ where: { id }, data: { lastCheckAt: new Date(), checkNotifiedAt: null } });
  revalidatePath("/biblioteca");
}

// Retirar/reactivar: un disco retirado conserva su historia en el mapa pero no
// aparece al registrar material nuevo.
export async function toggleDiskStatus(id: string) {
  const session = await getSession();
  requireManage(session);
  const disk = await db.storageDisk.findUnique({ where: { id }, select: { status: true } });
  if (!disk) return;
  await db.storageDisk.update({
    where: { id },
    data: { status: disk.status === "RETIRADO" ? "ACTIVO" : "RETIRADO" },
  });
  revalidatePath("/biblioteca");
}

// Borrar solo discos VACÍOS: si tiene material registrado, el camino es retirarlo
// (borrarlo arrastraría las entradas del mapa y se perdería dónde están las copias).
export async function deleteStorageDisk(id: string) {
  const session = await getSession();
  requireManage(session);
  const inUse = await db.materialLocation.count({ where: { diskId: id } });
  if (inUse > 0) throw new Error(`Este disco tiene ${inUse} ubicaciones en el mapa. Retíralo en vez de borrarlo.`);
  await db.storageDisk.delete({ where: { id } });
  revalidatePath("/biblioteca");
}

// ── Mapa del material ──────────────────────────────────────────────────────

export async function addMaterialLocation(formData: FormData) {
  const session = await getSession();
  requireManage(session);
  const projectId = String(formData.get("projectId") ?? "");
  const diskId = String(formData.get("diskId") ?? "");
  const role = String(formData.get("role") ?? "");
  const path = String(formData.get("path") ?? "").trim() || null;
  if (!projectId || !diskId || !(MATERIAL_ROLES as readonly string[]).includes(role)) return;
  const [project, disk] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true } }),
    db.storageDisk.findUnique({ where: { id: diskId }, select: { id: true } }),
  ]);
  if (!project || !disk) return;
  // Idempotente sobre la clave única (proyecto, disco, rol): repetir actualiza la ruta.
  await db.materialLocation.upsert({
    where: { projectId_diskId_role: { projectId, diskId, role } },
    create: { projectId, diskId, role, path, verifiedAt: new Date(), createdById: session!.id },
    update: { path, verifiedAt: new Date() },
  });
  revalidatePath("/biblioteca");
  revalidatePath(`/proyectos/${projectId}`);
}

export async function removeMaterialLocation(id: string) {
  const session = await getSession();
  requireManage(session);
  const loc = await db.materialLocation.findUnique({ where: { id }, select: { projectId: true } });
  if (!loc) return;
  await db.materialLocation.delete({ where: { id } });
  revalidatePath("/biblioteca");
  revalidatePath(`/proyectos/${loc.projectId}`);
}

// «Sigue ahí»: confirma que el material está donde dice el mapa.
export async function verifyMaterialLocation(id: string) {
  const session = await getSession();
  requireManage(session);
  const loc = await db.materialLocation.findUnique({ where: { id }, select: { projectId: true } });
  if (!loc) return;
  await db.materialLocation.update({ where: { id }, data: { verifiedAt: new Date() } });
  revalidatePath("/biblioteca");
  revalidatePath(`/proyectos/${loc.projectId}`);
}
