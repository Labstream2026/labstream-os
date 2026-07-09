"use client";

import * as React from "react";
import { createProject } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import type { WizardStep } from "@/lib/templates";
import { emojiToText } from "@/components/icons/marks";

type Opt = { id: string; name: string };
type Tpl = { key: string; name: string; emoji: string | null };

export function NewProjectForm({
  clients,
  team,
  templates,
  wizards,
  initialTemplate,
  initialClient = "",
  isCliente = false,
}: {
  clients: Opt[];
  team: Opt[];
  templates: Tpl[];
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

  const wizardJson = JSON.stringify(steps.map((s) => ({ taskTitle: s.taskTitle, assigneeId: answers[s.taskTitle]?.assigneeId || null, dueDate: answers[s.taskTitle]?.dueDate || null })));

  return (
    <form action={createProject} className="mt-8 space-y-5">
      <input type="hidden" name="wizard" value={wizardJson} />

      <Field label="Plantilla">
        <select name="templateKey" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
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

      {!isCliente && steps.length > 0 ? (
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
