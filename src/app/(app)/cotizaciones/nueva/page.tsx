import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { createQuote } from "../actions";

export const dynamic = "force-dynamic";

export default async function NuevaCotizacionPage() {
  const session = await getSession();
  if (!hasPermission(session, "crear_cotizaciones")) redirect("/cotizaciones");

  const clients = await db.client.findMany({
    where: accessibleClientWhere(session),
    orderBy: { name: "asc" },
    select: { id: true, name: true, emoji: true, projects: { select: { id: true, name: true, code: true } } },
  });

  return (
    <div className="mx-auto max-w-lg px-8 py-10">
      <Link href="/cotizaciones" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Cotizaciones
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Nueva cotización</h1>

      <form action={createQuote} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Título</label>
          <input
            name="title"
            required
            placeholder="Ej. Campaña de lanzamiento Q3"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Cliente</label>
          <select
            name="clientId"
            required
            defaultValue=""
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="" disabled>Selecciona un cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Proyecto (opcional)</label>
          <select
            name="projectId"
            defaultValue=""
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Sin proyecto</option>
            {clients.flatMap((c) =>
              c.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
              )),
            )}
          </select>
        </div>

        <button className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Crear cotización
        </button>
      </form>
    </div>
  );
}
