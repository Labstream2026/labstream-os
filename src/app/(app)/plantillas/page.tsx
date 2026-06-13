import Link from "next/link";
import { db } from "@/lib/db";
import type { TemplateContent } from "@/lib/templates";

export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const templates = await db.projectTemplate.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Plantillas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea proyectos con etapas, tareas, carpetas y entregables predefinidos.
          </p>
        </div>
        <Link
          href="/proyectos/nuevo"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Proyecto en blanco
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => {
          const c = t.content as unknown as TemplateContent;
          return (
            <div key={t.id} className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
              <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-2xl">
                {t.emoji}
              </span>
              <h3 className="mt-3 font-semibold">{t.name}</h3>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{t.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded bg-secondary px-2 py-0.5">{c.stages.length} etapas</span>
                <span className="rounded bg-secondary px-2 py-0.5">{c.tasks.length} tareas</span>
                <span className="rounded bg-secondary px-2 py-0.5">{c.deliverables.length} entregables</span>
              </div>
              <Link
                href={`/proyectos/nuevo?template=${t.key}`}
                className="mt-4 rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Usar plantilla
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
