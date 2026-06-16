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
  // Wiki
  { key: "ver_wiki", label: "Ver Wiki", category: "Wiki" },
  { key: "editar_wiki", label: "Editar Wiki", category: "Wiki" },
  { key: "ver_contrasenas", label: "Ver contraseñas", category: "Wiki" },
  // Biblioteca
  { key: "ver_biblioteca", label: "Ver biblioteca", category: "Biblioteca" },
  { key: "gestionar_biblioteca", label: "Gestionar biblioteca", category: "Biblioteca" },
  // Reportes
  { key: "ver_reportes", label: "Ver reportes", category: "Reportes" },
  // Administración
  { key: "administrar_usuarios", label: "Administrar usuarios", category: "Administración" },
  { key: "administrar_roles", label: "Administrar roles y permisos", category: "Administración" },
  { key: "administrar_integraciones", label: "Administrar integraciones", category: "Administración" },
  { key: "ver_actividad", label: "Ver registro de actividad", category: "Administración" },
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

// Roles creados por el seed: se marcan como del sistema (no eliminables). Idempotente.
export const BUILTIN_ROLE_KEYS = [
  "admin", "gerente", "ventas", "productor", "director",
  "editor", "camarografo", "disenador", "community", "freelancer", "cliente",
];
export async function ensureBuiltinRolesFlag(): Promise<void> {
  await db.role.updateMany({ where: { key: { in: BUILTIN_ROLE_KEYS } }, data: { isSystem: true } });
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
