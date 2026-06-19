"use client";

import * as React from "react";
import { Target, PackageCheck } from "lucide-react";
import { updateProjectBrief } from "./actions";

// Propuesta del proyecto para el EQUIPO: qué se va a hacer + entregables/compromisos.
// La ve todo el equipo del proyecto; no muestra valores ni equipos. Editable si tiene
// permiso de escritura (se guarda al perder el foco).
export function BriefPanel({
  projectId, scope, deliverables, canWrite,
}: {
  projectId: string;
  scope: string | null;
  deliverables: string | null;
  canWrite: boolean;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [saved, setSaved] = React.useState(false);
  const save = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    updateProjectBrief(projectId, fd).then(() => { setSaved(true); setTimeout(() => setSaved(false), 1500); });
  };

  const empty = !scope && !deliverables;

  if (!canWrite) {
    return (
      <div className="space-y-4">
        <Section icon={<Target className="size-4" />} title="Qué vamos a hacer" body={scope} />
        <Section icon={<PackageCheck className="size-4" />} title="Entregables y compromisos" body={deliverables} />
        {empty ? <p className="text-sm text-muted-foreground">Aún no se ha definido la propuesta del proyecto.</p> : null}
      </div>
    );
  }

  return (
    <form ref={formRef} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Resumen de la propuesta para que <strong>todo el equipo</strong> sepa el objetivo del proyecto y qué se entregará.
        No incluye valores ni equipos. {saved ? <span className="text-emerald-600 dark:text-emerald-400">· Guardado ✓</span> : null}
      </p>
      <Field icon={<Target className="size-4" />} title="Qué vamos a hacer">
        <textarea
          name="briefScope" defaultValue={scope ?? ""} onBlur={save} rows={5}
          placeholder="Describe el objetivo y el alcance del trabajo: qué se grabará/producirá, fechas, locaciones, enfoque…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
      <Field icon={<PackageCheck className="size-4" />} title="Entregables y compromisos">
        <textarea
          name="briefDeliverables" defaultValue={deliverables ?? ""} onBlur={save} rows={5}
          placeholder="Qué se entregará al cliente: p. ej. 1 video de 60s en 4K, 20 fotos editadas, 3 reels verticales, fechas de entrega…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
    </form>
  );
}

function Field({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>
      {children}
    </div>
  );
}

function Section({ icon, title, body }: { icon: React.ReactNode; title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
