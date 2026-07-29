"use server";

import { db } from "@/lib/db";
import type { DeliverableType } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { canAccessProject, canWriteProject } from "@/lib/project-access";
import { listGaleriaNivel, resolveGaleriaFile, normalizeGaleriaRel } from "@/lib/nas-galeria";
import {
  carpetaGaleriaProyecto,
  carpetaGaleriaClienteDelProyecto,
  relPerteneceAlClienteOProyecto,
} from "@/lib/galeria-vinculos";
import { DELIVERABLE_TYPE_OPTIONS } from "@/lib/ui";
import { mimeFor } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import { addDeliverableVersion } from "./actions";

// ── Versión de entregable DESDE EL DISCO (galería de LabTem) ──
// El video ya vive en la carpeta del CLIENTE: no se copia un byte. Se registra un FileAsset
// kind GALERIA que apunta a la ruta y la sala de revisión lo reproduce por /api/files-asset
// (que prefiere la copia ligera H.264 que fabricó LabTem — reproducción instantánea).
//
// El selector enseña TODA la carpeta del cliente (no solo la subcarpeta del proyecto): el
// editor suelta el export por SMB donde le quede cómodo y lo lanza a revisión desde la app.
// La guarda del servidor (relPerteneceAlClienteOProyecto) mantiene la línea roja de siempre:
// material de OTRO cliente, jamás.

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
} as const;

// El selector NAVEGA por carpetas (como un Finder chiquito): cada llamada devuelve UN nivel —
// subcarpetas + piezas — de la carpeta del cliente. `rel` null/"" = la carpeta base.
export type NivelCarpeta = { rel: string; name: string };
export type NivelPieza = { rel: string; name: string; video: boolean; mtimeMs: number };
export type NivelResultado =
  | { ok: true; base: string; rel: string; carpetas: NivelCarpeta[]; piezas: NivelPieza[] }
  | { error: string };

// Un nivel de la carpeta del CLIENTE (o la del proyecto si el cliente no tiene vínculo).
// Solo equipo con acceso al proyecto; cualquier `rel` pedido se valida DENTRO de la base —
// el navegador no puede pasearse por carpetas de otros clientes.
export async function nivelDeCarpetaCliente(projectId: string, rel?: string | null): Promise<NivelResultado> {
  const session = await getSession();
  if (!session || session.role === "cliente") return { error: "Sin permiso" };
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project || !canAccessProject(project, session)) return { error: "Sin permiso" };

  const [cliente, proyecto] = await Promise.all([
    carpetaGaleriaClienteDelProyecto(projectId),
    carpetaGaleriaProyecto(projectId),
  ]);
  if (!cliente && !proyecto) {
    return { error: "Ni el proyecto ni su cliente tienen carpeta vinculada en la galería. Créala desde la ficha del cliente (Ajustes) o en /galeria." };
  }
  // La del cliente manda si está en el disco; si no, la del proyecto; si ninguna existe
  // físicamente, se avisa con la ruta esperada para que se note QUÉ falta.
  const base = cliente?.existe ? cliente : proyecto?.existe ? proyecto : (cliente ?? proyecto)!;
  if (!base.existe) return { error: `La carpeta «${base.rel}» todavía no existe en el disco (o LabTem no responde).` };

  let destino = base.rel;
  if (rel) {
    let norm: string;
    try {
      norm = normalizeGaleriaRel(rel);
    } catch {
      return { error: "Ruta inválida" };
    }
    if (norm !== base.rel && !norm.startsWith(base.rel + "/")) return { error: "Esa carpeta no es de este cliente." };
    destino = norm;
  }

  try {
    const nivel = await listGaleriaNivel(destino);
    return {
      ok: true,
      base: base.rel,
      rel: destino,
      carpetas: nivel.carpetas.map((c) => ({ rel: c.rel, name: c.name })),
      piezas: nivel.archivos.map((a) => ({ rel: a.rel, name: a.name, video: a.kind === "video", mtimeMs: a.mtimeMs })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer la carpeta del cliente." };
  }
}

export type VersionDiscoResultado = { ok: true; version: number } | { error: string };

// Crea la versión apuntando al archivo del disco. La ruta viene del navegador → SIEMPRE se
// re-verifica en el servidor que cuelgue de la carpeta de ESTE proyecto o de su CLIENTE:
// sin esa guarda, un rel manipulado le serviría al cliente A el material del cliente B.
export async function crearVersionDesdeDisco(
  deliverableId: string,
  projectId: string,
  rel: string,
  notes?: string,
): Promise<VersionDiscoResultado> {
  const session = await getSession();
  if (!session || session.role === "cliente") return { error: "Sin permiso" };

  let norm: string;
  try {
    norm = normalizeGaleriaRel(rel);
  } catch {
    return { error: "Ruta inválida" };
  }
  if (!(await relPerteneceAlClienteOProyecto(projectId, norm))) {
    return { error: "Ese archivo no está en la carpeta de este cliente." };
  }
  const info = await resolveGaleriaFile(norm, false);
  if (!info) return { error: "El archivo ya no está en el disco (¿lo movieron por SMB?)." };

  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { projectId: true, name: true } });
  if (!deliverable || deliverable.projectId !== projectId) return { error: "Entregable no encontrado." };

  const asset = await db.fileAsset.create({
    data: {
      projectId,
      name: info.name,
      kind: "GALERIA",
      path: norm,
      mime: mimeFor(info.name, null),
      size: info.size <= 2_000_000_000 ? info.size : null, // Int de 32 bits: un master de +2 GB no cabe; el tamaño real lo dice el disco
      uploadedById: session.id,
    },
  });

  try {
    const fd = new FormData();
    const n = String(notes ?? "").trim();
    if (n) fd.set("notes", n.slice(0, 2000));
    // addDeliverableVersion hace TODAS sus comprobaciones de acceso y efectos (tareas,
    // avisos, SLA). Si no hay permiso, lanza — y el catch limpia el FileAsset.
    await addDeliverableVersion(deliverableId, projectId, fd);

    const v = await db.deliverableVersion.findFirst({
      where: { deliverableId },
      orderBy: { number: "desc" },
      select: { id: true, number: true, fileAssetId: true, uploadedById: true },
    });
    if (!v || v.uploadedById !== session.id || v.fileAssetId) {
      await db.fileAsset.delete({ where: { id: asset.id } }).catch(() => {});
      return { error: "No se pudo atar el archivo del disco a la versión." };
    }
    await db.deliverableVersion.update({ where: { id: v.id }, data: { fileAssetId: asset.id } });
    await logActivity({
      action: "deliverable.version_disco",
      summary: `añadió la v${v.number} de «${deliverable.name}» desde el disco (${norm})`,
      projectId,
      entityType: "deliverable",
      entityId: deliverableId,
      userId: session.id,
    });
    return { ok: true, version: v.number };
  } catch (e) {
    await db.fileAsset.delete({ where: { id: asset.id } }).catch(() => {});
    return { error: e instanceof Error ? e.message : "No se pudo crear la versión." };
  }
}

