"use client";

import * as React from "react";
import { Copy, Check, CheckCircle2, Loader2 } from "lucide-react";
import { ReviewStage, type StageVersion, type StageComment } from "@/components/review/review-stage";
import { Logo } from "@/components/brand/logo";
import { addReviewComment, setReviewDecision, setCoverDecision, preApproveReview } from "./actions";
import { DownloadCenter, type Rendition } from "./download-center";
import { ReviewOnboarding } from "./review-onboarding";

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

// Panel de contenido de publicación: texto/caption + hashtags, con copiar al portapapeles. Lo
// llena el equipo (Fase B); si no hay nada, no se muestra. La PORTADA vive en su propio panel.
function ContentPanel({ copy, hashtags }: { copy: string | null; hashtags: string | null }) {
  const hasCopy = !!copy && copy.trim() !== "";
  const hasTags = !!hashtags && hashtags.trim() !== "";
  if (!hasCopy && !hasTags) return null;
  const tags = hasTags
    ? [...new Set(hashtags!.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`)))]
    : [];
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Contenido para publicar</h2>
        <p className="text-xs text-muted-foreground">El texto y los hashtags listos para tu publicación.</p>
      </div>
      <div className="space-y-4 p-4">
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
    </section>
  );
}

// Panel de APROBACIÓN de la portada del reel: la imagen + estado + botones Aprobar / Solicitar
// cambios (con nota). Solo aparece para reels con portada. La decisión se guarda por la server
// action y se refleja al momento (estado local optimista).
function CoverApprovalPanel({
  token,
  name,
  coverSrc,
  coverForId,
  initialStatus,
  initialBy,
  initialNote,
}: {
  token: string;
  name: string;
  coverSrc: string;
  // Identidad de la portada que el cliente está VIENDO: la decisión se ata a ella (anti-carrera).
  coverForId: string | null;
  initialStatus: "PENDIENTE" | "APROBADA" | "CAMBIOS";
  initialBy: string | null;
  initialNote: string | null;
}) {
  const [status, setStatus] = React.useState(initialStatus);
  const [by, setBy] = React.useState(initialBy);
  const [note, setNote] = React.useState(initialNote);
  const [asking, setAsking] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function decide(decision: "APROBADA" | "CAMBIOS", changeNote?: string) {
    setError(null);
    start(async () => {
      try {
        await setCoverDecision(token, decision, name, changeNote, coverForId ?? undefined);
        setStatus(decision);
        setBy(name);
        setNote(decision === "CAMBIOS" ? changeNote?.trim() || null : null);
        setAsking(false);
        setDraft("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar tu decisión.");
      }
    });
  }

  const badge =
    status === "APROBADA"
      ? { label: "Aprobada", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" }
      : status === "CAMBIOS"
        ? { label: "Cambios solicitados", cls: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300" }
        : { label: "Pendiente de tu revisión", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">Portada del reel</h2>
          <p className="text-xs text-muted-foreground">La imagen que se ve antes de reproducir. Apruébala o pide cambios.</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-[7rem_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverSrc} alt="Portada del reel" className="mx-auto aspect-[9/16] w-28 rounded-lg border border-border object-cover" />
        <div className="min-w-0">
          {status === "APROBADA" ? (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span>Aprobaste esta portada{by ? `, ${by}` : ""}. El equipo ya puede usarla.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {status === "CAMBIOS" && note ? (
                <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800 dark:bg-orange-500/10 dark:text-orange-300">
                  Pediste: “{note}”. El equipo subirá una portada nueva.
                </p>
              ) : null}
              {asking ? (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    placeholder="¿Qué te gustaría cambiar en la portada?"
                    className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => decide("CAMBIOS", draft)} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                      {pending ? <Loader2 className="size-4 animate-spin" /> : null} Enviar cambios
                    </button>
                    <button type="button" onClick={() => { setAsking(false); setDraft(""); }} disabled={pending} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-60">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => decide("APROBADA")} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Aprobar portada
                  </button>
                  <button type="button" onClick={() => setAsking(true)} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60">
                    Solicitar cambios
                  </button>
                </div>
              )}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          )}
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
  invited = null,
  copy = null,
  hashtags = null,
  coverSrc = null,
  coverStatus = null,
  coverForId = null,
  coverDecisionBy = null,
  coverDecisionNote = null,
  renditions = [],
  downloadUrl,
  immersiveEligible = false,
}: {
  token: string;
  versions: StageVersion[];
  comments: StageComment[];
  status: string;
  allowDrawings: boolean;
  orientation?: "vertical" | "horizontal";
  // Formato «Reel celular»: player de pantalla completa en el celular del cliente.
  immersiveEligible?: boolean;
  deliverableName: string;
  projectName: string;
  projectEmoji: string | null;
  clientName: string | null;
  // Nombre de la sesión (usuario invitado de la app): si viene, saltamos la bienvenida y no
  // le pedimos el nombre; los visitantes por enlace público (sin sesión) sí pasan por ella.
  sessionName?: string | null;
  // Capacidad de USUARIO INVITADO autenticado: si viene, la sala le ofrece los DOS botones
  // (Pre-aprobar → genera enlace para el cliente final, y Aprobar final) y puede reabrir un
  // aprobado. `null` = cliente final por enlace público (solo Aprobar / Solicitar cambios).
  invited?: { reviewLink: string; emailEnabled: boolean } | null;
  // Contenido de publicación que el cliente ve y copia junto al video (lo edita el equipo).
  copy?: string | null;
  hashtags?: string | null;
  // Portada del reel + su estado de aprobación (solo reels con portada).
  coverSrc?: string | null;
  coverStatus?: "PENDIENTE" | "APROBADA" | "CAMBIOS" | null;
  coverForId?: string | null;
  coverDecisionBy?: string | null;
  coverDecisionNote?: string | null;
  // Archivos finales por formato (centro de descargas del cliente).
  renditions?: Rendition[];
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
        // La acción devuelve un resultado TIPADO (no lanza) para que su mensaje en español
        // llegue intacto (en producción Next redacta los Error lanzados desde server actions).
        const r = await setReviewDecision(token, result === "APROBADO" ? "APROBADO" : "CORRECCIONES", name || "Cliente");
        if (r.ok) setModal({ phase: "done", result });
        else setModal({ phase: "error", result, message: r.message });
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

  // ── Pestañas del visor (conmutador bajo el material) ──
  // Reel/Video · Portada (solo reels con portada) · Copy. Los paneles se MUDAN del final de la
  // página a estas pestañas: el cliente se centra en las correcciones y cambia cuando quiere.
  const mediaTabs = [
    ...(coverSrc && coverStatus
      ? [{
          key: "portada",
          label: "Portada",
          content: (
            <CoverApprovalPanel
              token={token}
              name={name || "Cliente"}
              coverSrc={coverSrc}
              coverForId={coverForId}
              initialStatus={coverStatus}
              initialBy={coverDecisionBy}
              initialNote={coverDecisionNote}
            />
          ),
        }]
      : []),
    ...((copy && copy.trim()) || (hashtags && hashtags.trim())
      ? [{ key: "copy", label: "Copy", content: <ContentPanel copy={copy} hashtags={hashtags} /> }]
      : []),
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm backdrop-blur-xl">
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
        immersiveEligible={immersiveEligible}
        defaultName={name || "Cliente"}
        fixedName
        // El usuario INVITADO usa su propia barra de decisión (doble botón + reabrir), así que aquí
        // no pintamos los botones del escenario; el cliente FINAL por enlace sí los usa.
        decision={invited ? null : { approveLabel: "Aprobar entregable", changesLabel: "Solicitar cambios" }}
        mediaTabs={mediaTabs.length ? mediaTabs : undefined}
        onComment={(fd) => addReviewComment(token, fd)}
        onDecisionIntent={onDecisionIntent}
      />
      {invited ? (
        <InvitedActions
          token={token}
          reviewLink={invited.reviewLink}
          emailEnabled={invited.emailEnabled}
          approved={status === "APROBADO" || status === "ENTREGADO"}
          pending={pending}
          onApprove={() => onDecisionIntent("APROBADO")}
          onRequestChanges={() => onDecisionIntent("CAMBIOS")}
        />
      ) : null}
      <DownloadCenter renditions={renditions} />
      <ReviewOnboarding />
      {modal ? (
        <DecisionModal
          state={modal}
          pending={pending}
          downloadUrl={downloadUrl}
          homeHref={sessionName ? "/mis-entregas" : SITE_URL}
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
  homeHref = SITE_URL,
  onConfirm,
  onCancel,
}: {
  state: ModalState;
  pending: boolean;
  downloadUrl: string | null;
  // A dónde volver al cerrar: su sala de entregas (usuario invitado con sesión) o el sitio público.
  homeHref?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const approved = state.result === "APROBADO";
  // Destino final al cerrar: descarga (si aprobó y hay enlace) o "su casa" (sala / sitio público).
  const target = approved && downloadUrl ? downloadUrl : homeHref;

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
                  <a href={homeHref} className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
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
                <a href={homeHref} className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
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

// Barra de decisión del USUARIO INVITADO autenticado. Ofrece TRES caminos en la misma ventana:
//  · Aprobar (final) — reutiliza el modal de marca de la sala (onApprove → decisión APROBADO).
//  · Solicitar / Reabrir cambios — disponible SIEMPRE, incluso tras aprobado (onRequestChanges).
//  · Pre-aprobar y enviar al cliente FINAL — genera el enlace /review/[token] (copiar + correo
//    opcional) vía preApproveReview; el invitado actúa de PUENTE sin cerrar la aprobación.
function InvitedActions({
  token,
  reviewLink,
  emailEnabled,
  approved,
  pending,
  onApprove,
  onRequestChanges,
}: {
  token: string;
  reviewLink: string;
  emailEnabled: boolean;
  approved: boolean;
  pending: boolean;
  onApprove: () => void;
  onRequestChanges: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [to, setTo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [recorded, setRecorded] = React.useState(false);
  const [preBusy, startPre] = React.useTransition();
  const [preMsg, setPreMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const record = (withEmail: boolean) => {
    startPre(async () => {
      const fd = new FormData();
      if (withEmail) {
        fd.set("to", to.trim());
        if (note.trim()) fd.set("note", note.trim());
      }
      const r = await preApproveReview(token, fd);
      if (r.ok) {
        setRecorded(true);
        setPreMsg({ ok: true, text: withEmail ? "Pre-aprobado y enviado al cliente final." : "Pre-aprobado. Comparte el enlace con el cliente final." });
      } else {
        setPreMsg({ ok: false, text: r.error || "No se pudo pre-aprobar. Inténtalo de nuevo." });
      }
    });
  };

  // Copiar el enlace NO registra nada (sin efecto de servidor): la pre-aprobación se registra UNA
  // sola vez con el botón «Pre-aprobar». Así copiar N veces no duplica notas ni avisos.
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(reviewLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* sin portapapeles */ }
  };

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Tu decisión</h2>
        <p className="text-xs text-muted-foreground">
          Apruébalo tú, o pre-apruébalo y envía el enlace al cliente final para que lo apruebe. Puedes pedir cambios en cualquier momento.
        </p>
      </div>
      <div className="space-y-3 p-4">
        {approved ? (
          <p className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            <CheckCircle2 className="size-4" /> Aprobado. Si algo cambió, puedes reabrirlo con cambios.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {!approved ? (
            <button type="button" onClick={onApprove} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              <CheckCircle2 className="size-4" /> Aprobar
            </button>
          ) : null}
          <button type="button" onClick={onRequestChanges} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60 dark:bg-amber-500/10 dark:text-amber-300">
            {approved ? "Reabrir con cambios" : "Solicitar cambios"}
          </button>
          <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
            Pre-aprobar y enviar al cliente final
          </button>
        </div>

        {open ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              Al pre-aprobar generas un enlace para que el <b>cliente final</b> revise y apruebe. Cópialo y compártelo, o envíalo por correo.
            </p>
            <div className="flex items-center gap-2">
              <input readOnly value={reviewLink} className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none" />
              <button type="button" onClick={copyLink} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">
                {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />} {copied ? "Copiado" : "Copiar enlace"}
              </button>
            </div>
            {emailEnabled ? (
              <div className="space-y-2">
                <input type="email" value={to} onChange={(e) => setTo(e.target.value)} disabled={recorded} placeholder="Correo del cliente final (opcional)" className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60" />
                <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={recorded} rows={2} placeholder="Mensaje para el cliente final (opcional)" className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">El correo no está configurado: copia el enlace y compártelo tú.</p>
            )}
            {/* Un ÚNICO botón registra la pre-aprobación (nota interna + aviso al equipo, y el correo
                si escribió un destinatario). Deshabilitado tras registrar → no duplica. */}
            <button
              type="button"
              onClick={() => record(!!to.trim())}
              disabled={preBusy || recorded}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {preBusy ? <Loader2 className="size-4 animate-spin" /> : recorded ? <Check className="size-4" /> : null}
              {recorded ? "Pre-aprobado" : to.trim() ? "Pre-aprobar y enviar por correo" : "Pre-aprobar"}
            </button>
            {preMsg ? (
              <p className={`text-xs ${preMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{preMsg.text}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
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
