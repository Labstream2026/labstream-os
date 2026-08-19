"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, PenLine, Send, X } from "lucide-react";
import { enviarCorreoForm, guardarBorrador } from "./acciones";

// ── El compositor flotante (estilo Gmail) ───────────────────────────────────
// Una sola pieza para los cuatro modos: nuevo, responder, responder a todos y reenviar. El
// modo solo decide los prellenos; el envío es siempre el mismo FormData (por los adjuntos).
// La firma NO se pinta aquí: la añade el servidor con el nombre y cargo reales — un campo
// de firma editable en cada correo es la forma de que cada quien la rompa a su manera.

export type PrefillCompositor = {
  modo: "nuevo" | "responder" | "todos" | "reenviar" | "borrador";
  para?: string;
  cc?: string;
  asunto?: string;
  texto?: string;
  responderAId?: string;
  reenviarDeId?: string;
  /** Si se abre desde un borrador guardado, su id: editarlo actualiza en vez de duplicar. */
  borradorId?: string;
};

type Ctx = { abrir: (p: PrefillCompositor) => void };
const CompositorCtx = React.createContext<Ctx | null>(null);
export function useCompositor(): Ctx {
  const ctx = React.useContext(CompositorCtx);
  if (!ctx) throw new Error("useCompositor fuera del proveedor");
  return ctx;
}

