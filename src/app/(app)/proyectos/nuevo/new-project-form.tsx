"use client";

import * as React from "react";
import { createProject } from "../actions";
import type { WizardStep } from "@/lib/templates";

type Opt = { id: string; name: string };
type Tpl = { key: string; name: string; emoji: string | null };

export function NewProjectForm({
  clients,
  team,
  templates,
  wizards,
  initialTemplate,
  initialClient = "",
}: {
  clients: Opt[];
  team: Opt[];
  templates: Tpl[];
  wizards: Record<string, WizardStep[]>;
  initialTemplate: string;
  initialClient?: string;
}) {
  const [templateKey, setTemplateKey] = React.useState(initialTemplate);
  const steps = wizards[templateKey] ?? [];
  const [answers, setAnswers] = React.useState<Record<string, { assigneeId?: string; dueDate?: string }>>({});

  const setAns = (title: string, patch: { assigneeId?: string; dueDate?: string }) =>
    setAnswers((prev) => ({ ...prev, [title]: { ...prev[title], ...patch } }));

  const wizardJson = JSON.stringify(steps.map((s) => ({ taskTitle: s.taskTitle, assigneeId: answers[s.taskTitle]?.assigneeId || null, dueDate: answers[s.taskTitle]?.dueDate || null })));

  return (
    <form action={createProject} className="mt-8 space-y-5">
      <input type="hidden" name="wizard" value={wizardJson} />

      <Field label="Plantilla">
        <select name="templateKey" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
          <option value="">En blanco (solo carpetas)</option>
          {templates.map((t) => (<option key={t.key} value={t.key}>{t.emoji} {t.name}</option>))}
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

      <Field label="Responsable del proyecto">
        <select name="leadId" defaultValue="" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
          <option value="">Sin asignar</option>
          {team.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
        </select>
      </Field>

      {steps.length > 0 ? (
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

      <button className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Crear proyecto
      </button>
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
