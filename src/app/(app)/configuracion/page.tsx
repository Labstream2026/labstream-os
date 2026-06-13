import { db } from "@/lib/db";

export default async function ConfiguracionPage() {
  const [roles, userCount] = await Promise.all([
    db.role.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    }),
    db.user.count(),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Roles y permisos · {roles.length} roles, {userCount} usuarios.
      </p>

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
