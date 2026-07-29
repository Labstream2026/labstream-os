"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/auth";
import { canWriteProject } from "@/lib/project-access";
import { galeriaWriteSession } from "@/lib/galeria-access";
import { createGaleriaFolder, writeGaleria, statGaleria, normalizeGaleriaRel, sanitizeGaleriaName } from "@/lib/nas-galeria";
import { logActivity } from "@/lib/activity";

// ¿La carpeta que se quiere vincular pisa (o cuelga de) la de OTRO cliente/proyecto? El candado
// de los entregables autoriza todo lo que cuelgue del vínculo, así que un vínculo que envuelve
// carpetas ajenas abre material ajeno — la misma puerta que prohibir la raíz quería cerrar.
// La anidación LEGÍTIMA (el proyecto dentro de la carpeta de SU cliente) se permite.
function solapa(a: string, b: string): boolean {
  return a === b || a.startsWith(b + "/") || b.startsWith(a + "/");
}
async function conflictoDeVinculo(
  value: string,
  quien: { clientId?: string; projectId?: string; projectClientId?: string | null },
): Promise<string | null> {
  const [clientes, proyectos] = await Promise.all([
    db.client.findMany({ where: { galeriaFolder: { not: null } }, select: { id: true, name: true, galeriaFolder: true } }),
    db.project.findMany({ where: { galeriaFolder: { not: null } }, select: { id: true, name: true, clientId: true, galeriaFolder: true } }),
  ]);
  for (const c of clientes) {
    if (c.id === quien.clientId || c.id === quien.projectClientId) continue;
    if (c.galeriaFolder && solapa(value, c.galeriaFolder)) return `Esa carpeta pisa la del cliente «${c.name}» (${c.galeriaFolder}).`;
  }
  for (const p of proyectos) {
    if (p.id === quien.projectId) continue;
    // Un cliente puede envolver las carpetas de SUS proyectos; nadie más.
    if (quien.clientId && p.clientId === quien.clientId) continue;
    if (p.galeriaFolder && solapa(value, p.galeriaFolder)) return `Esa carpeta pisa la del proyecto «${p.name}» (${p.galeriaFolder}).`;
  }
  return null;
}

// ── Herramientas del EQUIPO sobre la galería: crear carpetas, subir material y vincular ──
// Todo detrás de `escribir_discos` (galeriaWriteSession) y de las guardas de nas-galeria
// (centinela, nunca sobreescribir, temporal+rename, papelera de red).

type Resultado = { ok: true; rel?: string } | { error: string };

function msg(e: unknown, porDefecto: string): string {
  return e instanceof Error && e.message ? e.message : porDefecto;
}

// Mismas extensiones vetadas que en las subidas de Archivos: esta carpeta la abre el equipo
// en sus máquinas por SMB — un .exe «entregable» es justo cómo se cuela un bicho.
const BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|scr|pif|cpl|jar|js|vbs|ps1|sh|app|dmg|deb|rpm)$/i;
const MAX_UPLOAD = 100 * 1024 * 1024; // 100 MB por archivo (tope del body de la server action)

export async function crearCarpetaGaleria(rel: string, nombre: string): Promise<Resultado> {
  const session = await galeriaWriteSession();
  if (!session) return { error: "Necesitas el permiso «Escribir en los discos»." };
  try {
    const creada = await createGaleriaFolder(rel, nombre);
    await logActivity({
      action: "galeria.carpeta",
      summary: `creó la carpeta «${creada}» en la galería`,
      entityType: "galeria",
      entityId: creada,
      userId: session.id,
    });
    revalidatePath("/galeria");
    return { ok: true, rel: creada };
  } catch (e) {
    return { error: msg(e, "No se pudo crear la carpeta") };
  }
}

