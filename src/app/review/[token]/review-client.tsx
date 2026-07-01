"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
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
// A dónde se envía al cliente al cerrar el flujo cuando no hay descarga (sitio público).
const SITE_URL = "https://labstreamsas.com";

type Outcome = "APROBADO" | "CAMBIOS";
type ModalState =
  | { phase: "confirm"; result: Outcome }
  | { phase: "sending"; result: Outcome }
  | { phase: "done"; result: Outcome }
  | { phase: "error"; result: Outcome; message: string };

// Botón de "copiar al portapapeles" con confirmación breve.
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* sin portapapeles */ }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {done ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
      {done ? "Copiado" : label}
    </button>
  );
}

// Panel de contenido de publicación: portada + texto/caption + hashtags, con copiar. Lo llena el
// equipo (Fase B); si no hay nada, no se muestra.
function ContentPanel({ copy, hashtags, coverSrc }: { copy: string | null; hashtags: string | null; coverSrc: string | null }) {
  const hasCopy = !!copy && copy.trim() !== "";
  const hasTags = !!hashtags && hashtags.trim() !== "";
  if (!hasCopy && !hasTags && !coverSrc) return null;
  const tags = hasTags
    ? hashtags!.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`))
    : [];
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Contenido para publicar</h2>
        <p className="text-xs text-muted-foreground">El texto y los hashtags listos para tu publicación.</p>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-[6rem_1fr]">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverSrc} alt="Portada" className="h-40 w-full rounded-lg border border-border object-cover sm:h-32 sm:w-24" />
        ) : null}
        <div className="min-w-0 space-y-4">
          {hasCopy ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Texto / caption</span>
                <CopyButton text={copy!} label="Copiar texto" />
              </div>
              <p className="whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2 text-sm leading-relaxed">{copy}</p>
            </div>
          ) : null}
          {hasTags ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Hashtags</span>
                <CopyButton text={tags.join(" ")} label="Copiar hashtags" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t, i) => (
                  <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t}</span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

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
  sessionName = null,
  copy = null,
  hashtags = null,
  coverSrc = null,
  downloadUrl,
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
  // Nombre de la sesión (usuario invitado de la app): si viene, saltamos la bienvenida y no
  // le pedimos el nombre; los visitantes por enlace público (sin sesión) sí pasan por ella.
  sessionName?: string | null;
  // Contenido de publicación que el cliente ve y copia junto al video (lo edita el equipo).
  copy?: string | null;
  hashtags?: string | null;
  coverSrc?: string | null;
  downloadUrl: string | null;
}) {
  const [name, setName] = React.useState<string | null>(null); // null = aún cargando
  const [entered, setEntered] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [modal, setModal] = React.useState<ModalState | null>(null);
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    // Usuario invitado con sesión: entramos directo con su nombre, sin recibimiento.
    if (sessionName && sessionName.trim()) {
      setName(sessionName.trim());
      setEntered(true);
      return;
    }
    const saved = (localStorage.getItem(NAME_KEY) || "").trim();
    setName(saved);
    if (saved) setEntered(true);
  }, [sessionName]);

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

  // El cliente pulsó «Aprobar» / «Solicitar cambios»: abrimos el modal de confirmación
  // de marca (en vez de los diálogos nativos del escenario).
  function onDecisionIntent(result: Outcome) {
    setModal({ phase: "confirm", result });
  }

  // Confirmó en el modal → ejecuta la decisión y muestra el mensaje de cierre. El correo
  // y la notificación a TODO el equipo los dispara la propia server action.
  function confirmDecision(result: Outcome) {
    setModal({ phase: "sending", result });
    start(async () => {
      try {
        await setReviewDecision(token, result === "APROBADO" ? "APROBADO" : "CORRECCIONES", name || "Cliente");
        setModal({ phase: "done", result });
      } catch (e) {
        setModal({ phase: "error", result, message: e instanceof Error ? e.message : "No pudimos registrar tu decisión. Inténtalo de nuevo." });
      }
    });
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
        {sessionName ? null : (
          <button onClick={changeName} className="text-xs font-medium text-primary hover:underline">Cambiar</button>
        )}
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
        onDecisionIntent={onDecisionIntent}
      />
      <ContentPanel copy={copy} hashtags={hashtags} coverSrc={coverSrc} />
      {modal ? (
        <DecisionModal
          state={modal}
          pending={pending}
          downloadUrl={downloadUrl}
          onConfirm={() => confirmDecision(modal.result)}
          onCancel={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

// ── Modal de marca para la decisión del cliente ──
// Tres copys distintos según el momento: confirmación, agradecimiento (cambios) y
// celebración (aprobado). Al terminar redirige: aprobado → enlace de descarga en Drive;
// cambios → sitio público de Labstream.
function DecisionModal({
  state,
  pending,
  downloadUrl,
  onConfirm,
  onCancel,
}: {
  state: ModalState;
  pending: boolean;
  downloadUrl: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const approved = state.result === "APROBADO";
  // Destino final al cerrar: descarga (si aprobó y hay enlace) o el sitio público.
  const target = approved && downloadUrl ? downloadUrl : SITE_URL;

  // Al mostrar el mensaje de cierre, redirige solo tras unos segundos (deja leer el
  // mensaje y, si aprobó, ver el botón de descarga).
  React.useEffect(() => {
    if (state.phase !== "done") return;
    const t = setTimeout(() => { window.location.href = target; }, approved ? 6000 : 4500);
    return () => clearTimeout(t);
  }, [state.phase, target, approved]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-7 text-center shadow-2xl sm:p-9">
        <div className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative">
          <Logo className="mx-auto h-9" />

          {state.phase === "confirm" || state.phase === "sending" ? (
            approved ? (
              <>
                <div className="mt-5 text-4xl">🎬</div>
                <h2 className="mt-3 text-xl font-bold tracking-tight">¿Confirmas la aprobación?</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Al aprobar le confirmas al equipo que el material está listo. Te llevaremos al enlace de descarga.
                </p>
                <div className="mt-6 flex flex-col gap-2">
                  <button onClick={onConfirm} disabled={pending} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60">
                    {pending ? "Aprobando…" : "Sí, aprobar entregable"}
                  </button>
                  <button onClick={onCancel} disabled={pending} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-60">
                    Seguir revisando
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-5 text-4xl">✏️</div>
                <h2 className="mt-3 text-xl font-bold tracking-tight">¿Enviar tus ajustes al equipo?</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Notificaremos a tu equipo con los comentarios que dejaste para que apliquen los cambios.
                </p>
                <div className="mt-6 flex flex-col gap-2">
                  <button onClick={onConfirm} disabled={pending} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 active:scale-[0.99] disabled:opacity-60">
                    {pending ? "Enviando…" : "Enviar mis ajustes"}
                  </button>
                  <button onClick={onCancel} disabled={pending} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-60">
                    Seguir revisando
                  </button>
                </div>
              </>
            )
          ) : null}

          {state.phase === "done" ? (
            approved ? (
              <>
                <div className="mt-5 text-4xl">🎉</div>
                <h2 className="mt-3 text-xl font-bold tracking-tight">¡Excelente!</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Nos alegra muchísimo que tu video haya quedado aprobado. Gracias por confiar en Labstream.
                  {downloadUrl ? " Aquí tienes el enlace para descargarlo." : ""}
                </p>
                {downloadUrl ? (
                  <a href={downloadUrl} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-[0.99]">
                    ⬇️ Descargar de Google Drive
                  </a>
                ) : (
                  <a href={SITE_URL} className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
                    Ir a labstreamsas.com →
                  </a>
                )}
                <p className="mt-3 text-[11px] text-muted-foreground">Te redirigiremos en unos segundos…</p>
              </>
            ) : (
              <>
                <div className="mt-5 text-4xl">🙏</div>
                <h2 className="mt-3 text-xl font-bold tracking-tight">¡Muchas gracias!</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  En Labstream estamos comprometidos con que tu video quede perfecto. Ya notificamos a tu equipo con tus
                  ajustes y nos pondremos a trabajar en ellos.
                </p>
                <a href={SITE_URL} className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
                  Ir a labstreamsas.com →
                </a>
                <p className="mt-3 text-[11px] text-muted-foreground">Te redirigiremos en unos segundos…</p>
              </>
            )
          ) : null}

          {state.phase === "error" ? (
            <>
              <div className="mt-5 text-4xl">⚠️</div>
              <h2 className="mt-3 text-xl font-bold tracking-tight">No pudimos completar la acción</h2>
              <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
              <button onClick={onCancel} className="mt-6 w-full rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-accent">
                Cerrar
              </button>
            </>
          ) : null}
        </div>
      </div>
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
