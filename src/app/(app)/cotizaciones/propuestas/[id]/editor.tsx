"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronUp, ChevronDown, Copy, Trash2, Pencil, Plus, Eye, EyeOff,
  Link2, Printer, Settings2, Check, Loader2, Cloud, Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tone } from "@/lib/colors";
import { ProposalRenderer } from "../proposal-renderer";
import { ProposalPresentation } from "../proposal-presentation";
import { ProposalCine } from "../proposal-cine";
import { BlockEditPanel } from "./block-edit";
import { BLOCK_LABELS, STATUS_META, CINE_PALETTE, newBlock, type Block, type Brand, type BlockType, type ProposalStatus } from "@/lib/proposals/types";
import { saveProposalBlocks, updateProposalMeta, setProposalStatus, deleteProposal, setProposalPassword, createQuoteFromProposal } from "../actions";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

const ALL_TYPES = Object.keys(BLOCK_LABELS) as BlockType[];

export function ProposalEditor({
  id, code, initialTitle, initialBlocks, initialBrand, initialStatus, initialExpiresAt, initialClientId = "", initialHasPassword = false, acceptance = null, rejection = null, initialQuote = null, clients = [], publicUrl,
}: {
  id: string;
  code: string;
  initialTitle: string;
  initialBlocks: Block[];
  initialBrand: Brand;
  initialStatus: ProposalStatus;
  initialExpiresAt: string;
  initialClientId?: string;
  initialHasPassword?: boolean;
  acceptance?: { name: string | null; email: string | null; at: string } | null;
  rejection?: { name: string | null; email: string | null; at: string; reason: string | null } | null;
  /** Cotización ya nacida de esta propuesta (si el equipo ya la convirtió). */
  initialQuote?: { id: string; code: string } | null;
  clients?: { id: string; name: string; emoji: string | null }[];
  publicUrl: string;
}) {
  const router = useRouter();
  const [blocks, setBlocks] = React.useState<Block[]>(initialBlocks);
  const [brand, setBrand] = React.useState<Brand>(initialBrand);
  const [title, setTitle] = React.useState(initialTitle);
  const [clientId, setClientId] = React.useState(initialClientId);
  const [expiresAt, setExpiresAt] = React.useState(initialExpiresAt);
  const [status, setStatus] = React.useState<ProposalStatus>(initialStatus);
  const [preview, setPreview] = React.useState(false);
  const [editing, setEditing] = React.useState<number | null>(null);
  const [showSettings, setShowSettings] = React.useState(false);
  const [hasPassword, setHasPassword] = React.useState(initialHasPassword);
  const [pwInput, setPwInput] = React.useState("");
  const [pwBusy, setPwBusy] = React.useState(false);
  // Puente a facturación: la cotización nacida de esta propuesta.
  const [quoteRef, setQuoteRef] = React.useState(initialQuote);
  const [converting, setConverting] = React.useState(false);
  const [convertError, setConvertError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved">("idle");
  const dirtyRef = React.useRef(false);
  const { confirm, dialog } = useConfirmDialog();

  // Autoguardado de bloques (debounce). Solo tras la primera edición real.
  React.useEffect(() => {
    if (!dirtyRef.current) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        await saveProposalBlocks(id, blocks);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } catch {
        setSaveState("idle");
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [blocks, id]);

  const mutate = (fn: (prev: Block[]) => Block[]) => {
    dirtyRef.current = true;
    setBlocks(fn);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    mutate((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setEditing(null);
  };
  const dup = (i: number) => mutate((prev) => [...prev.slice(0, i + 1), { ...prev[i] }, ...prev.slice(i + 1)]);
  const del = (i: number) => { mutate((prev) => prev.filter((_, idx) => idx !== i)); setEditing(null); };
  const add = (type: BlockType) => { mutate((prev) => [...prev, newBlock(type, brand.email)]); };
  const updateBlock = (i: number, b: Block) => mutate((prev) => prev.map((x, idx) => (idx === i ? b : x)));

  async function saveMeta() {
    await updateProposalMeta(id, { title, brand, expiresAt: expiresAt || null, clientId: clientId || null });
    setShowSettings(false);
    router.refresh();
  }
  async function changeStatus(s: ProposalStatus) {
    setStatus(s);
    await setProposalStatus(id, s);
  }
  function copyLink() {
    navigator.clipboard.writeText(window.location.origin + publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  // Convierte la propuesta aceptada en cotización (el desglose viaja solo) y deja el enlace
  // a la vista. Idempotente en el servidor: un doble clic devuelve la misma cotización.
  async function convertToQuote() {
    setConverting(true);
    setConvertError(null);
    try {
      const r = await createQuoteFromProposal(id);
      if (r.ok && r.quote) { setQuoteRef(r.quote); router.refresh(); }
      else setConvertError(r.error ?? "No se pudo crear la cotización.");
    } catch {
      setConvertError("No se pudo crear la cotización. Inténtalo de nuevo.");
    } finally {
      setConverting(false);
    }
  }

  async function savePassword(remove: boolean) {
    setPwBusy(true);
    try {
      const r = await setProposalPassword(id, remove ? "" : pwInput);
      setHasPassword(r.hasPassword);
      setPwInput("");
    } finally {
      setPwBusy(false);
    }
  }

  const meta = STATUS_META[status];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      {dialog}
      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
        <Link href="/cotizaciones" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Cotizaciones</span>
        </Link>
        <span className="font-mono text-xs text-muted-foreground">{code}</span>
        <select
          value={status}
          onChange={(e) => changeStatus(e.target.value as ProposalStatus)}
          className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", tone(meta.tone).chip)}
        >
          {(Object.keys(STATUS_META) as ProposalStatus[]).map((s) => (<option key={s} value={s}>{STATUS_META[s].label}</option>))}
        </select>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="mr-1 hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            {saveState === "saving" ? <><Loader2 className="size-3.5 animate-spin" /> Guardando…</> : saveState === "saved" ? <><Cloud className="size-3.5" /> Guardado</> : null}
          </span>
          <button onClick={() => { setPreview((p) => !p); setEditing(null); }} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent" title="Vista previa">
            {preview ? <EyeOff className="size-4" /> : <Eye className="size-4" />} <span className="hidden sm:inline">{preview ? "Editar" : "Vista previa"}</span>
          </button>
          <button onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent" title="Copiar enlace del cliente">
            {copied ? <Check className="size-4 text-emerald-600" /> : <Link2 className="size-4" />} <span className="hidden sm:inline">{copied ? "Copiado" : "Enlace"}</span>
          </button>
          <a href={`/cotizaciones/propuestas/${id}/imprimir`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent" title="Imprimir / PDF">
            <Printer className="size-4" /> <span className="hidden sm:inline">PDF</span>
          </a>
          <button onClick={() => setShowSettings((s) => !s)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent" title="Ajustes">
            <Settings2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Constancia de aceptación: quién y cuándo aceptó el cliente (registro guardado al aceptar). */}
      {acceptance ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium text-emerald-800 dark:text-emerald-300">Aceptada por {acceptance.name || "el cliente"}</span>
          {acceptance.email ? <span className="text-emerald-700/80 dark:text-emerald-300/70">· {acceptance.email}</span> : null}
          {/* timeZone fija Bogotá: mismo texto en SSR y cliente (sin desajuste de hidratación) y hora local correcta. */}
          <span className="text-emerald-700/80 dark:text-emerald-300/70">· {new Date(acceptance.at).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" })}</span>
          {/* El puente comercial: de aquí sale la cotización con el desglose ya escrito. */}
          <span className="ml-auto flex items-center gap-2">
            {quoteRef ? (
              <Link
                href={`/cotizaciones/${quoteRef.id}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-background px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
              >
                <Receipt className="size-3.5" /> Ver cotización {quoteRef.code}
              </Link>
            ) : (
              <button
                type="button"
                onClick={convertToQuote}
                disabled={converting}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {converting ? <Loader2 className="size-3.5 animate-spin" /> : <Receipt className="size-3.5" />}
                Crear cotización
              </button>
            )}
          </span>
          {convertError ? <p className="w-full text-xs text-destructive">{convertError}</p> : null}
        </div>
      ) : null}

      {rejection ? (
        <div className="mb-4 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">No aprobada por {rejection.name || "el cliente"}</span>
            {rejection.email ? <span className="text-muted-foreground">· {rejection.email}</span> : null}
            <span className="text-muted-foreground">· {new Date(rejection.at).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" })}</span>
          </div>
          {rejection.reason ? <p className="mt-1 text-muted-foreground">«{rejection.reason}»</p> : null}
        </div>
      ) : null}

      {/* Ajustes (título, marca, validez) */}
      {showSettings ? (
        <div className="mb-5 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Título (interno)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Cliente vinculado (aparece en su ficha)</span>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Sin vincular</option>
              {clients.map((c) => (<option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ""}{c.name}</option>))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Estilo de presentación al cliente</span>
            <select
              value={brand.theme ?? "documento"}
              onChange={(e) => setBrand({ ...brand, theme: e.target.value as Brand["theme"] })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="documento">Documento — clásico, columna clara</option>
              <option value="presentacion">Presentación — inmersiva, pantalla completa oscura</option>
              <option value="cine">Cine — deck editorial con videos de fondo</option>
            </select>
            <span className="mt-1 block text-[11px] text-muted-foreground">Cambia cómo la ve el cliente. Usa «Vista previa» para verlo.</span>
          </label>

          {/* Paleta del tema Cine: los tres colores que mandan en el deck. */}
          {brand.theme === "cine" ? (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Paleta del deck</p>
              <div className="grid grid-cols-3 gap-3">
                {([
                  ["ink", "Fondo oscuro"],
                  ["cream", "Fondo claro"],
                  ["gold", "Acento"],
                ] as const).map(([k, label]) => (
                  <label key={k} className="block text-sm">
                    <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
                    <input
                      type="color"
                      value={brand.cine?.[k] ?? CINE_PALETTE[k]}
                      onChange={(e) => setBrand({ ...brand, cine: { ...(brand.cine ?? {}), [k]: e.target.value } })}
                      className="h-9 w-full rounded-md border border-input bg-background px-1"
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setBrand({ ...brand, cine: undefined })}
                className="mt-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Volver a la paleta de Labstream
              </button>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Empresa (marca)</span>
              <input value={brand.company} onChange={(e) => setBrand({ ...brand, company: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Color de acento</span>
              <input type="color" value={brand.accent} onChange={(e) => setBrand({ ...brand, accent: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-1" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Email de contacto</span>
              <input value={brand.email} onChange={(e) => setBrand({ ...brand, email: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Válida hasta</span>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </label>
          </div>
          {/* Reja de contraseña (opcional): protege el enlace público con una clave. Se guarda aparte
              de «Guardar ajustes» (es su propia acción). */}
          <div className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Contraseña de acceso (opcional)</span>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", hasPassword ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
                {hasPassword ? "🔒 Protegida" : "Sin contraseña"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                type="password"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                placeholder={hasPassword ? "Cambiar contraseña" : "Escribe una contraseña"}
                className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={() => savePassword(false)}
                disabled={pwBusy || !pwInput.trim()}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                {hasPassword ? "Cambiar" : "Proteger"}
              </button>
              {hasPassword ? (
                <button
                  onClick={() => savePassword(true)}
                  disabled={pwBusy}
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  Quitar
                </button>
              ) : null}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">El cliente deberá escribirla para ver la propuesta. Compártela por un canal aparte del enlace.</p>
          </div>

          <div className="flex justify-end">
            <button onClick={saveMeta} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Guardar ajustes</button>
          </div>
        </div>
      ) : null}

      {/* Documento */}
      {preview ? (
        brand.theme === "cine" ? (
          <ProposalCine blocks={blocks} brand={brand} variant="preview" />
        ) : brand.theme === "presentacion" ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <ProposalPresentation blocks={blocks} brand={brand} variant="preview" />
          </div>
        ) : (
          <ProposalRenderer blocks={blocks} brand={brand} />
        )
      ) : (
        <div className="space-y-3">
          {blocks.map((b, i) => (
            <div key={i} className="group/blk relative rounded-xl border border-dashed border-transparent p-2 transition-colors hover:border-border">
              {/* Toolbar del bloque */}
              <div className="absolute -top-2 right-2 z-10 flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover/blk:opacity-100">
                <span className="px-1.5 text-[10px] font-medium uppercase text-muted-foreground">{BLOCK_LABELS[b.type]}</span>
                <IconBtn title="Subir" onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp className="size-3.5" /></IconBtn>
                <IconBtn title="Bajar" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}><ChevronDown className="size-3.5" /></IconBtn>
                <IconBtn title="Editar" onClick={() => setEditing(editing === i ? null : i)} active={editing === i}><Pencil className="size-3.5" /></IconBtn>
                <IconBtn title="Duplicar" onClick={() => dup(i)}><Copy className="size-3.5" /></IconBtn>
                <IconBtn title="Eliminar" onClick={async () => { if (await confirm({ message: "¿Eliminar este bloque?", confirmLabel: "Eliminar", danger: true })) del(i); }} danger><Trash2 className="size-3.5" /></IconBtn>
              </div>

              <ProposalRenderer blocks={[b]} brand={brand} />

              {editing === i ? (
                <div className="mt-3 rounded-xl border border-border bg-muted/30 p-4">
                  <BlockEditPanel block={b} proposalId={id} onChange={(nb) => updateBlock(i, nb)} />
                </div>
              ) : null}
            </div>
          ))}

          {/* Añadir bloque */}
          <details data-autoclose className="relative">
            <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:bg-accent/50">
              <Plus className="size-4" /> Añadir bloque
            </summary>
            <div className="absolute left-1/2 z-10 mt-1 grid w-72 -translate-x-1/2 grid-cols-2 gap-1 rounded-lg border border-border bg-popover p-2 shadow-lg">
              {ALL_TYPES.map((t) => (
                <button key={t} onClick={() => add(t)} className="rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent">{BLOCK_LABELS[t]}</button>
              ))}
            </div>
          </details>

          <div className="pt-4">
            <button
              onClick={async () => { if (await confirm({ title: "Eliminar propuesta", message: "¿Eliminar esta propuesta? No se puede deshacer.", confirmLabel: "Eliminar", danger: true })) deleteProposal(id); }}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" /> Eliminar propuesta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled, danger, active }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; danger?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30",
        danger && "hover:bg-destructive/10 hover:text-destructive",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}
