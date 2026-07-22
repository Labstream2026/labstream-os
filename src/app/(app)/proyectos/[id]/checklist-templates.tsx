"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ListChecks, Loader2, Save } from "lucide-react";
import { listChecklistTemplates, applyChecklistTemplate, saveChecklistTemplate } from "./actions";

// Menú de PLANTILLAS de checklist (Tareas 2.0, Fase 2), junto al título del checklist:
// aplicar una existente («Rodaje estándar» → 8 pasos al final) o guardar el checklist actual
// con nombre. Carga la lista al abrir el menú (setState asíncrono en .then).
export function ChecklistTemplatesMenu({ taskId, hasItems }: { taskId: string; hasItems: boolean }) {
  const router = useRouter();
  const [templates, setTemplates] = React.useState<{ id: string; name: string; count: number }[] | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const detailsRef = React.useRef<HTMLDetailsElement>(null);

  const load = () => {
    listChecklistTemplates().then(setTemplates).catch(() => setTemplates([]));
  };

  const apply = (templateId: string) => {
    setMsg(null);
    startTransition(async () => {
      const r = await applyChecklistTemplate(taskId, templateId);
      if (r.ok) {
        setMsg(`Añadidos ${r.added} pasos.`);
        detailsRef.current?.removeAttribute("open");
        router.refresh();
      } else setMsg(r.error ?? "No se pudo aplicar.");
    });
  };

  const save = () => {
    const n = name.trim();
    if (!n) return;
    setMsg(null);
    startTransition(async () => {
      const r = await saveChecklistTemplate(taskId, n);
      if (r.ok) {
        setMsg(`Plantilla «${n}» guardada.`);
        setName("");
        setSaving(false);
        load();
      } else setMsg(r.error ?? "No se pudo guardar.");
    });
  };

  return (
    <details ref={detailsRef} className="relative inline-block" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && templates === null) load(); }}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
        <ListChecks className="size-3" /> Plantillas <ChevronDown className="size-3" />
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-60 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
        {templates === null ? (
          <p className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Cargando…</p>
        ) : templates.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Aún no hay plantillas. Arma un checklist y guárdalo aquí.</p>
        ) : (
          templates.map((t) => (
            <button key={t.id} onClick={() => apply(t.id)} disabled={pending} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-60">
              <span className="truncate font-medium">{t.name}</span>
              <span className="ml-2 shrink-0 text-muted-foreground">{t.count} pasos</span>
            </button>
          ))
        )}
        <div className="mt-1 border-t border-border pt-1.5">
          {saving ? (
            <div className="flex items-center gap-1.5 px-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
                placeholder="Nombre… «Rodaje estándar»"
                autoFocus
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
              <button onClick={save} disabled={pending || !name.trim()} className="shrink-0 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60">OK</button>
            </div>
          ) : (
            <button
              onClick={() => setSaving(true)}
              disabled={!hasItems || pending}
              title={hasItems ? "Guarda el checklist actual como plantilla reutilizable" : "El checklist está vacío"}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <Save className="size-3" /> Guardar checklist actual como plantilla…
            </button>
          )}
        </div>
        {msg ? <p className="px-2 pb-0.5 pt-1 text-[11px] font-medium text-muted-foreground">{msg}</p> : null}
      </div>
    </details>
  );
}