export function CompositorProvider({ contactos, children }: { contactos: string[]; children: React.ReactNode }) {
  const router = useRouter();
  const [prefill, setPrefill] = React.useState<PrefillCompositor | null>(null);
  const [conCc, setConCc] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nombres, setNombres] = React.useState<string[]>([]);
  const [pendiente, arranca] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  // ── Autoguardado de borrador ──
  // Al 1,5 s de dejar de teclear se guarda solo; cerrar sin enviar NO pierde nada — el
  // borrador queda en su carpeta. Enviar lo borra (lo hace el servidor).
  const [borradorId, setBorradorId] = React.useState<string | null>(null);
  const [guardadoTxt, setGuardadoTxt] = React.useState<string | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const borradorRef = React.useRef<string | null>(null);
  borradorRef.current = borradorId;

  const autoguardar = React.useCallback((p: PrefillCompositor | null) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const form = formRef.current;
      if (!form || !p) return;
      const fd = new FormData(form);
      const texto = String(fd.get("texto") ?? "");
      const para = String(fd.get("para") ?? "");
      const asunto = String(fd.get("asunto") ?? "");
      if (!texto.trim() && !para.trim() && !asunto.trim()) return; // vacío: nada que guardar
      const r = await guardarBorrador({
        id: borradorRef.current,
        para, cc: String(fd.get("cc") ?? ""), asunto, texto,
        responderAId: p.responderAId ?? null,
        reenviarDeId: p.reenviarDeId ?? null,
      });
      if (r) {
        setBorradorId(r.id);
        setGuardadoTxt(new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
      }
    }, 1500);
  }, []);

  const abrir = React.useCallback((p: PrefillCompositor) => {
    setError(null);
    setConCc(!!p.cc);
    setNombres([]);
    setBorradorId(p.borradorId ?? null);
    setGuardadoTxt(null);
    setPrefill(p);
  }, []);

  // Atajo `c` de Gmail: redactar desde cualquier parte de la bandeja.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (e.key === "c" && !e.metaKey && !e.ctrlKey) abrir({ modo: "nuevo" });
      if (e.key === "Escape") setPrefill(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abrir]);

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    arranca(async () => {
      const r = await enviarCorreoForm(fd);
      if (!r.ok) { setError(r.error ?? "No se pudo enviar."); return; }
      setPrefill(null);
      router.refresh();
    });
  };

  const titulo =
    prefill?.modo === "responder" ? "Responder" : prefill?.modo === "todos" ? "Responder a todos" : prefill?.modo === "reenviar" ? "Reenviar" : "Mensaje nuevo";

  return (
    <CompositorCtx.Provider value={{ abrir }}>
      {children}
      {prefill ? (
        <div className="fixed bottom-0 right-4 z-40 flex w-[min(540px,calc(100vw-2rem))] flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center bg-foreground px-4 py-2.5 text-[13px] font-semibold text-background">
            {titulo}
            <button type="button" onClick={() => setPrefill(null)} aria-label="Cerrar" className="ml-auto rounded p-0.5 hover:opacity-70"><X className="size-4" /></button>
          </div>
          <form ref={formRef} onSubmit={enviar} onChange={() => autoguardar(prefill)} className="flex flex-col">
            <input type="hidden" name="responderAId" value={prefill.responderAId ?? ""} />
            <input type="hidden" name="reenviarDeId" value={prefill.reenviarDeId ?? ""} />
            <input type="hidden" name="borradorId" value={borradorId ?? ""} />
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-[13px]">
              <span className="text-muted-foreground">Para</span>
              <input
                name="para" required defaultValue={prefill.para ?? ""} list="correo-contactos" autoComplete="off"
                placeholder="cliente@ejemplo.com — separa varios con coma"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
              {!conCc ? (
                <button type="button" onClick={() => setConCc(true)} className="text-[12px] font-medium text-primary hover:underline">CC</button>
              ) : null}
            </div>
            {conCc ? (
              <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-[13px]">
                <span className="text-muted-foreground">CC</span>
                <input name="cc" defaultValue={prefill.cc ?? ""} list="correo-contactos" autoComplete="off" className="min-w-0 flex-1 bg-transparent outline-none" />
              </div>
            ) : (
              <input type="hidden" name="cc" value="" />
            )}
            <div className="border-b border-border px-4 py-2 text-[13px]">
              <input name="asunto" defaultValue={prefill.asunto ?? ""} placeholder="Asunto" className="w-full bg-transparent outline-none" />
            </div>
            <textarea
              name="texto" required rows={9} autoFocus defaultValue={prefill.texto ?? ""}
              placeholder={prefill.modo === "reenviar" ? "Escribe algo antes del mensaje reenviado (se cita solo)…" : "Escribe el mensaje…"}
              className="resize-y bg-transparent px-4 py-3 text-[13.5px] leading-relaxed outline-none"
            />
            {nombres.length ? (
              <p className="flex flex-wrap gap-1.5 px-4 pb-1">
                {nombres.map((n) => (
                  <span key={n} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"><Paperclip className="size-3" /> {n}</span>
                ))}
              </p>
            ) : null}
            {error ? <p className="px-4 pb-1 text-[12px] font-medium text-destructive">{error}</p> : null}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button type="submit" disabled={pendiente}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-[13px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar
              </button>
              <label className="cursor-pointer rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Adjuntar archivos (máx. 15 MB en total)">
                <Paperclip className="size-4" />
                <input
                  type="file" name="archivos" multiple className="hidden"
                  onChange={(e) => setNombres([...(e.target.files ?? [])].map((f) => f.name))}
                />
              </label>
              <span className="ml-auto text-[10.5px] text-muted-foreground">
                firma automática ✓{guardadoTxt ? ` · borrador guardado ${guardadoTxt}` : ""}
              </span>
            </div>
          </form>
        </div>
      ) : null}
      {/* Autocompletar: los contactos de tus clientes y del equipo, del CRM — no una libreta aparte. */}
      <datalist id="correo-contactos">
        {contactos.map((c) => (<option key={c} value={c} />))}
      </datalist>
    </CompositorCtx.Provider>
  );
}

/** Abre el compositor con un borrador guardado (fila de la carpeta Borradores). */
export function AbrirBorrador({ borrador, children, className }: {
  borrador: { id: string; para: string; cc: string; asunto: string; texto: string; responderAId: string | null; reenviarDeId: string | null };
  children: React.ReactNode;
  className?: string;
}) {
  const { abrir } = useCompositor();
  return (
    <button
      type="button" className={className}
      onClick={() =>
        abrir({
          modo: "borrador",
          borradorId: borrador.id,
          para: borrador.para,
          cc: borrador.cc,
          asunto: borrador.asunto,
          texto: borrador.texto,
          responderAId: borrador.responderAId ?? undefined,
          reenviarDeId: borrador.reenviarDeId ?? undefined,
        })
      }
    >
      {children}
    </button>
  );
}

export function BotonRedactar() {
  const { abrir } = useCompositor();
  return (
    <button
      type="button" onClick={() => abrir({ modo: "nuevo" })}
      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground shadow-md hover:bg-primary/90"
    >
      <PenLine className="size-4" /> Redactar
    </button>
  );
}
