"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, Archive, ArchiveRestore, Rocket, X, Loader2, Check, Mail, MessageCircle, Link2Off } from "lucide-react";
import { cn } from "@/lib/utils";
import { bulkSetArchived, bulkSetPublished, bulkSendReviewLinks, suggestedRecipients } from "./bulk-actions";

// ── Marcar varias piezas y actuar sobre todas ──
// Una campaña sale en tanda: se marcan las que van juntas y desde la barra de abajo se le
// mandan al cliente, se archivan o se marcan publicadas de un golpe. La casilla solo aparece
// en lo que esta persona puede gestionar; el resto de la tarjeta queda igual que siempre.

export type SelectableItem = {
  id: string;
  name: string;
  archived: boolean;
  published: boolean;
  publishable: boolean; // el cliente ya lo aprobó
  linkActive: boolean;
  canPublish: boolean;
};

type Ctx = {
  items: Map<string, SelectableItem>;
  selected: Set<string>;
  toggle: (id: string) => void;
};

const SelectionCtx = React.createContext<Ctx | null>(null);

export function SelectionProvider({
  items,
  emailEnabled,
  whatsappEnabled,
  children,
}: {
  items: SelectableItem[];
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  children: React.ReactNode;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const mapa = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Lo marcado se resuelve contra la lista de AHORA: si una pieza ya no está a la vista (otra
  // pestaña, otro filtro), simplemente no entra. Así no hace falta limpiar el estado en un
  // efecto y nunca se manda una acción sobre algo que ya no se ve.
  const marcadas = React.useMemo(
    () => [...selected].map((id) => mapa.get(id)).filter((i): i is SelectableItem => Boolean(i)),
    [selected, mapa],
  );

  const toggle = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const ctx = React.useMemo(() => ({ items: mapa, selected, toggle }), [mapa, selected, toggle]);

  // El resultado de la última acción vive AQUÍ, no dentro de la barra: al terminar se quitan
  // las marcas, y si el aviso viviera en la barra se iría con ella justo cuando hay algo que
  // decir («enviadas 3 piezas»). Así el mensaje se queda hasta que la persona lo cierre.
  const [aviso, setAviso] = React.useState<{ ok: boolean; text: string } | null>(null);

  return (
    <SelectionCtx.Provider value={ctx}>
      {children}
      {marcadas.length || aviso ? (
        <BulkBar
          selected={marcadas}
          onClear={() => setSelected(new Set())}
          aviso={aviso}
          setAviso={setAviso}
          emailEnabled={emailEnabled}
          whatsappEnabled={whatsappEnabled}
        />
      ) : null}
    </SelectionCtx.Provider>
  );
}

// Casilla de una tarjeta. Devuelve null si esa pieza no es seleccionable (sin permiso de
// gestión) o si la página no está envuelta por el proveedor.
export function SelectCheck({ id }: { id: string }) {
  const ctx = React.useContext(SelectionCtx);
  if (!ctx || !ctx.items.has(id)) return null;
  const marcado = ctx.selected.has(id);
  return (
    <label
      className={cn(
        "relative mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors",
        marcado ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-transparent hover:border-primary/60",
      )}
      title={marcado ? "Quitar de la selección" : "Marcar para enviar al cliente, archivar o publicar en lote"}
    >
      <input
        type="checkbox"
        checked={marcado}
        onChange={() => ctx.toggle(id)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={marcado ? `Quitar «${ctx.items.get(id)?.name ?? ""}» de la selección` : `Marcar «${ctx.items.get(id)?.name ?? ""}»`}
      />
      <Check className="size-3.5" />
    </label>
  );
}

// ── Barra flotante ──
function BulkBar({
  selected,
  onClear,
  aviso,
  setAviso,
  emailEnabled,
  whatsappEnabled,
}: {
  selected: SelectableItem[];
  onClear: () => void;
  aviso: { ok: boolean; text: string } | null;
  setAviso: (a: { ok: boolean; text: string } | null) => void;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [enviando, setEnviando] = React.useState(false);

  // Qué se puede hacer con lo marcado (se dice el número real, no una promesa).
  const todosArchivados = selected.every((i) => i.archived);
  const publicables = selected.filter((i) => i.canPublish && !i.published && i.publishable).length;
  const despublicables = selected.filter((i) => i.canPublish && i.published).length;
  const conEnlace = selected.filter((i) => i.linkActive).length;
  const puedeEnviar = conEnlace > 0 && (emailEnabled || whatsappEnabled);

  function correr(fn: () => Promise<{ ok: boolean; error?: string; done?: number }>, verbo: string) {
    setAviso(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) { setAviso({ ok: false, text: r.error ?? "No se pudo completar." }); return; }
      setAviso({ ok: true, text: `${verbo} ${r.done ?? 0} ${(r.done ?? 0) === 1 ? "pieza" : "piezas"}.` });
      onClear();
      router.refresh();
    });
  }

  const ids = selected.map((i) => i.id);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-4">
      <div className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Sin nada marcado la barra ya solo existe para dejar leído el resultado. */}
        {selected.length === 0 ? (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className={cn("text-sm", aviso?.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              {aviso?.text}
            </span>
            <button
              type="button"
              onClick={() => setAviso(null)}
              className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            {selected.length} {selected.length === 1 ? "marcada" : "marcadas"}
          </span>

          {puedeEnviar ? (
            <button
              type="button"
              onClick={() => { setEnviando((v) => !v); setAviso(null); }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                enviando ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent",
              )}
            >
              <Send className="size-3.5" /> Enviar al cliente
            </button>
          ) : !emailEnabled && !whatsappEnabled ? (
            // Se distingue el porqué: no es lo mismo que no haya por dónde mandarlo que que el
            // enlace esté muerto.
            <span
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
              title="Configura el correo o WhatsApp en Configuración → Integraciones para poder enviar desde aquí"
            >
              <Send className="size-3.5" /> Sin correo ni WhatsApp
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
              title="Ninguna de las marcadas tiene el enlace de revisión activo (revocado o caducado)"
            >
              <Link2Off className="size-3.5" /> Sin enlace activo
            </span>
          )}

          <button
            type="button"
            disabled={pending}
            onClick={() => correr(() => bulkSetArchived(ids, !todosArchivados), todosArchivados ? "Desarchivadas" : "Archivadas")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
            title={todosArchivados ? "Devolver a la bandeja activa" : "Sale de la bandeja; el enlace sigue vivo"}
          >
            {todosArchivados ? <><ArchiveRestore className="size-3.5" /> Desarchivar</> : <><Archive className="size-3.5" /> Archivar</>}
          </button>

          {despublicables > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => correr(() => bulkSetPublished(ids, false), "Sin sello de publicado")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
              title="Vuelven a Aprobados"
            >
              <Rocket className="size-3.5" /> Quitar publicado ({despublicables})
            </button>
          ) : publicables > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => correr(() => bulkSetPublished(ids, true), "Publicadas")}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              title="Pasan a la pestaña Publicados con la fecha de hoy"
            >
              <Rocket className="size-3.5" /> Marcar publicado ({publicables})
            </button>
          ) : null}

          {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}

          <button
            type="button"
            onClick={onClear}
            className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Quitar la selección"
          >
            <X className="size-4" />
          </button>
        </div>
        )}

        {selected.length > 0 && aviso ? (
          <p className={cn("border-t border-border px-3 py-2 text-xs", aviso.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
            {aviso.text}
          </p>
        ) : null}

        {selected.length > 0 && enviando ? (
          <SendPanel
            ids={ids}
            conEnlace={conEnlace}
            total={selected.length}
            emailEnabled={emailEnabled}
            whatsappEnabled={whatsappEnabled}
            onDone={(text) => { setEnviando(false); setAviso({ ok: true, text }); onClear(); router.refresh(); }}
          />
        ) : null}
      </div>
    </div>
  );
}

// Formulario de envío: canal, destinatario y una nota opcional. El contacto del cliente se
// propone solo (el WhatsApp de la ficha y el correo de su portal).
function SendPanel({
  ids,
  conEnlace,
  total,
  emailEnabled,
  whatsappEnabled,
  onDone,
}: {
  ids: string[];
  conEnlace: number;
  total: number;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  onDone: (text: string) => void;
}) {
  const [canal, setCanal] = React.useState<"email" | "whatsapp">(emailEnabled ? "email" : "whatsapp");
  const [to, setTo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const sugerido = React.useRef<{ email: string | null; phone: string | null } | null>(null);

  // Se piden los contactos una sola vez, al abrir el panel.
  React.useEffect(() => {
    let vivo = true;
    suggestedRecipients(ids)
      .then((s) => {
        if (!vivo) return;
        sugerido.current = s;
        setTo((prev) => prev || (canal === "email" ? s.email ?? "" : s.phone ?? ""));
      })
      .catch(() => null);
    return () => { vivo = false; };
    // Solo al montar: cambiar de canal rellena desde `sugerido.current`, sin volver a consultar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cambiarCanal(c: "email" | "whatsapp") {
    setCanal(c);
    setError(null);
    const s = sugerido.current;
    setTo(c === "email" ? s?.email ?? "" : s?.phone ?? "");
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await bulkSendReviewLinks(ids, { channel: canal, to, note });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "No se pudo enviar."); return; }
    onDone(`Enviadas ${r.done ?? 0} ${(r.done ?? 0) === 1 ? "pieza" : "piezas"} por ${canal === "whatsapp" ? "WhatsApp" : "correo"}.`);
  }

  return (
    <form onSubmit={enviar} className="space-y-2 border-t border-border bg-muted/30 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {emailEnabled ? (
          <ChannelBtn active={canal === "email"} onClick={() => cambiarCanal("email")} icon={Mail}>Correo</ChannelBtn>
        ) : null}
        {whatsappEnabled ? (
          <ChannelBtn active={canal === "whatsapp"} onClick={() => cambiarCanal("whatsapp")} icon={MessageCircle}>WhatsApp</ChannelBtn>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {conEnlace === total ? `${total} ${total === 1 ? "enlace" : "enlaces"}` : `${conEnlace} de ${total} con enlace activo`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
          type={canal === "email" ? "email" : "tel"}
          placeholder={canal === "email" ? "correo@cliente.com" : "573001234567"}
          className="min-w-44 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota para el cliente (opcional)"
          className="min-w-44 flex-[2] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar
        </button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}

function ChannelBtn({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof Mail; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" /> {children}
    </button>
  );
}
