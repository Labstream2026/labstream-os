import Link from "next/link";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import type { TemplateContent } from "@/lib/templates";
import { createTemplate, duplicateTemplate } from "./actions";
import { PromptCreate } from "@/components/prompt-create";
import { WikiTabs } from "@/app/(app)/wiki/wiki-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { IconProyectos } from "@/components/icons";
import { Plus, Pencil, Copy } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const session = await getSession();
  const canManage = hasPermission(session, "crear_proyectos");
  const templates = await db.projectTemplate.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">Wiki del equipo</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Plantillas de proyecto: arranca con etapas, tareas, carpetas y entregables predefinidos.
      </p>
      <WikiTabs />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Plantillas</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Crea proyectos con etapas, tareas, carpetas y entregables predefinidos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage ? (
            <PromptCreate
              action={createTemplate}
              promptText="Nombre de la plantilla:"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <Plus className="size-4" /> Nueva plantilla
            </PromptCreate>
          ) : null}
          <Link
            href="/proyectos/nuevo"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Proyecto en blanco
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => {
          const c = t.content as unknown as TemplateContent;
          return (
            <div key={t.id} className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-2xl">
                  {t.emoji}
                </span>
                {canManage ? (
                  <div className="flex items-center gap-1">
                    <Link href={`/plantillas/${t.id}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Editar">
                      <Pencil className="size-4" />
                    </Link>
                    <form action={duplicateTemplate.bind(null, t.id)}>
                      <button className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Duplicar">
                        <Copy className="size-4" />
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
              <h3 className="mt-3 font-semibold">{t.name}</h3>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{t.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded bg-secondary px-2 py-0.5">{c.stages?.length ?? 0} etapas</span>
                <span className="rounded bg-secondary px-2 py-0.5">{c.tasks?.length ?? 0} tareas</span>
                <span className="rounded bg-secondary px-2 py-0.5">{c.deliverables?.length ?? 0} entregables</span>
                {c.tables?.length ? (
                  <span className="rounded bg-secondary px-2 py-0.5">{c.tables.length} tableros</span>
                ) : null}
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

      {templates.length === 0 ? (
        <EmptyState
          icon={<IconProyectos />}
          title="Aún no hay plantillas"
          description={
            canManage
              ? "Crea la primera con «Nueva plantilla»."
              : "Cuando el equipo cree plantillas, aparecerán aquí."
          }
        />
      ) : null}
    </div>
  );
}
