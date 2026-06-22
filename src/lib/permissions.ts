// Catálogo de permisos del sistema, agrupado por categoría. Es la fuente de verdad:
// el panel de Roles lo muestra por categorías y `ensurePermissionsCatalog` lo
// sincroniza con la BD (upsert idempotente, no borra nada).
//
// IMPORTANTE: no renombres claves existentes (las usan los gates y las asignaciones de
// rol del seed). Añade nuevas al final de su categoría.
import { cache } from "react";
import { db } from "./db";

export type PermissionDef = { key: string; label: string; category: string };

export const PERMISSION_CATEGORIES = [
  "Proyectos",
  "Tareas y cronograma",
  "Entregables",
  "Archivos",
  "Cotizaciones",
  "Clientes",
  "Calendario",
  "Chat",
  "Asistente IA",
  "Wiki",
  "Biblioteca",
  "Reportes",
  "Administración",
] as const;

export const PERMISSION_CATALOG: PermissionDef[] = [
  // Proyectos
  { key: "ver_proyectos", label: "Ver proyectos", category: "Proyectos" },
  { key: "crear_proyectos", label: "Crear proyectos", category: "Proyectos" },
  { key: "editar_proyectos", label: "Editar proyectos", category: "Proyectos" },
  { key: "eliminar_proyectos", label: "Eliminar proyectos", category: "Proyectos" },
  { key: "gestionar_miembros_proyecto", label: "Gestionar miembros de proyecto", category: "Proyectos" },
  // Tareas y cronograma
  { key: "crear_tareas", label: "Crear tareas", category: "Tareas y cronograma" },
  { key: "editar_tareas", label: "Editar tareas", category: "Tareas y cronograma" },
  { key: "eliminar_tareas", label: "Eliminar tareas", category: "Tareas y cronograma" },
  { key: "gestionar_cronograma", label: "Gestionar cronograma (fechas)", category: "Tareas y cronograma" },
  { key: "registrar_horas", label: "Registrar horas", category: "Tareas y cronograma" },
  // Entregables
  { key: "aprobar_entregables", label: "Aprobar entregables (interno)", category: "Entregables" },
  { key: "compartir_cliente", label: "Compartir con el cliente", category: "Entregables" },
  // Archivos
  { key: "ver_archivos", label: "Ver archivos", category: "Archivos" },
  { key: "subir_archivos", label: "Subir archivos", category: "Archivos" },
  { key: "eliminar_archivos", label: "Eliminar archivos", category: "Archivos" },
  // Cotizaciones
  { key: "ver_cotizaciones", label: "Ver cotizaciones", category: "Cotizaciones" },
  { key: "crear_cotizaciones", label: "Crear cotizaciones", category: "Cotizaciones" },
  { key: "aprobar_cotizaciones", label: "Aprobar cotizaciones", category: "Cotizaciones" },
  { key: "enviar_cotizaciones", label: "Enviar al cliente", category: "Cotizaciones" },
  // Clientes
  { key: "ver_clientes", label: "Ver clientes", category: "Clientes" },
  { key: "crear_clientes", label: "Crear clientes", category: "Clientes" },
  { key: "editar_clientes", label: "Editar clientes", category: "Clientes" },
  // Calendario
  { key: "ver_calendario", label: "Ver calendario", category: "Calendario" },
  { key: "gestionar_calendario", label: "Gestionar citas", category: "Calendario" },
  // Chat
  { key: "crear_canales", label: "Crear canales", category: "Chat" },
  { key: "moderar_chat", label: "Moderar el chat", category: "Chat" },
  { key: "comentar", label: "Comentar", category: "Chat" },
  // Asistente IA
  { key: "ver_asistente", label: "Ver Asistente IA", category: "Asistente IA" },
  // Wiki
  { key: "ver_wiki", label: "Ver Wiki", category: "Wiki" },
  { key: "editar_wiki", label: "Editar Wiki", category: "Wiki" },
  { key: "ver_contrasenas", label: "Ver contraseñas", category: "Wiki" },
  // Biblioteca
  { key: "ver_biblioteca", label: "Ver biblioteca", category: "Biblioteca" },
  { key: "gestionar_biblioteca", label: "Gestionar biblioteca", category: "Biblioteca" },
  // Reportes
  { key: "ver_reportes", label: "Ver reportes", category: "Reportes" },
  { key: "ver_cumplimiento", label: "Ver cumplimiento del equipo", category: "Reportes" },
  // Administración
  { key: "administrar_usuarios", label: "Administrar usuarios", category: "Administración" },
  { key: "administrar_roles", label: "Administrar roles y permisos", category: "Administración" },
  { key: "administrar_integraciones", label: "Administrar integraciones", category: "Administración" },
  { key: "ver_actividad", label: "Ver registro de actividad", category: "Administración" },
  { key: "ver_papelera", label: "Ver la papelera (proyectos y clientes archivados)", category: "Administración" },
];

