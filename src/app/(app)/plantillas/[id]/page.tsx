import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import type { TemplateContent } from "@/lib/templates";
import { Trash2, X } from "lucide-react";
import {
  updateTemplateMeta,
  addStage,
  removeStage,
  addFolder,
  removeFolder,
  addTask,
  removeTask,
  addDeliverable,
  removeDeliverable,
  deleteTemplate,
  duplicateTemplate,
} from "../actions";

export const dynamic = "force-dynamic";

const PROJECT_TYPES = [
  "REEL", "PODCAST", "DOCUMENTAL", "STREAMING", "CURSO", "PUBLICIDAD",
  "EVENTO", "CORPORATIVO", "INSTITUCIONAL", "FOTOGRAFIA", "CAMPANA_MENSUAL",
];
const PRIORITIES = ["BAJA", "MEDIA", "ALTA", "URGENTE"];
const DELIVERABLE_TYPES = [
  "REEL", "SHORT", "VIDEO_LARGO", "FOTOGRAFIA", "PODCAST", "TEASER", "DOCUMENTO", "OTRO",
];

const PRIORITY_COLOR: Record<string, string> = {
  BAJA: "bg-slate-100 text-slate-700",
  MEDIA: "bg-blue-100 text-blue-700",
  ALTA: "bg-amber-100 text-amber-700",
  URGENTE: "bg-rose-100 text-rose-700",
};

export default async function PlantillaEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!hasPermission(session, "crear_proyectos")) redirect("/plantillas");
  const { id } = await params;

  const tpl = await db.projectTemplate.findUnique({ where: { id } });
  if (!tpl) notFound();
  const c = (tpl.content as unknown as TemplateContent) ?? { stages: [], folders: [], tasks: [], deliverables: [], tables: [] };
  const stages = c.stages ?? [];
  const folders = c.folders ?? [];
  const tasks = c.tasks ?? [];
  const deliverables = c.deliverables ?? [];
  const tables = c.tables ?? [];

  const inputCls = "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex items-center justify-between">
        <Link href="/plantillas" className="text-sm text-muted-foreground hover:text-foreground">← Plantillas</Link>
        <div className="flex items-center gap-2">
          <form action={duplicateTemplate.bind(null, id)}>
            <button className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">Duplicar</button>
          </form>
          <form action={deleteTemplate.bind(null, id)}>
            <button className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10">
              <Trash2 className="size-3.5" /> Eliminar
            </button>
          </form>
        </div>
      </div>

      {/* Metadatos */}
      <form action={updateTemplateMeta.bind(null, id)} className="mt-5 space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <input name="emoji" defaultValue={tpl.emoji ?? ""} maxLength={4} placeholder="🎬" className={`w-14 text-center text-2xl ${inputCls}`} />
          <input name="name" defaultValue={tpl.name} required placeholder="Nombre de la plantilla" className={`flex-1 text-lg font-semibold ${inputCls}`} />
        </div>
        <textarea name="description" defaultValue={tpl.description ?? ""} rows={2} placeholder="Descripción corta" className={`w-full resize-y ${inputCls}`} />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Tipo de proyecto</label>
          <select name="type" defaultValue={tpl.type} className={inputCls}>
            {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ").toLowerCase()}</option>)}
          </select>
          <button className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Guardar</button>
        </div>
      </form>

      {/* Etapas (columnas del tablero) */}
      <Section title="Etapas del tablero" hint="Columnas de producción (Preproducción, Edición…).">
        <div className="flex flex-wrap gap-2">
          {stages.map((s, i) => (
            <span key={`${s}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-sm">
              {s}
              <RemoveBtn action={removeStage.bind(null, id, i)} />
            </span>
          ))}
          {stages.length === 0 ? <span className="text-sm text-muted-foreground">Sin etapas.</span> : null}
        </div>
        <form action={addStage.bind(null, id)} className="mt-3 flex gap-2">
          <input name="name" required placeholder="Nueva etapa" className={`flex-1 ${inputCls}`} />
          <AddBtn />
        </form>
      </Section>

      {/* Carpetas */}
      <Section title="Carpetas del proyecto" hint="Estructura de carpetas que se crea automáticamente.">
        <div className="flex flex-wrap gap-2">
          {folders.map((f, i) => (
            <span key={`${f}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1 text-sm">
              📁 {f}
              <RemoveBtn action={removeFolder.bind(null, id, i)} />
            </span>
          ))}
          {folders.length === 0 ? <span className="text-sm text-muted-foreground">Sin carpetas.</span> : null}
        </div>
        <form action={addFolder.bind(null, id)} className="mt-3 flex gap-2">
          <input name="name" required placeholder="Nueva carpeta" className={`flex-1 ${inputCls}`} />
          <AddBtn />
        </form>
      </Section>

      {/* Tareas */}
      <Section title="Tareas predefinidas" hint="Se crean asignadas al responsable del proyecto.">
        <div className="space-y-1.5">
          {tasks.map((t, i) => (
            <div key={`${t.title}-${i}`} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
              <span className="flex-1">{t.title}</span>
              {t.stage ? <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{t.stage}</span> : null}
              <span className={`rounded px-1.5 py-0.5 text-[11px] ${PRIORITY_COLOR[t.priority ?? "MEDIA"]}`}>{(t.priority ?? "MEDIA").toLowerCase()}</span>
              <RemoveBtn action={removeTask.bind(null, id, i)} />
            </div>
          ))}
          {tasks.length === 0 ? <p className="text-sm text-muted-foreground">Sin tareas.</p> : null}
        </div>
        <form action={addTask.bind(null, id)} className="mt-3 flex flex-wrap gap-2">
          <input name="title" required placeholder="Título de la tarea" className={`min-w-40 flex-1 ${inputCls}`} />
          <select name="priority" defaultValue="MEDIA" className={inputCls}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p.toLowerCase()}</option>)}
          </select>
          <select name="stage" defaultValue="" className={inputCls}>
            <option value="">Sin etapa</option>
            {stages.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <AddBtn />
        </form>
      </Section>

      {/* Entregables */}
      <Section title="Entregables" hint="Piezas finales del proyecto.">
        <div className="space-y-1.5">
          {deliverables.map((d, i) => (
            <div key={`${d.name}-${i}`} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
              <span className="flex-1">{d.name}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{d.type.replace(/_/g, " ").toLowerCase()}</span>
              <RemoveBtn action={removeDeliverable.bind(null, id, i)} />
            </div>
          ))}
          {deliverables.length === 0 ? <p className="text-sm text-muted-foreground">Sin entregables.</p> : null}
        </div>
        <form action={addDeliverable.bind(null, id)} className="mt-3 flex flex-wrap gap-2">
          <input name="name" required placeholder="Nombre del entregable" className={`min-w-40 flex-1 ${inputCls}`} />
          <select name="type" defaultValue="REEL" className={inputCls}>
            {DELIVERABLE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ").toLowerCase()}</option>)}
          </select>
          <AddBtn />
        </form>
      </Section>

      {tables.length > 0 ? (
        <Section title="Tableros incluidos" hint="Tableros tipo Notion que trae la plantilla (se editan al crear el proyecto).">
          <div className="flex flex-wrap gap-2">
            {tables.map((t, i) => (
              <span key={`${t.name}-${i}`} className="rounded-md border border-border bg-secondary px-2.5 py-1 text-sm">📊 {t.name}</span>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint ? <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function AddBtn() {
  return <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Añadir</button>;
}

function RemoveBtn({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action} className="inline">
      <button className="text-muted-foreground hover:text-destructive" title="Quitar"><X className="size-3.5" /></button>
    </form>
  );
}