export type EntregableDiscoResultado = { ok: true; numero: number; version: number } | { error: string };

// ── Entregable NUEVO desde el disco, en UN paso ──
// El flujo del editor: botón en «Subir para revisión» → elegir el video de la carpeta del
// cliente → nombre y tipo → se crea el entregable, su v1 apunta al NAS y entra a
// pre-aprobación interna. Sin Drive, sin subir nada.
export async function crearEntregableDesdeDisco(
  projectId: string,
  rel: string,
  nombre: string,
  tipo: string,
  notas?: string,
): Promise<EntregableDiscoResultado> {
  const session = await getSession();
  if (!session || session.role === "cliente") return { error: "Sin permiso" };
  const name = String(nombre ?? "").trim().slice(0, 200);
  if (!name) return { error: "Ponle nombre al entregable." };

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { ...accessSelect, archivedAt: true, finishedAt: true },
  });
  if (!project || !canWriteProject(project, session)) return { error: "No eres parte de este proyecto." };
  if (project.archivedAt || project.finishedAt) return { error: "Este proyecto está dormido (terminado o en papelera)." };

  // La ruta se valida ANTES de crear nada: si está mala, no queda un entregable vacío.
  let norm: string;
  try {
    norm = normalizeGaleriaRel(rel);
  } catch {
    return { error: "Ruta inválida" };
  }
  if (!(await relPerteneceAlClienteOProyecto(projectId, norm))) {
    return { error: "Ese archivo no está en la carpeta de este cliente." };
  }
  if (!(await resolveGaleriaFile(norm, false))) {
    return { error: "El archivo ya no está en el disco (¿lo movieron por SMB?)." };
  }

  // Solo los tipos del catálogo; cualquier otra cosa cae a REEL (igual que createDeliverable).
  const type = (DELIVERABLE_TYPE_OPTIONS.some(([v]) => v === tipo) ? tipo : "REEL") as DeliverableType;

  // Consecutivo #N por proyecto con el MISMO advisory-lock que createDeliverable: dos
  // creaciones simultáneas (esta y la del formulario clásico) no pueden repetir número.
  const d = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`deliv:${projectId}`}, 0))`;
    const top = await tx.deliverable.aggregate({ where: { projectId }, _max: { number: true } });
    return tx.deliverable.create({
      data: { projectId, name, number: (top._max.number ?? 0) + 1, type, ownerId: session.id },
    });
  });
  await logActivity({
    action: "deliverable.create",
    summary: `creó el entregable «${name}» (#${d.number}) desde el disco`,
    projectId,
    entityType: "deliverable",
    entityId: d.id,
    userId: session.id,
  });

  // La v1 reutiliza TODO el aparato de «desde el disco» (asset GALERIA, pre-aprobación,
  // tareas y avisos). Si falla, el entregable recién creado se retira: nada a medias.
  const r = await crearVersionDesdeDisco(d.id, projectId, norm, notas);
  if ("error" in r) {
    await db.deliverable.delete({ where: { id: d.id } }).catch(() => {});
    return { error: r.error };
  }
  // number es opcional en el esquema (filas históricas); aquí siempre se crea con valor.
  return { ok: true, numero: d.number ?? 0, version: r.version };
}
