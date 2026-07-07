import Link from "next/link";
import { redirect } from "next/navigation";
import { IconComercial } from "@/components/icons";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

// Columnas del embudo, en el orden en que avanza una propuesta (de borrador a cierre).
const COLUMNS = [
  { status: "BORRADOR", label: "Borrador" },
  { status: "ENVIADA", label: "Enviada" },
  { status: "ACEPTADA", label: "Aceptada" },
  { status: "VENCIDA", label: "Vencida" },
] as const;

export default async function ComercialPage() {
  const session = await getSession();
  if (!session || !hasPermission(session, "ver_cotizaciones")) redirect("/");

  // Propuestas acotadas por acceso: las de clientes que el usuario puede ver
  // más las que él mismo creó (borradores sin cliente incluidos).
  const proposals = await db.proposal.findMany({
    where: {
      OR: [
        { client: accessibleClientWhere(session) },
        { createdById: session.id },
      ],
    },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      client: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const byStatus = new Map<string, typeof proposals>();
  for (const col of COLUMNS) byStatus.set(col.status, []);
  for (const p of proposals) byStatus.get(p.status)?.push(p);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        icon={<IconComercial />}
        title="Embudo comercial"
        description="Tus propuestas por etapa, de borrador a cierre."
      />

      {proposals.length === 0 ? (
        <EmptyState
          icon={<IconComercial />}
          title="Aún no hay propuestas"
          description="Crea la primera desde Cotizaciones → Propuestas."
        />
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-4">
            {COLUMNS.map((col) => {
              const items = byStatus.get(col.status) ?? [];
              return (
                <div key={col.status} className="flex min-w-[240px] flex-1 flex-col">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <span className="text-sm font-semibold">{col.label}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {items.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.length === 0 ? (
                      <p className="px-1 text-sm text-muted-foreground">—</p>
                    ) : (
                      items.map((p) => (
                        <Link
                          key={p.id}
                          href={`/cotizaciones/propuestas/${p.id}`}
                          className="block rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:bg-accent/50"
                        >
                          <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
                          <p className="mt-0.5 truncate font-medium">{p.title}</p>
                          {p.client?.name ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.client.name}</p>
                          ) : null}
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
