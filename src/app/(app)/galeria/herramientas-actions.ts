"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/auth";
import { canWriteProject } from "@/lib/project-access";
import { galeriaWriteSession } from "@/lib/galeria-access";
import {
  createGaleriaFolder,
  writeGaleria,
  statGaleria,
  normalizeGaleriaRel,
  sanitizeGaleriaName,
  trashGaleria,
  moveGaleria,
  renameGaleria,
} from "@/lib/nas-galeria";
import { conflictoDeVinculo } from "@/lib/galeria-vinculos";
import { logActivity } from "@/lib/activity";

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

// ── Gestión del material: borrar, mover, renombrar ────────────────────────────
// Faltaba entera. Se podía crear carpeta y subir, pero no deshacer nada de eso desde la
// app: para quitar un archivo mal subido o colocarlo en su sitio había que entrar al NAS
// por SMB. Las tres pasan por las guardas de nas-galeria (centinela de escritura, nunca
// pisar un nombre existente, y borrar = papelera de red recuperable desde File Station).

// Tope de un lote. No es un límite técnico: es que estas tres operaciones son secuenciales
// sobre NFS y un lote enorme dejaría la petición colgada minutos.
const MAX_LOTE = 200;

type ResultadoLote = { ok: true; hechos: number; fallos: string[] } | { error: string };

function nombreDe(rel: string): string {
  return rel.split("/").pop() || rel;
}

// Un lote no se cae entero porque una pieza falle: se cuenta lo que sí salió y se devuelve
// el detalle de lo que no, para que la UI lo pueda decir pieza por pieza.
async function porLotes(rels: string[], hacer: (rel: string) => Promise<unknown>): Promise<{ hechos: number; fallos: string[] }> {
  const fallos: string[] = [];
  let hechos = 0;
  for (const rel of rels) {
    try {
      await hacer(rel);
      hechos++;
    } catch (e) {
      fallos.push(`${nombreDe(rel)}: ${msg(e, "no se pudo")}`);
    }
  }
  return { hechos, fallos };
}

export async function borrarGaleria(rels: string[]): Promise<ResultadoLote> {
  const session = await galeriaWriteSession();
  if (!session) return { error: "Necesitas el permiso «Escribir en los discos»." };
  if (!Array.isArray(rels) || rels.length === 0) return { error: "No se indicó qué borrar." };
  if (rels.length > MAX_LOTE) return { error: `Demasiados elementos de una vez (máximo ${MAX_LOTE}).` };

  const { hechos, fallos } = await porLotes(rels, (rel) => trashGaleria(rel));
  if (hechos > 0) {
    await logActivity({
      action: "galeria.borrado",
      summary:
        hechos === 1
          ? `envió «${nombreDe(rels[0]!)}» a la papelera del NAS`
          : `envió ${hechos} elementos de la galería a la papelera del NAS`,
      entityType: "galeria",
      entityId: rels[0] ?? "",
      userId: session.id,
    });
    revalidatePath("/galeria");
  }
  return { ok: true, hechos, fallos };
}

export async function moverGaleria(rels: string[], destino: string): Promise<ResultadoLote> {
  const session = await galeriaWriteSession();
  if (!session) return { error: "Necesitas el permiso «Escribir en los discos»." };
  if (!Array.isArray(rels) || rels.length === 0) return { error: "No se indicó qué mover." };
  if (rels.length > MAX_LOTE) return { error: `Demasiados elementos de una vez (máximo ${MAX_LOTE}).` };

  let destinoNorm: string;
  try {
    destinoNorm = normalizeGaleriaRel(destino);
  } catch {
    return { error: "La carpeta de destino no es válida." };
  }
  // La raíz de la galería es el índice de entregas, no un cajón de archivos sueltos.
  if (!destinoNorm) return { error: "Elige una carpeta de destino: en la raíz no se sueltan archivos." };
  const st = await statGaleria(destinoNorm);
  if (!st?.dir) return { error: "La carpeta de destino ya no existe en el disco." };

  const { hechos, fallos } = await porLotes(rels, (rel) => moveGaleria(rel, destinoNorm));
  if (hechos > 0) {
    await logActivity({
      action: "galeria.movido",
      summary:
        hechos === 1
          ? `movió «${nombreDe(rels[0]!)}» a «${destinoNorm}» en la galería`
          : `movió ${hechos} elementos de la galería a «${destinoNorm}»`,
      entityType: "galeria",
      entityId: destinoNorm,
      userId: session.id,
    });
    revalidatePath("/galeria");
  }
  return { ok: true, hechos, fallos };
}

export async function renombrarGaleria(rel: string, nombre: string): Promise<Resultado> {
  const session = await galeriaWriteSession();
  if (!session) return { error: "Necesitas el permiso «Escribir en los discos»." };
  if (!nombre.trim()) return { error: "Escribe un nombre." };
  try {
    const antes = nombreDe(normalizeGaleriaRel(rel));
    const nuevoRel = await renameGaleria(rel, nombre);
    await logActivity({
      action: "galeria.renombrado",
      summary: `renombró «${antes}» a «${nombreDe(nuevoRel)}» en la galería`,
      entityType: "galeria",
      entityId: nuevoRel,
      userId: session.id,
    });
    revalidatePath("/galeria");
    return { ok: true, rel: nuevoRel };
  } catch (e) {
    return { error: msg(e, "No se pudo renombrar") };
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
  // La ficha del cliente enseña este vínculo en Ajustes: que no se quede con el chip viejo.
  revalidatePath(`/clientes/${clientId}`);
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