export const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);
const LABEL_BY_KEY = new Map(PERMISSION_CATALOG.map((p) => [p.key, p.label]));
export function permissionLabel(key: string): string {
  return LABEL_BY_KEY.get(key) ?? key;
}

// Sincroniza el catálogo con la BD: crea/actualiza cada permiso (idempotente, no borra).
// Se llama al abrir Configuración para que producción reciba los permisos nuevos sin reseed.
export async function ensurePermissionsCatalog(): Promise<void> {
  await Promise.all(
    PERMISSION_CATALOG.map((p) =>
      db.permission.upsert({
        where: { key: p.key },
        create: { key: p.key, description: p.label, category: p.category },
        update: { description: p.label, category: p.category },
      }),
    ),
  );
}

// Permisos "legacy" que ya existían (los 12 del seed original). Todo lo demás del
// catálogo es NUEVO; se usa para detectar si el backfill ya corrió.
const LEGACY_KEYS = new Set([
  "ver_proyectos", "crear_proyectos", "editar_proyectos",
  "ver_cotizaciones", "crear_cotizaciones", "aprobar_cotizaciones",
  "ver_archivos", "subir_archivos", "comentar", "aprobar_entregables",
  "administrar_usuarios", "ver_reportes",
]);

// Conjunto sensato de permisos por rol del sistema, para POBLAR los roles con los
// permisos nuevos sin dejar a nadie sin lo que ya podía hacer. Es ADITIVO y se aplica
// UNA sola vez (ver ensureRoleDefaults). El admin luego ajusta a gusto.
const ROLE_DEFAULTS: Record<string, string[]> = {
  gerente: ALL_PERMISSION_KEYS.filter((k) => !["administrar_usuarios", "administrar_roles", "administrar_integraciones"].includes(k)),
  ventas: ["ver_proyectos", "ver_clientes", "crear_clientes", "editar_clientes", "ver_cotizaciones", "crear_cotizaciones", "enviar_cotizaciones", "ver_calendario", "comentar", "ver_reportes", "ver_biblioteca", "ver_wiki"],
  productor: ["ver_proyectos", "crear_proyectos", "editar_proyectos", "gestionar_miembros_proyecto", "ver_clientes", "crear_clientes", "editar_clientes", "crear_tareas", "editar_tareas", "eliminar_tareas", "gestionar_cronograma", "registrar_horas", "aprobar_entregables", "compartir_cliente", "ver_archivos", "subir_archivos", "eliminar_archivos", "ver_calendario", "gestionar_calendario", "crear_canales", "ver_wiki", "editar_wiki", "ver_biblioteca", "ver_clientes", "comentar", "ver_actividad"],
  director: ["ver_proyectos", "editar_proyectos", "crear_tareas", "editar_tareas", "gestionar_cronograma", "registrar_horas", "aprobar_entregables", "compartir_cliente", "ver_archivos", "subir_archivos", "ver_calendario", "gestionar_calendario", "crear_canales", "ver_wiki", "editar_wiki", "ver_biblioteca", "ver_clientes", "comentar"],
  editor: ["ver_proyectos", "crear_tareas", "editar_tareas", "gestionar_cronograma", "registrar_horas", "ver_archivos", "subir_archivos", "ver_calendario", "crear_canales", "ver_wiki", "editar_wiki", "ver_biblioteca", "comentar"],
  camarografo: ["ver_proyectos", "crear_tareas", "editar_tareas", "gestionar_cronograma", "registrar_horas", "ver_archivos", "subir_archivos", "ver_calendario", "ver_wiki", "ver_biblioteca", "comentar"],
  disenador: ["ver_proyectos", "crear_tareas", "editar_tareas", "gestionar_cronograma", "registrar_horas", "ver_archivos", "subir_archivos", "ver_calendario", "ver_wiki", "ver_biblioteca", "comentar"],
  community: ["ver_proyectos", "crear_tareas", "editar_tareas", "gestionar_cronograma", "registrar_horas", "ver_archivos", "subir_archivos", "ver_calendario", "crear_canales", "ver_wiki", "editar_wiki", "ver_biblioteca", "comentar"],
  freelancer: ["ver_proyectos", "ver_archivos", "comentar", "ver_calendario", "ver_biblioteca"],
  cliente: ["comentar"],
};

