"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

// ── Usuario DEMO (solo lectura) ──
// Un usuario de prueba que VE toda la app (proyectos, clientes, calendario, archivos, finanzas,
// wiki, reportes, actividad) pero NO puede modificar nada de lo ya desplegado:
//  · Su rol solo lleva permisos ver_* (ninguno de crear/editar/eliminar/administrar).
//  · Candado server-side: canWriteProject devuelve false para el rol demo (como un GUEST), y el
//    chat le queda cerrado (un canal no separa leer de escribir).
//  · Sin ver_contrasenas (la wiki de contraseñas queda fuera) y sin ver_asistente (Marcebot puede
//    ejecutar escrituras por herramientas).
// Lo único que puede "escribir" es lo suyo propio (su perfil, sus notas personales) — no toca
// datos del equipo.

// OJO: un archivo "use server" solo puede EXPORTAR funciones async; esta constante es interna
// (la página usa el literal). Si cambia, actualizar también configuracion/page.tsx.
const DEMO_EMAIL = "demo@labstream.co";

const DEMO_PERMS = [
  "ver_proyectos",
  "ver_archivos",
  "ver_cotizaciones",
  "ver_finanzas",
  "ver_clientes",
  "ver_calendario",
  "ver_notas",
  "ver_wiki",
  "ver_biblioteca",
  "ver_reportes",
  "ver_cumplimiento",
  "ver_actividad",
];

export type DemoResult = { ok: boolean; error?: string };

// Crea (o repara) el rol `demo` y el usuario demo con la contraseña indicada. Idempotente y
// re-ejecutable: cada corrida REAFIRMA los permisos del rol a solo-ver (si alguien le añadió
// permisos de escritura, los quita) y actualiza la contraseña. Solo administradores.
export async function provisionDemoUser(formData: FormData): Promise<DemoResult> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_usuarios")) return { ok: false, error: "Sin permiso." };
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };

  // Rol demo (no es de sistema: el admin puede borrarlo si deja de usarlo).
  const role = await db.role.upsert({
    where: { key: "demo" },
    create: { key: "demo", name: "Demo (solo lectura)", description: "Usuario de prueba: ve toda la app sin poder modificar nada.", emoji: "🔍", isSystem: false },
    update: { name: "Demo (solo lectura)" },
    select: { id: true },
  });

  // Reafirma los permisos EXACTOS de solo-ver (borra cualquier extra que le hayan añadido).
  const perms = await db.permission.findMany({ where: { key: { in: DEMO_PERMS } }, select: { id: true } });
  await db.rolePermission.deleteMany({ where: { roleId: role.id } });
  await db.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })), skipDuplicates: true });

  // Usuario demo con contraseña (entra por el formulario de /login, sin SSO).
  const passwordHash = await hashPassword(password);
  await db.user.upsert({
    where: { email: DEMO_EMAIL },
    create: { email: DEMO_EMAIL, name: "Usuario Demo", initials: "UD", avatarColor: "slate", roleId: role.id, passwordHash, active: true },
    update: { roleId: role.id, passwordHash, active: true },
  });

  await logActivity({ action: "user.demo_provision", summary: "creó/restableció el usuario demo (solo lectura)" });
  revalidatePath("/configuracion");
  return { ok: true };
}

// Desactiva el usuario demo (no lo borra: conserva su rastro en actividad).
export async function deactivateDemoUser(): Promise<DemoResult> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_usuarios")) return { ok: false, error: "Sin permiso." };
  await db.user.updateMany({ where: { email: DEMO_EMAIL }, data: { active: false } });
  await logActivity({ action: "user.demo_deactivate", summary: "desactivó el usuario demo" });
  revalidatePath("/configuracion");
  return { ok: true };
}
