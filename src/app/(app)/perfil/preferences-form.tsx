"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { saveUserPreference } from "./preference-actions";
import { START_PAGES } from "@/lib/user-preference";

// Preferencias personales del usuario (control del usuario): página de inicio y accesibilidad.
// Guardan en BD y SINCRONIZAN entre dispositivos. El panel lateral y el chat se recuerdan solos.
export function PreferencesForm({ reduceMotion: initRM, startPage: initSP }: { reduceMotion: boolean; startPage: string }) {
  const router = useRouter();
  const [reduceMotion, setReduceMotion] = React.useState(initRM);
  const [startPage, setStartPage] = React.useState(initSP);
  const [, startTransition] = React.useTransition();
  const [saved, setSaved] = React.useState(false);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const onMotion = (v: boolean) => {
    setReduceMotion(v);
    startTransition(async () => {
      await saveUserPreference({ reduceMotion: v });
      router.refresh();
      flashSaved();
    });
  };
  const onStart = (v: string) => {
    setStartPage(v);
    startTransition(async () => {
      await saveUserPreference({ startPage: v });
      router.refresh();
      flashSaved();
    });
  };

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="size-4 text-primary" /> Preferencias</h2>
        {saved ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="size-3.5" /> Guardado</span> : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Se guardan en el servidor y te siguen entre el móvil y el escritorio.</p>

      <div className="mt-4 space-y-4">
        {/* Página de inicio */}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Página de inicio</span>
          <span className="text-xs text-muted-foreground">A dónde te llevamos al entrar.</span>
          <select
            value={startPage}
            onChange={(e) => onStart(e.target.value)}
            className="mt-1 w-full max-w-xs rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {START_PAGES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        {/* Reducir animaciones */}
        <label className="flex items-start justify-between gap-4">
          <span className="flex flex-col">
            <span className="text-sm font-medium">Reducir animaciones</span>
            <span className="text-xs text-muted-foreground">Minimiza transiciones y movimiento (accesibilidad).</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={reduceMotion}
            onClick={() => onMotion(!reduceMotion)}
            className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${reduceMotion ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`inline-block size-5 transform rounded-full bg-white shadow transition-transform ${reduceMotion ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </label>
      </div>

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        El estado del panel lateral y del chat también se recuerda automáticamente entre tus dispositivos.
      </p>
    </section>
  );
}
