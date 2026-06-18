import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { UserAvatar } from "@/components/user-avatar";
import { emailEnabled } from "@/lib/email";
import { caldavEnabled } from "@/lib/caldav";
import { aiEnabled } from "@/lib/ai";
import { onlyofficeEnabled } from "@/lib/onlyoffice";
import { UserControls } from "./user-controls";
import { RolesManager } from "./roles-manager";
import { UserPermissions } from "./user-permissions";
import { IntegrationsPanel } from "./integrations-panel";
import { ensurePermissionsCatalog, ensureBuiltinRolesFlag, ensureRoleDefaults, ensureWriteGateDefaults, ensureAsistenteDefault, PERMISSION_CATALOG, PERMISSION_CATEGORIES } from "@/lib/permissions";
import { LabelsManager } from "./labels-manager";
import { MarcebotSettings } from "./marcebot-settings";
import { getMarcebotConfig } from "@/lib/marcebot/config";
import { ViewTabs } from "@/app/(app)/proyectos/[id]/view-tabs";
import { ProfileForm } from "@/app/(app)/perfil/profile-form";
import { Mail } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const session = await getSession();
  if (!hasPermission(session, "administrar_usuarios")) redirect("/");

  // Sincroniza el catálogo de permisos y marca los roles del sistema (idempotente):
  // así producción recibe los permisos nuevos sin necesidad de reseed.
  await ensurePermissionsCatalog();
  await ensureBuiltinRolesFlag();
  await ensureRoleDefaults();
  await ensureWriteGateDefaults();
  await ensureAsistenteDefault();

  const [roles, users, me] = await Promise.all([
    db.role.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    }),
    db.user.findMany({
      where: { isSystemBot: false }, // oculta a Marcebot (usuario de sistema)
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { role: { select: { key: true, name: true } } },
    }),
    getCurrentUser(),
  ]);

  // Catálogo de permisos (fuente de verdad en código), agrupado por categoría.
  const catalog = PERMISSION_CATALOG.map((p) => ({ key: p.key, label: p.label, category: p.category }));
  const categories = [...PERMISSION_CATEGORIES];

  const marcebotConfig = await getMarcebotConfig();
  const taskLabels = await db.workflowLabel.findMany({ orderBy: { position: "asc" } });
  const statusRows = taskLabels.filter((l) => l.kind === "TASK_STATUS").map((l) => ({ id: l.id, key: l.key, label: l.label, color: l.color, isDefault: l.isDefault, isDone: l.isDone }));
  const priorityRows = taskLabels.filter((l) => l.kind === "TASK_PRIORITY").map((l) => ({ id: l.id, key: l.key, label: l.label, color: l.color, isDefault: l.isDefault, isDone: l.isDone }));

  const roleOptions = roles.map((r) => ({ key: r.key, name: r.name }));

  // ── Sección Usuarios ──
  const usuariosNode = (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Los miembros del equipo entran con Authentik y se crean automáticamente. Aquí ajustas su rol,
        das/quitas acceso a la Wiki, desactivas cuentas (no pueden iniciar sesión) o las eliminas.
      </p>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-4 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar initials={u.initials} color={u.avatarColor} size="md" />
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {u.name}
                  {u.email === session!.email ? <span className="ml-2 text-[11px] font-normal text-muted-foreground">(tú)</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <UserControls
                userId={u.id}
                userName={u.name}
                roleKey={u.role.key}
                active={u.active}
                isGuest={u.isGuest}
                gender={u.gender}
                roles={roleOptions}
                isSelf={u.email === session!.email}
              />
              <UserPermissions userId={u.id} userName={u.name} permissions={catalog} categories={categories} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Sección Estados y prioridades ──
  const labelsNode = (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Personaliza las opciones de estado y prioridad de las tareas (nombre, color de 20 tonos y orden).
        La ⭐ marca el valor por defecto al crear una tarea; «Terminada» saca el estado de «Mis tareas».
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LabelsManager kind="TASK_STATUS" title="Estados" hint="Columnas de avance de una tarea." rows={statusRows} />
        <LabelsManager kind="TASK_PRIORITY" title="Prioridades" hint="Nivel de urgencia (también aplica a proyectos)." rows={priorityRows} />
      </div>
    </div>
  );

  // ── Sección Roles y permisos ──
  const rolesNode = (
    <RolesManager
      permissions={catalog}
      categories={categories}
      roles={roles.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        emoji: r.emoji,
        color: r.color,
        isSystem: r.isSystem,
        userCount: r._count.users,
        assigned: r.permissions.map((rp) => rp.permission.key),
      }))}
    />
  );

  // ── Sección Integraciones ──
  const integracionesNode = (
    <IntegrationsPanel email={emailEnabled} caldav={caldavEnabled} ai={aiEnabled} onlyoffice={onlyofficeEnabled} />
  );

  // ── Sección Marcebot ──
  const marcebotNode = <MarcebotSettings initial={marcebotConfig} />;

  // ── Sección Personalización (perfil propio) ──
  const personalizacionNode = me ? (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
        <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium">Correo de notificaciones</p>
          <p className="text-muted-foreground">
            Tus notificaciones por correo llegan a <span className="font-medium text-foreground">{me.email}</span>.
            Lo gestiona Authentik (SSO); para cambiarlo, contacta con el administrador del sistema.
          </p>
        </div>
      </div>
      <ProfileForm name={me.name} email={me.email} title={me.title} initials={me.initials} color={me.avatarColor} avatarUrl={me.avatarUrl} />
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">No se pudo cargar tu perfil.</p>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Equipo y permisos · {users.length} usuarios, {roles.length} roles.
      </p>

      <ViewTabs
        storageKey="config-view"
        views={[
          { key: "usuarios", label: "Usuarios", icon: "👥", node: usuariosNode },
          { key: "labels", label: "Estados y prioridades", icon: "🏷️", node: labelsNode },
          { key: "roles", label: "Roles y permisos", icon: "🔐", node: rolesNode },
          { key: "marcebot", label: "Marcebot", icon: "🤖", node: marcebotNode },
          { key: "integraciones", label: "Integraciones", icon: "🔌", node: integracionesNode },
          { key: "personalizacion", label: "Mi personalización", icon: "🎨", node: personalizacionNode },
        ]}
      />
    </div>
  );
}