// Puebla los roles del sistema con un set sensato de permisos nuevos, UNA sola vez
// (si ningún rol tiene aún ningún permiso nuevo). Aditivo: nunca quita permisos, así
// que no pisa los ajustes manuales del admin en cargas posteriores.
export async function ensureRoleDefaults(): Promise<void> {
  const NEW_KEYS = ALL_PERMISSION_KEYS.filter((k) => !LEGACY_KEYS.has(k));
  const alreadyAssigned = await db.rolePermission.count({ where: { permission: { key: { in: NEW_KEYS } } } });
  if (alreadyAssigned > 0) return; // el backfill ya corrió (o el admin ya asignó permisos nuevos)

  const permIdByKey = new Map((await db.permission.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id]));
  for (const [roleKey, keys] of Object.entries(ROLE_DEFAULTS)) {
    const role = await db.role.findUnique({ where: { key: roleKey }, select: { id: true } });
    if (!role) continue;
    const data = keys
      .map((k) => permIdByKey.get(k))
      .filter((id): id is string => !!id)
      .map((permissionId) => ({ roleId: role.id, permissionId }));
    if (data.length) await db.rolePermission.createMany({ data, skipDuplicates: true });
  }
}

// Concede los permisos de GESTIÓN (escritura) a los roles de producción la PRIMERA vez,
// para que al activar los gates de escritura no se le quite la escritura a quien ya podía
// (admin y gerente ya los tienen por el backfill). Aditivo e idempotente: si algún rol de
// producción ya tiene un permiso de gestión, asume que ya corrió y no re-añade.
const WRITE_GATE_PERMS = ["gestionar_biblioteca", "gestionar_calendario"];
const PRODUCTION_ROLES = ["productor", "director", "editor", "camarografo", "disenador", "community"];
export async function ensureWriteGateDefaults(): Promise<void> {
  const already = await db.rolePermission.count({
    where: { permission: { key: { in: WRITE_GATE_PERMS } }, role: { key: { in: PRODUCTION_ROLES } } },
  });
  if (already > 0) return;
  const permIdByKey = new Map(
    (await db.permission.findMany({ where: { key: { in: WRITE_GATE_PERMS } }, select: { id: true, key: true } })).map((p) => [p.key, p.id]),
  );
  const roles = await db.role.findMany({ where: { key: { in: PRODUCTION_ROLES } }, select: { id: true } });
  const data: { roleId: string; permissionId: string }[] = [];
  for (const r of roles) for (const k of WRITE_GATE_PERMS) {
    const pid = permIdByKey.get(k);
    if (pid) data.push({ roleId: r.id, permissionId: pid });
  }
  if (data.length) await db.rolePermission.createMany({ data, skipDuplicates: true });
}

