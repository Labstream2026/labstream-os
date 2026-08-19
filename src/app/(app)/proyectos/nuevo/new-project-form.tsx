"use client";

import * as React from "react";
import { createProject } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import type { WizardStep } from "@/lib/templates";
import { emojiToText } from "@/components/icons/marks";
import { previsualizarPlan, type PlanPreview } from "./plan-actions";

type Opt = { id: string; name: string };
type Tpl = { key: string; name: string; emoji: string | null };

export function NewProjectForm({
  clients,
  team,
  templates,
  planInfo = {},
  wizards,
  initialTemplate,
  initialClient = "",
  isCliente = false,
}: {
  clients: Opt[];
  team: Opt[];
  templates: Tpl[];
  // Plantillas que traen PLAN de producción (calendario hacia atrás); el resto usa el
  // asistente viejo. `rodaje` = alguna tarea se ancla a la fecha de rodaje.
  planInfo?: Record<string, { rodaje: boolean }>;
  wizards: Record<string, WizardStep[]>;
  initialTemplate: string;
  initialClient?: string;
  // El cliente (portal) crea/solicita su proyecto: sin asignar responsable ni tareas internas;
  // en su lugar describe un brief para que el equipo lo configure.
  isCliente?: boolean;
}) {
  const [templateKey, setTemplateKey] = React.useState(initialTemplate);
  const steps = wizards[templateKey] ?? [];
  const [answers, setAnswers] = React.useState<Record<string, { assigneeId?: string; dueDate?: string }>>({});

  const setAns = (title: string, patch: { assigneeId?: string; dueDate?: string }) =>
    setAnswers((prev) => ({ ...prev, [title]: { ...prev[title], ...patch } }));

  // ── El plan de producción (plantillas con calendario) ──
  const planificable = !isCliente && !!planInfo[templateKey];
  const [entrega, setEntrega] = React.useState("");
  const [rodaje, setRodaje] = React.useState("");
  const [plan, setPlan] = React.useState<PlanPreview | null>(null);
  const [calculando, arrancaCalculo] = React.useTransition();
  // Ajustes de quien crea sobre el plan propuesto: fecha o responsable por tarea.
  const [ajustes, setAjustes] = React.useState<Record<string, { fin?: string; assigneeId?: string }>>({});

  const calcular = React.useCallback((tpl: string, ent: string, rod: string) => {
    if (!ent) return;
    arrancaCalculo(async () => {
      const r = await previsualizarPlan(tpl, ent, rod || null);
      setPlan(r);
      setAjustes({});
    });
  }, []);

  // Al cambiar de plantilla el plan viejo no aplica: fuera, y a recalcular si ya hay fechas.
  const cambiarPlantilla = (key: string) => {
    setTemplateKey(key);
    setPlan(null);
    setAjustes({});
    if (planInfo[key] && entrega) calcular(key, entrega, rodaje);
  };

  // El wizard viaja por el MISMO canal de siempre (taskTitle → assigneeId/dueDate): el plan
  // solo cambia de dónde salen las respuestas — del cronograma propuesto más tus ajustes.
  const wizardJson = planificable
    ? JSON.stringify(
        (plan?.filas ?? [])
          .map((f) => ({
            taskTitle: f.title,
            assigneeId: ajustes[f.title]?.assigneeId ?? f.sugeridoId ?? null,
            dueDate: ajustes[f.title]?.fin ?? f.fin ?? null,
          }))
          .filter((a) => a.assigneeId || a.dueDate),
      )
    : JSON.stringify(steps.map((s) => ({ taskTitle: s.taskTitle, assigneeId: answers[s.taskTitle]?.assigneeId || null, dueDate: answers[s.taskTitle]?.dueDate || null })));

  return (
    <form action={createProject} className="mt-8 space-y-5">
      <input type="hidden" name="wizard" value={wizardJson} />

      <Field label="Plantilla">
        <select name="templateKey" value={templateKey} onChange={(e) => cambiarPlantilla(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
          <option value="">En blanco (solo carpetas)</option>
          {templates.map((t) => (<option key={t.key} value={t.key}>{emojiToText(t.emoji)} {t.name}</option>))}
        </select>
      </Field>

      <Field label="Nombre del proyecto">
        <input name="name" required placeholder="Ej. Reel institucional Q3" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </Field>

      <Field label="Cliente">
        <select name="clientId" required defaultValue={initialClient} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
          {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </Field>

      {isCliente ? (
        <>
          <Field label="¿Qué necesitas? (brief)">
            <textarea name="brief" rows={4} placeholder="Cuéntale al equipo el objetivo, referencias, fechas tentativas…" className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </Field>
          {/* Para el cliente, `team` trae SOLO la gente que ya conoce (responsables de su cuenta y
              equipos de sus proyectos). La dirección y los responsables entran automáticamente. */}
          {team.length > 0 ? (
            <div>
              <p className="mb-1.5 block text-sm font-medium">
                ¿Con quién quieres trabajar? <span className="font-normal text-muted-foreground">(opcional)</span>
              </p>
              <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-card p-1.5">
                {team.map((u) => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
                    <input type="checkbox" name="members" value={u.id} className="size-3.5 shrink-0 rounded border-input accent-primary" />
                    <span className="min-w-0 truncate">{u.name}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Los responsables de tu cuenta y la dirección de Labstream entran al proyecto automáticamente.
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <Field label="Responsable del proyecto">
          <select name="leadId" defaultValue="" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">Sin asignar</option>
            {team.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
          </select>
        </Field>
      )}

      {planificable ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <input type="hidden" name="planEntrega" value={entrega} />
          <input type="hidden" name="planRodaje" value={rodaje} />
          <p className="text-sm font-semibold">Plan de producción</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Con la{planInfo[templateKey]?.rodaje ? "s fechas reales" : " fecha de entrega"}, el cronograma sale solo: hacia atrás, en días hábiles y saltando festivos. Nada nace vencido.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            {planInfo[templateKey]?.rodaje ? (
              <label className="flex flex-col gap-1 text-xs font-medium">
                🎬 Fecha de rodaje
                <input type="date" value={rodaje} onChange={(e) => { setRodaje(e.target.value); calcular(templateKey, entrega, e.target.value); }} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-xs font-medium">
              📦 Fecha de entrega
              <input type="date" required value={entrega} onChange={(e) => { setEntrega(e.target.value); calcular(templateKey, e.target.value, rodaje); }} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
            </label>
            {calculando ? <span className="pb-2 text-xs text-muted-foreground">Calculando el plan…</span> : null}
          </div>

          {plan?.error ? <p className="mt-2 text-xs font-medium text-destructive">{plan.error}</p> : null}
          {plan?.ok && plan.avisos.length ? (
            <div className="mt-3 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-500/40 dark:bg-amber-500/10">
              {plan.avisos.map((a, i) => (
                <p key={i} className="text-xs text-amber-800 dark:text-amber-300">⚠ {a}</p>
              ))}
            </div>
          ) : null}

          {plan?.ok ? (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">Así queda el cronograma — puedes mover cualquier fecha o responsable aquí mismo:</p>
              {plan.filas.map((f) => {
                const fin = ajustes[f.title]?.fin ?? f.fin ?? "";
                const quien = ajustes[f.title]?.assigneeId ?? f.sugeridoId ?? "";
                return (
                  <div key={f.title} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{f.title}</span>
                    <select
                      value={quien}
                      onChange={(e) => setAjustes((p) => ({ ...p, [f.title]: { ...p[f.title], assigneeId: e.target.value } }))}
                      className="rounded-md border border-input bg-background px-1.5 py-1 text-xs"
                      title={f.role ? `Rol sugerido: ${f.role}` : undefined}
                    >
                      <option value="">Sin asignar</option>
                      {team.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}{u.id === f.sugeridoId ? " · libre" : ""}</option>
                      ))}
                    </select>
                    {f.fin ? (
                      <input
                        type="date"
                        value={fin}
                        onChange={(e) => setAjustes((p) => ({ ...p, [f.title]: { ...p[f.title], fin: e.target.value } }))}
                        className="rounded-md border border-input bg-background px-1.5 py-1 text-xs tabular-nums"
                      />
                    ) : (
                      <span className="text-[11px] text-muted-foreground">sin fecha propia</span>
                    )}
                    {f.choque ? <p className="w-full text-[11px] font-medium text-red-600 dark:text-red-400">⚠ {f.choque}</p> : null}
                  </div>
                );
              })}
              {plan.entregables.length ? (
                <p className="pt-1 text-[11px] text-muted-foreground">
                  Entregables con fecha: {plan.entregables.map((e) => `${e.name} (${e.fecha.slice(8, 10)}/${e.fecha.slice(5, 7)})`).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : !plan && entrega === "" ? (
            <p className="mt-2 text-xs text-muted-foreground">Elige la{planInfo[templateKey]?.rodaje ? "s fechas" : " fecha"} y te enseño el plan completo antes de crear nada.</p>
          ) : null}
        </div>
      ) : null}

      {!isCliente && !planificable && steps.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Configurar la plantilla</p>
          <p className="mb-3 text-xs text-muted-foreground">Asigna responsables y fechas a las tareas clave. Recibirán aviso por correo y en la app.</p>
          <div className="space-y-3">
            {steps.map((s) => (
              <div key={s.taskTitle} className="rounded-lg border border-border/60 p-3">
                <p className="mb-1.5 text-sm font-medium">{s.taskTitle}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {s.askAssignee ? (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      Responsable
                      <select value={answers[s.taskTitle]?.assigneeId ?? ""} onChange={(e) => setAns(s.taskTitle, { assigneeId: e.target.value })} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                        <option value="">Sin asignar</option>
                        {team.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
                      </select>
                    </label>
                  ) : null}
                  {s.askDate ? (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {s.dateLabel ?? "Fecha"}
                      <input type="date" value={answers[s.taskTitle]?.dueDate ?? ""} onChange={(e) => setAns(s.taskTitle, { dueDate: e.target.value })} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                    </label>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <SubmitButton pendingText="Creando…" className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Crear proyecto
      </SubmitButton>
    </form>
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
