import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { UserAvatar } from "@/components/user-avatar";
import { UserControls } from "./user-controls";

export default async function ConfiguracionPage() {
  const session = await getSession();
  if (!hasPermission(session, "administrar_usuarios")) redirect("/");

  const [roles, users] = await Promise.all([
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
  ]);

  const roleOptions = roles.map((r) => ({ key: r.key, name: r.name }));

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Equipo y permisos · {users.length} usuarios, {roles.length} roles.
      </p>

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
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.permissions.map((rp) => (
                <span
                  key={rp.permissionId}
                  className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground"
                >
                  {rp.permission.key}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