// Roles creados por el seed: se marcan como del sistema (no eliminables). Idempotente.
export const BUILTIN_ROLE_KEYS = [
  "admin", "gerente", "ventas", "productor", "director",
  "editor", "camarografo", "disenador", "community", "freelancer", "cliente",
];
export async function ensureBuiltinRolesFlag(): Promise<void> {
  await db.role.updateMany({ where: { key: { in: BUILTIN_ROLE_KEYS } }, data: { isSystem: true } });
}

// `ver_asistente` es NUEVO: el Asistente IA antes estaba abierto a cualquier usuario con
// sesión. Para no quitarle el acceso a nadie al activar el gate, se concede UNA vez a los
// roles internos del sistema (no a freelancer/cliente, externos; admin ya tiene todo por
// código). Idempotente: si algún rol ya lo tiene, asume que el backfill ya corrió.
const ASISTENTE_INTERNAL_ROLES = ["gerente", "ventas", "productor", "director", "editor", "camarografo", "disenador", "community"];
export async function ensureAsistenteDefault(): Promise<void> {
  const perm = await db.permission.findUnique({ where: { key: "ver_asistente" }, select: { id: true } });
  if (!perm) return;
  // OJO: `gerente` recibe ver_asistente vía ROLE_DEFAULTS (tiene TODOS los permisos),
  // así que su presencia NO indica que el backfill ya corrió. Comprobamos solo los roles
  // internos NO-gerente; si ninguno lo tiene, es la primera vez → concédelo a todos.
  // (Independiente del orden respecto a ensureRoleDefaults.)
  const guardKeys = ASISTENTE_INTERNAL_ROLES.filter((k) => k !== "gerente");
  const already = await db.rolePermission.count({
    where: { permissionId: perm.id, role: { key: { in: guardKeys } } },
  });
  if (already > 0) return;
  const roles = await db.role.findMany({ where: { key: { in: ASISTENTE_INTERNAL_ROLES } }, select: { id: true } });
  if (roles.length) {
    await db.rolePermission.createMany({
      data: roles.map((r) => ({ roleId: r.id, permissionId: perm.id })),
      skipDuplicates: true,
    });
  }
}

// El reporte de "Cumplimiento del equipo" es sensible (mide a cada persona). Por
// defecto solo lo ve la GERENCIA (y el admin por bypass); el admin lo concede a quien
// quiera persona por persona desde Configuración. Backfill idempotente: concede
// ver_cumplimiento a `gerente` la primera vez si aún no lo tiene.
export async function ensureCumplimientoDefault(): Promise<void> {
  const perm = await db.permission.findUnique({ where: { key: "ver_cumplimiento" }, select: { id: true } });
  if (!perm) return;
  const role = await db.role.findUnique({ where: { key: "gerente" }, select: { id: true } });
  if (!role) return;
  const already = await db.rolePermission.count({ where: { permissionId: perm.id, roleId: role.id } });
  if (already > 0) return;
  await db.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
}

// Estado de autenticación EN VIVO de un usuario (rol + permisos efectivos + activo).
// Cacheado por request (React cache) → una sola consulta aunque getSession se llame
// muchas veces. Hace que cualquier cambio de rol/permisos aplique al instante.
export const getLiveAuthState = cache(async (userId: string): Promise<{ roleKey: string; active: boolean; perms: string[] } | null> => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      active: true,
      role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } },
      permissionOverrides: { select: { permissionKey: true, granted: true } },
    },
  });
  if (!user) return null;
  let perms: string[];
  if (user.role.key === "admin") {
    perms = ALL_PERMISSION_KEYS;
  } else {
    const set = new Set(user.role.permissions.map((rp) => rp.permission.key));
    for (const o of user.permissionOverrides) {
      if (o.granted) set.add(o.permissionKey);
      else set.delete(o.permissionKey);
    }
    perms = [...set];
  }
  return { roleKey: user.role.key, active: user.active, perms };
});

// Permisos efectivos de un usuario (para mostrar en el editor de overrides).
export async function getEffectivePermissions(userId: string): Promise<Set<string>> {
  const state = await getLiveAuthState(userId);
  return new Set(state?.perms ?? []);
}
