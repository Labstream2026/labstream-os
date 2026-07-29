import { db } from "@/lib/db";
import {
  normalizeGaleriaRel,
  sanitizeGaleriaName,
  statGaleria,
  ensureGaleriaDir,
  galeriaEnabled,
} from "@/lib/nas-galeria";

// ── ¿La carpeta que se quiere vincular pisa (o cuelga de) la de OTRO cliente/proyecto? ──
// El candado de los entregables autoriza todo lo que cuelgue del vínculo, así que un vínculo
// que envuelve carpetas ajenas abre material ajeno. La anidación LEGÍTIMA (el proyecto dentro
// de la carpeta de SU cliente) se permite. Lo usan las herramientas de la galería, la ficha
// del cliente y el alta de cliente — por eso vive aquí y no en un archivo de acciones.
export function solapaRel(a: string, b: string): boolean {
  return a === b || a.startsWith(b + "/") || b.startsWith(a + "/");
}

export async function conflictoDeVinculo(
  value: string,
  quien: { clientId?: string; projectId?: string; projectClientId?: string | null },
): Promise<string | null> {
  const [clientes, proyectos] = await Promise.all([
    db.client.findMany({ where: { galeriaFolder: { not: null } }, select: { id: true, name: true, galeriaFolder: true } }),
    db.project.findMany({ where: { galeriaFolder: { not: null } }, select: { id: true, name: true, clientId: true, galeriaFolder: true } }),
  ]);
  for (const c of clientes) {
    if (c.id === quien.clientId || c.id === quien.projectClientId) continue;
    if (c.galeriaFolder && solapaRel(value, c.galeriaFolder)) return `Esa carpeta pisa la del cliente «${c.name}» (${c.galeriaFolder}).`;
  }
  for (const p of proyectos) {
    if (p.id === quien.projectId) continue;
    // Un cliente puede envolver las carpetas de SUS proyectos; nadie más.
    if (quien.clientId && p.clientId === quien.clientId) continue;
    if (p.galeriaFolder && solapaRel(value, p.galeriaFolder)) return `Esa carpeta pisa la del proyecto «${p.name}» (${p.galeriaFolder}).`;
  }
  return null;
}

// ── Qué carpeta de la galería le corresponde a un proyecto ──
// Regla: la del proyecto si tiene vínculo propio; si no, la subcarpeta
// <carpetaCliente>/<nombreProyecto> bajo la carpeta del CLIENTE. La subcarpeta se PERSISTE en
// Project.galeriaFolder la primera vez que se usa para escribir: si después renombran el
// proyecto, su carpeta no «se muda» en silencio.

export type CarpetaProyecto = { rel: string; existe: boolean };

// Solo LECTURA: devuelve la carpeta efectiva sin crear nada (para pintar el picker o el chip).
// null = ni el proyecto ni su cliente tienen vínculo.
export async function carpetaGaleriaProyecto(projectId: string): Promise<CarpetaProyecto | null> {
  if (!galeriaEnabled()) return null;
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: { name: true, galeriaFolder: true, client: { select: { galeriaFolder: true } } },
  });
  if (!p) return null;
  if (p.galeriaFolder) {
    const st = await statGaleria(p.galeriaFolder).catch(() => null);
    return { rel: p.galeriaFolder, existe: !!st?.dir };
  }
  if (!p.client?.galeriaFolder) return null;
  try {
    const rel = normalizeGaleriaRel(`${p.client.galeriaFolder}/${sanitizeGaleriaName(p.name)}`);
    const st = await statGaleria(rel).catch(() => null);
    return { rel, existe: !!st?.dir };
  } catch {
    return null;
  }
}

// ESCRITURA: garantiza que la carpeta del proyecto existe (creándola bajo la del cliente si
// hace falta) y la persiste en Project.galeriaFolder. Lanza con mensaje legible si no hay
// vínculo ninguno — el que llama decide cómo contarlo.
export async function ensureCarpetaGaleriaProyecto(projectId: string): Promise<string> {
  const actual = await carpetaGaleriaProyecto(projectId);
  if (!actual) throw new Error("Ni el proyecto ni su cliente tienen carpeta vinculada en la galería.");
  const rel = await ensureGaleriaDir(actual.rel);
  await db.project.updateMany({ where: { id: projectId, galeriaFolder: null }, data: { galeriaFolder: rel } });
  return rel;
}

// ¿Una ruta cae DENTRO de la carpeta del proyecto? La guarda que impide que el navegador
// elija material de otro cliente: toda pieza que se ate a un entregable debe pasar por aquí.
export async function relPerteneceAlProyecto(projectId: string, rel: string): Promise<boolean> {
  const carpeta = await carpetaGaleriaProyecto(projectId);
  if (!carpeta) return false;
  let norm: string;
  try {
    norm = normalizeGaleriaRel(rel);
  } catch {
    return false;
  }
  return norm === carpeta.rel || norm.startsWith(carpeta.rel + "/");
}

// Carpeta del CLIENTE del proyecto (si la tiene): el selector «Desde el disco» enseña TODO
// el material del cliente, no solo la subcarpeta del proyecto — el editor suelta el export
// por SMB donde le quede cómodo dentro del cliente y lo encuentra igual.
export async function carpetaGaleriaClienteDelProyecto(projectId: string): Promise<CarpetaProyecto | null> {
  if (!galeriaEnabled()) return null;
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: { client: { select: { galeriaFolder: true } } },
  });
  if (!p?.client?.galeriaFolder) return null;
  const st = await statGaleria(p.client.galeriaFolder).catch(() => null);
  return { rel: p.client.galeriaFolder, existe: !!st?.dir };
}

// ¿La ruta cae dentro de la carpeta del proyecto O de la de su CLIENTE? La guarda del
// selector ampliado: material del MISMO cliente sí (venga de la subcarpeta que venga);
// material de otro cliente, jamás. Los entregables «desde el disco» pasan por aquí.
export async function relPerteneceAlClienteOProyecto(projectId: string, rel: string): Promise<boolean> {
  let norm: string;
  try {
    norm = normalizeGaleriaRel(rel);
  } catch {
    return false;
  }
  const proyecto = await carpetaGaleriaProyecto(projectId);
  if (proyecto && (norm === proyecto.rel || norm.startsWith(proyecto.rel + "/"))) return true;
  const cliente = await carpetaGaleriaClienteDelProyecto(projectId);
  return !!cliente && (norm === cliente.rel || norm.startsWith(cliente.rel + "/"));
}
