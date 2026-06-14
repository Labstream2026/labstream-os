import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { UserAvatar } from "@/components/user-avatar";
import { emailEnabled } from "@/lib/email";
import { caldavEnabled } from "@/lib/caldav";
import { aiEnabled } from "@/lib/ai";
import { onlyofficeEnabled } from "@/lib/onlyoffice";
import { UserControls } from "./user-controls";
import { RolePermissions } from "./role-permissions";
import { IntegrationsPanel } from "./integrations-panel";
import { LabelsManager } from "./labels-manager";

export default async function ConfiguracionPage() {
  const session = await getSession();
  if (!hasPermission(session, "administrar_usuarios")) redirect("/");

  const [roles, users, allPermissions] = await Promise.all([
    db.role.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    }),
    db.user.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { role: { select: { key: true, name: true } } },
    }),
    db.permission.findMany({ orderBy: { key: "asc" }, select: { key: true, description: true } }),
  ]);

  const taskLabels = await db.workflowLabel.findMany({ orderBy: { position: "asc" } });
  const statusRows = taskLabels.filter((l) => l.kind === "TASK_STATUS").map((l) => ({ id: l.id, key: l.key, label: l.label, color: l.color, isDefault: l.isDefault, isDone: l.isDone }));
  const priorityRows = taskLabels.filter((l) => l.kind === "TASK_PRIORITY").map((l) => ({ id: l.id, key: l.key, label: l.label, color: l.color, isDefault: l.isDefault, isDone: l.isDone }));

  const roleOptions = roles.map((r) => ({ key: r.key, name: r.name }));

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Equipo y permisos · {users.length} usuarios, {roles.length} roles.
      </p>

      {/* ── Integraciones ── */}
      <h2 className="mb-2 mt-8 text-lg font-semibold">Integraciones</h2>
      <IntegrationsPanel
        email={emailEnabled}
        caldav={caldavEnabled}
        ai={aiEnabled}
        onlyoffice={onlyofficeEnabled}
      />

      {/* ── Usuarios ── */}
      <h2 className="mb-1 mt-8 text-lg font-semibold">Usuarios</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Los miembros del equipo entran con Authentik y se crean automáticamente. Aquí ajustas su
        rol y puedes desactivar cuentas (un usuario inactivo no puede iniciar sesión).
      </p>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-4 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar initials={u.initials} color={u.avatarColor} size="md" />
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {u.name}
                  {u.email === session!.email ? (
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">(tú)</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
            </div>
            <UserControls
              userId={u.id}
              roleKey={u.role.key}
              active={u.active}
              roles={roleOptions}
              isSelf={u.email === session!.email}
            />
          </div>
        ))}
      </div>

      {/* ── Estados y prioridades de tarea ── */}
      <h2 className="mb-1 mt-8 text-lg font-semibold">Estados y prioridades de tarea</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Personaliza las opciones de estado y prioridad de las tareas (nombre, color de 20 tonos y
        orden). La ⭐ marca el valor por defecto al crear una tarea; «Terminada» saca el estado de «Mis tareas».
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LabelsManager
          kind="TASK_STATUS"
          title="Estados"
          hint="Columnas de avance de una tarea."
          rows={statusRows}
        />
        <LabelsManager
          kind="TASK_PRIORITY"
          title="Prioridades"
          hint="Nivel de urgencia (también aplica a proyectos)."
          rows={priorityRows}
        />
      </div>

      {/* ── Roles y permisos ── */}
      <h2 className="mb-3 mt-8 text-lg font-semibold">Roles y permisos</h2>
      <div className="space-y-3">
        {roles.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{r.name}</h3>
                <p className="text-xs text-muted-foreground">{r.description}</p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                {r._count.users} usuario{r._count.users === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-3">
              <RolePermissions
                roleId={r.id}
                roleKey={r.key}
                permissions={allPermissions}
                assigned={r.permissions.map((rp) => rp.permission.key)}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Haz clic en un permiso para activarlo o quitarlo del rol. El rol Administrador tiene acceso total.
      </p>
    </div>
  );
}
