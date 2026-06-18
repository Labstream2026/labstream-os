"use client";

import * as React from "react";
import { ReviewStage, type StageVersion, type StageComment } from "@/components/review/review-stage";
import { Logo } from "@/components/brand/logo";
import { addReviewComment, setReviewDecision } from "./actions";

// Wrapper del portal PÚBLICO del cliente sobre el escenario de revisión compartido.
// Antes de entrar, un recibimiento de marca pide el nombre UNA sola vez (se recuerda en
// el navegador): así no hace falta iniciar sesión y todo comentario queda atribuido a
// quien lo escribe. Luego comenta por momento (con captura del frame), deja notas y
// decide: «Aprobar entregable» / «Solicitar cambios».
export type ReviewVersion = StageVersion;
export type { StageComment };

const NAME_KEY = "review_name";

export function ReviewClient({
  token,
  versions,
  comments,
  status,
  allowDrawings,
  orientation = "horizontal",
  deliverableName,
  projectName,
  projectEmoji,
  clientName,
}: {
  token: string;
  versions: StageVersion[];
  comments: StageComment[];
  status: string;
  allowDrawings: boolean;
  orientation?: "vertical" | "horizontal";
  deliverableName: string;
  projectName: string;
  projectEmoji: string | null;
  clientName: string | null;
}) {
  const [name, setName] = React.useState<string | null>(null); // null = aún cargando
  const [entered, setEntered] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  React.useEffect(() => {
    const saved = (localStorage.getItem(NAME_KEY) || "").trim();
    setName(saved);
    if (saved) setEntered(true);
  }, []);

  function enter(e: React.FormEvent) {
    e.preventDefault();
    const n = draft.trim();
    if (!n) return;
    localStorage.setItem(NAME_KEY, n);
    setName(n);
    setEntered(true);
  }

  function changeName() {
    setEntered(false);
    setDraft(name ?? "");
  }

  // Mientras leemos el nombre del navegador, no parpadees el recibimiento.
  if (name === null) {
    return <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />;
  }

  // ── Recibimiento de marca: pide el nombre una vez ──
  if (!entered) {
    return <Welcome draft={draft} setDraft={setDraft} onEnter={enter} deliverableName={deliverableName} projectName={projectName} projectEmoji={projectEmoji} clientName={clientName} />;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          Revisando como <span className="font-medium text-foreground">{name}</span>
        </span>
        <button onClick={changeName} className="text-xs font-medium text-primary hover:underline">Cambiar</button>
      </div>
      <ReviewStage
        mode="client"
        versions={versions}
        comments={comments}
        status={status}
        allowDrawings={allowDrawings}
        orientation={orientation}
        defaultName={name || "Cliente"}
        fixedName
        decision={{ approveLabel: "Aprobar entregable", changesLabel: "Solicitar cambios" }}
        onComment={(fd) => addReviewComment(token, fd)}
        onDecision={(result, _note, _name) =>
          setReviewDecision(token, result === "APROBADO" ? "APROBADO" : "CORRECCIONES", name || "Cliente")
        }
      />
    </div>
  );
}

// Pantalla de bienvenida: marca Labstream, datos del material y un único campo de nombre.
function Welcome({
  draft,
  setDraft,
  onEnter,
  deliverableName,
  projectName,
  projectEmoji,
  clientName,
}: {
  draft: string;
  setDraft: (v: string) => void;
  onEnter: (e: React.FormEvent) => void;
  deliverableName: string;
  projectName: string;
  projectEmoji: string | null;
  clientName: string | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-8 shadow-sm sm:p-12">
      {/* Adornos visuales */}
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 size-48 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative mx-auto max-w-md text-center">
        <Logo className="h-11" />
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Revisión</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Tu material está listo para revisar 🎬</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Estás a punto de revisar <span className="font-medium text-foreground">{deliverableName}</span> de{" "}
          <span className="font-medium text-foreground">{projectEmoji ? `${projectEmoji} ` : ""}{projectName}</span>
          {clientName ? <> · {clientName}</> : null}.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2 text-left">
          {[
            { icon: "🎯", t: "Comenta el momento exacto" },
            { icon: "✏️", t: "Dibuja sobre el video" },
            { icon: "✅", t: "Aprueba o pide cambios" },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-border bg-background/60 p-3 text-center">
              <div className="text-xl">{f.icon}</div>
              <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{f.t}</p>
            </div>
          ))}
        </div>

        <form onSubmit={onEnter} className="mt-7 space-y-2.5 text-left">
          <label className="block text-sm font-medium">¿Cómo te llamas?</label>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Tu nombre y apellido"
            maxLength={80}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground">Lo usamos para saber de quién es cada comentario. No necesitas crear cuenta ni contraseña.</p>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="mt-1 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:bg-primary/90 active:scale-[0.99] disabled:opacity-50"
          >
            Entrar a la revisión →
          </button>
        </form>
      </div>
    </div>
  );
}
