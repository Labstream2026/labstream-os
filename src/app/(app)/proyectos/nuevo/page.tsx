import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { createProject } from "../actions";

export const dynamic = "force-dynamic";

export default async function NuevoProyectoPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const session = await getSession();
  if (!hasPermission(session, "crear_proyectos")) redirect("/proyectos");
  const { template = "" } = await searchParams;

  const [clients, team, templates] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.projectTemplate.findMany({ orderBy: { name: "asc" }, select: { key: true, name: true, emoji: true } }),
  ]);

  return (
    <div className="mx-auto max-w-xl px-8 py-10">
      <Link href="/proyectos" className="text-sm text-muted-foreground hover:text-foreground">
        ← Proyectos
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Nuevo proyecto</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Al usar una plantilla se generan automáticamente carpetas, tareas y entregables.
      </p>

      <form action={createProject} className="mt-8 space-y-5">
        <Field label="Plantilla">
          <select
            name="templateKey"
            defaultValue={template}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">En blanco (solo carpetas)</option>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.emoji} {t.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Nombre del proyecto">
          <input
            name="name"
            required
            placeholder="Ej. Reel institucional Q3"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>

        <Field label="Cliente">
          <select
            name="clientId"
            required
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Responsable">
          <select
            name="leadId"
            defaultValue=""
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Sin asignar</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </Field>

        <button className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Crear proyecto
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
