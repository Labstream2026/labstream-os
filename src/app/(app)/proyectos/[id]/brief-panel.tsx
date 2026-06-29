"use client";

import * as React from "react";
import { Target, PackageCheck, Pencil, Check } from "lucide-react";
import { updateProjectBrief } from "./actions";

// Propuesta del proyecto para el EQUIPO: qué se va a hacer + entregables/compromisos.
// La ve todo el equipo del proyecto; no muestra valores ni equipos. Por defecto se ve
// RENDERIZADA (no en formulario); quien puede escribir tiene un botón "Editar" que despliega
// los campos. Se guarda al perder el foco y al pulsar "Listo".
export function BriefPanel({
  projectId, scope, deliverables, canWrite,
}: {
  projectId: string;
  scope: string | null;
  deliverables: string | null;
  canWrite: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  // Copias locales para que la vista de lectura refleje los cambios al cerrar el editor,
  // sin esperar un refetch del servidor.
  const [scopeV, setScopeV] = React.useState(scope ?? "");
  const [delivV, setDelivV] = React.useState(deliverables ?? "");

  const save = () => {
    const fd = new FormData();
    fd.set("briefScope", scopeV);
    fd.set("briefDeliverables", delivV);
    updateProjectBrief(projectId, fd).then(() => { setSaved(true); setTimeout(() => setSaved(false), 1500); });
  };

  const empty = !scopeV.trim() && !delivV.trim();

  // ── Vista LECTURA (renderizada) — también cuando se puede editar pero no se está editando ──
  if (!canWrite || !editing) {
    return (
      <div className="space-y-4">
        {empty ? (
          <p className="text-sm text-muted-foreground">Aún no se ha definido la propuesta del proyecto.</p>
        ) : (
          <>
            <Section icon={<Target className="size-4" />} title="Qué vamos a hacer" body={scopeV} />
            <Section icon={<PackageCheck className="size-4" />} title="Entregables y compromisos" body={delivV} />
          </>
        )}
        {canWrite ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <Pencil className="size-3.5" /> {empty ? "Definir propuesta" : "Editar propuesta"}
          </button>
        ) : null}
      </div>
    );
  }

  // ── Vista EDICIÓN (menú desplegado) ──
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Resumen de la propuesta para que <strong>todo el equipo</strong> sepa el objetivo del proyecto y qué se entregará.
        No incluye valores ni equipos. {saved ? <span className="text-emerald-600 dark:text-emerald-400">· Guardado ✓</span> : null}
      </p>
      <Field icon={<Target className="size-4" />} title="Qué vamos a hacer">
        <textarea
          value={scopeV} onChange={(e) => setScopeV(e.target.value)} onBlur={save} rows={5}
          placeholder="Describe el objetivo y el alcance del trabajo: qué se grabará/producirá, fechas, locaciones, enfoque…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
      <Field icon={<PackageCheck className="size-4" />} title="Entregables y compromisos">
        <textarea
          value={delivV} onChange={(e) => setDelivV(e.target.value)} onBlur={save} rows={5}
          placeholder="Qué se entregará al cliente: p. ej. 1 video de 60s en 4K, 20 fotos editadas, 3 reels verticales, fechas de entrega…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => { save(); setEditing(false); }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Check className="size-4" /> Listo
        </button>
      </div>
    </div>
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