// Sube UN archivo (la UI manda de a uno para no pasar el tope del body con lotes grandes).
export async function subirArchivoGaleria(rel: string, formData: FormData): Promise<Resultado> {
  const session = await galeriaWriteSession();
  if (!session) return { error: "Necesitas el permiso «Escribir en los discos»." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No llegó ningún archivo." };
  if (file.size > MAX_UPLOAD) return { error: `«${file.name}» pasa de 100 MB. Los brutos pesados van por SMB (por ahora).` };
  // El veto se aplica sobre el nombre YA saneado — que es el que acaba en el disco. Sobre el
  // crudo, «virus.exe » (espacio final) pasaba el filtro y el saneador lo dejaba en virus.exe.
  let nombreLimpio: string;
  try {
    nombreLimpio = sanitizeGaleriaName(file.name);
  } catch {
    return { error: "El nombre del archivo no es válido." };
  }
  if (BLOCKED_EXT.test(nombreLimpio)) return { error: `«${nombreLimpio}» es un tipo de archivo que no se sube a la galería.` };
  try {
    const norm = normalizeGaleriaRel(rel);
    if (!norm) return { error: "Elige una carpeta primero: en la raíz de la galería no se sueltan archivos." };
    const st = await statGaleria(norm);
    if (!st?.dir) return { error: "Esa carpeta ya no existe en el disco." };
    const relFinal = await writeGaleria(norm, nombreLimpio, Buffer.from(await file.arrayBuffer()));
    await logActivity({
      action: "galeria.subida",
      summary: `subió «${relFinal.split("/").pop()}» a la galería (${norm})`,
      entityType: "galeria",
      entityId: relFinal,
      userId: session.id,
    });
    revalidatePath("/galeria");
    return { ok: true, rel: relFinal };
  } catch (e) {
    return { error: msg(e, "No se pudo subir el archivo") };
  }
}

// Vincular la carpeta actual a un CLIENTE: todo su material cuelga de aquí y los proyectos
// ganan subcarpeta automática. rel = null desvincula.
export async function vincularCarpetaCliente(clientId: string, rel: string | null): Promise<Resultado> {
  const session = await galeriaWriteSession();
  if (!session) return { error: "Necesitas el permiso «Escribir en los discos»." };
  if (!hasPermission(session, "editar_clientes")) return { error: "Necesitas el permiso de editar clientes." };
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) return { error: "Cliente no encontrado." };
  let value: string | null = null;
  if (rel !== null) {
    try {
      value = normalizeGaleriaRel(rel);
    } catch {
      return { error: "Ruta inválida" };
    }
    // La raíz jamás: vincular la raíz del disco convertiría cualquier enlace posterior en
    // una puerta a TODO el material de TODOS los clientes.
    if (!value) return { error: "La raíz de la galería no se puede vincular." };
    const st = await statGaleria(value);
    if (!st?.dir) return { error: "Esa carpeta ya no existe en el disco." };
    const conflicto = await conflictoDeVinculo(value, { clientId });
    if (conflicto) return { error: conflicto };
  }
  await db.client.update({ where: { id: clientId }, data: { galeriaFolder: value } });
  await logActivity({
    action: "galeria.vinculo_cliente",
    summary: value ? `vinculó a ${client.name} con la carpeta «${value}» de la galería` : `desvinculó la carpeta de la galería de ${client.name}`,
    entityType: "client",
    entityId: clientId,
    userId: session.id,
  });
  revalidatePath("/galeria");
  return { ok: true };
}

// Vincular la carpeta actual a un PROYECTO (vínculo explícito, gana sobre la subcarpeta
// automática del cliente). rel = null desvincula.
export async function vincularCarpetaProyecto(projectId: string, rel: string | null): Promise<Resultado> {
  const session = await galeriaWriteSession();
  if (!session) return { error: "Necesitas el permiso «Escribir en los discos»." };
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      clientId: true,
      archivedAt: true,
      finishedAt: true,
      isPrivate: true,
      leadId: true,
      members: { select: { userId: true, role: true } },
    },
  });
  if (!project) return { error: "Proyecto no encontrado." };
  if (project.archivedAt || project.finishedAt) return { error: "Ese proyecto está dormido (terminado o en papelera)." };
  // Este vínculo ES el candado de «Desde el disco» (relPerteneceAlProyecto): re-apuntarlo sin
  // ser del proyecto autorizaría material ajeno para el cliente de ese proyecto. Misma vara
  // que setProjectOpsFolder: hay que poder escribir EN ese proyecto.
  if (!canWriteProject(project, session)) return { error: "No eres parte de ese proyecto." };
  let value: string | null = null;
  if (rel !== null) {
    try {
      value = normalizeGaleriaRel(rel);
    } catch {
      return { error: "Ruta inválida" };
    }
    if (!value) return { error: "La raíz de la galería no se puede vincular." };
    const st = await statGaleria(value);
    if (!st?.dir) return { error: "Esa carpeta ya no existe en el disco." };
    const conflicto = await conflictoDeVinculo(value, { projectId, projectClientId: project.clientId });
    if (conflicto) return { error: conflicto };
  }
  await db.project.update({ where: { id: projectId }, data: { galeriaFolder: value } });
  await logActivity({
    action: "galeria.vinculo_proyecto",
    summary: value ? `vinculó el proyecto «${project.name}» con la carpeta «${value}» de la galería` : `desvinculó la carpeta de la galería del proyecto «${project.name}»`,
    projectId,
    entityType: "project",
    entityId: projectId,
    userId: session.id,
  });
  revalidatePath("/galeria");
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true };
}
