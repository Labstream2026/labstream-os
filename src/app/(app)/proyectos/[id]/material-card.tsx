import Link from "next/link";
import { db } from "@/lib/db";
import { daysSince, materialHealth, MATERIAL_ROLES, ROLE_LABEL } from "@/lib/material-health";
import { addMaterialLocation } from "@/app/(app)/biblioteca/disk-actions";

// «¿Dónde está el material?» — la respuesta del mapa, dentro del proyecto.
// Solo equipo (el cliente no ve discos internos; mismo criterio que las rutas NAS).
// Server component autónomo: trae sus datos, no toca las props de FilesPanel.
export async function MaterialCard({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [locations, disks] = await Promise.all([
    db.materialLocation.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: { disk: { select: { id: true, name: true, color: true, kind: true, offsite: true } } },
    }),
    canManage
      ? db.storageDisk.findMany({ where: { status: "ACTIVO" }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  // Sin nada registrado y sin permiso para registrar: la tarjeta no aporta.
  if (locations.length === 0 && !canManage) return null;

  const now = new Date();
  const health = materialHealth(
    locations.map((l) => ({ role: l.role, diskId: l.diskId, diskKind: l.disk.kind, offsite: l.disk.offsite }))
  );
  const tone =
    health.level === "OK"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : health.level === "PARCIAL"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : health.level === "SIN_RESPALDO"
          ? "bg-red-500/10 text-red-600 dark:text-red-400"
          : "bg-accent text-muted-foreground";

  const inputCls = "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
  const roles = MATERIAL_ROLES.filter((r) => locations.some((l) => l.role === r));

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-base">💾</span>
        <h3 className="text-sm font-semibold">¿Dónde está el material?</h3>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>● {health.label}</span>
        <span className="flex-1" />
        <Link href="/biblioteca?tab=mapa" className="text-xs font-medium text-primary hover:underline">
          Ver el mapa completo →
        </Link>
      </div>

      {locations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nadie ha registrado en qué disco vive el material de este proyecto.
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {roles.map((role) => (
            <div key={role} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {ROLE_LABEL[role]}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {locations
                  .filter((l) => l.role === role)
                  .map((l) => {
                    const days = daysSince(l.verifiedAt, now);
                    const stale = days != null && days > 180;
                    return (
                      <span
                        key={l.id}
                        title={[l.path ? `Ruta: ${l.path}` : null, days == null ? "Sin verificar" : days === 0 ? "Verificado hoy" : `Verificado hace ${days} días`].filter(Boolean).join(" · ")}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium"
                      >
                        <span className="size-2 shrink-0 rounded-sm" style={{ background: l.disk.color ?? "#94a3b8" }} />
                        <span className="truncate">{l.disk.name}</span>
                        {l.path ? <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">{l.path}</span> : null}
                        {stale ? <span title="Hace más de 6 meses nadie confirma esta copia">⚠️</span> : null}
                      </span>
                    );
                  })}
              </span>
            </div>
          ))}
        </div>
      )}

      {canManage ? (
        disks.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            No hay discos registrados todavía —{" "}
            <Link href="/biblioteca?tab=discos" className="font-medium text-primary hover:underline">registra el primero</Link>.
          </p>
        ) : (
          <details className="mt-3 rounded-lg border border-dashed border-border">
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-muted-foreground">
              ＋ Registrar ubicación
            </summary>
            <form action={addMaterialLocation} className="flex flex-wrap items-center gap-2 border-t border-border p-3">
              <input type="hidden" name="projectId" value={projectId} />
              <select name="role" defaultValue="BRUTO" className={`w-32 ${inputCls}`}>
                {MATERIAL_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
              <select name="diskId" required defaultValue="" className={`w-44 ${inputCls}`}>
                <option value="" disabled>Disco…</option>
                {disks.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <input name="path" placeholder="Ruta dentro del disco (opcional)" className={`min-w-48 flex-1 font-mono ${inputCls}`} />
              <button className="rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Registrar
              </button>
            </form>
          </details>
        )
      ) : null}
    </section>
  );
}
