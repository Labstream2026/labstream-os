"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Server,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { EmptyState } from "@/components/ui/empty-state";
import { IconBiblioteca } from "@/components/icons";
import {
  addLibraryAsset,
  addLibraryNasPath,
  deleteLibraryAsset,
  toggleLibraryPin,
  updateLibraryAsset,
} from "./actions";

// Fila de la Biblioteca ya aplanada por el servidor (fechas y nombres resueltos).
export type LibRow = {
  id: string;
  name: string;
  kind: string; // LINK | DRIVE | NAS
  url: string | null;
  category: string | null;
  pinned: boolean;
  uploadedById: string | null;
  uploadedByName: string | null;
  createdAtLabel: string;
  projectId: string | null;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
};

export type LibOption = { id: string; name: string };

const KIND_LABEL: Record<string, string> = { DRIVE: "Google Drive", LINK: "Enlace", NAS: "Ruta del NAS", LOCAL: "Archivo" };
const KIND_FILTERS: { key: string; label: string }[] = [
  { key: "ALL", label: "Todos" },
  { key: "DRIVE", label: "Drive" },
  { key: "LINK", label: "Enlaces" },
  { key: "NAS", label: "Rutas NAS" },
];
const SIN_CATEGORIA = "Sin categoría";
const inputCls = "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function KindIcon({ kind }: { kind: string }) {
  if (kind === "NAS") {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <Server className="size-4" />
      </span>
    );
  }
  if (kind === "DRIVE") {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <ExternalLink className="size-4" />
      </span>
    );
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <ExternalLink className="size-4" />
    </span>
  );
}

// Selectores de proyecto/cliente compartidos por alta y edición.
function LinkSelectors({ projects, clients, projectId, clientId }: {
  projects: LibOption[];
  clients: LibOption[];
  projectId?: string | null;
  clientId?: string | null;
}) {
  return (
    <>
      <select
        name="projectId"
        defaultValue={projectId ?? ""}
        className="w-44 rounded-md border border-input bg-background px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        title="Proyecto (opcional)"
      >
        <option value="">— Sin proyecto —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <select
        name="clientId"
        defaultValue={clientId ?? ""}
        className="w-40 rounded-md border border-input bg-background px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        title="Cliente (opcional)"
      >
        <option value="">— Sin cliente —</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </>
  );
}

// Fila independiente (fuera de Recursos para que los re-render del padre no
// remonten el formulario de edición y pierdan lo escrito).
function RecursoRow({ r, editing, copied, canManage, userId, projects, clients, onCopy, onEdit, onCancel }: {
  r: LibRow;
  editing: boolean;
  copied: boolean;
  canManage: boolean;
  userId: string;
  projects: LibOption[];
  clients: LibOption[];
  onCopy: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const canEdit = canManage || r.uploadedById === userId;
  if (editing) {
    return (
      <form
        action={updateLibraryAsset.bind(null, r.id)}
        onSubmit={onCancel}
        className="flex flex-wrap items-center gap-2 bg-accent/40 p-3"
      >
        <input name="name" required defaultValue={r.name} placeholder="Nombre" className={`min-w-40 flex-1 ${inputCls}`} />
        <input
          name="url"
          required
          defaultValue={r.url ?? ""}
          placeholder={r.kind === "NAS" ? "\\\\NAS\\carpeta" : "https://…"}
          className={`min-w-52 flex-1 ${r.kind === "NAS" ? "font-mono" : ""} ${inputCls}`}
        />
        <input name="category" list="lib-cats" defaultValue={r.category ?? ""} placeholder="Categoría" className={`w-32 ${inputCls}`} />
        <LinkSelectors projects={projects} clients={clients} projectId={r.projectId} clientId={r.clientId} />
        <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Guardar</button>
        <button
          type="button"
          onClick={onCancel}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          title="Cancelar"
        >
          <X className="size-4" />
        </button>
      </form>
    );
  }
  return (
    <div className="group flex items-center gap-3 p-3">
      <KindIcon kind={r.kind} />
      <div className="min-w-0 flex-1">
        {r.kind === "NAS" ? (
          <span className="font-medium">{r.name}</span>
        ) : (
          <a href={r.url ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium hover:underline">
            {r.name} <ExternalLink className="size-3.5 text-muted-foreground" />
          </a>
        )}
        {r.kind === "NAS" && r.url ? (
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{r.url}</p>
        ) : null}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{KIND_LABEL[r.kind] ?? r.kind}</span>
          {r.projectName ? (
            <span className="rounded-full bg-primary/10 px-2 py-px font-medium text-primary">📁 {r.projectName}</span>
          ) : null}
          {r.clientName ? (
            <span className="rounded-full bg-accent px-2 py-px font-medium text-accent-foreground">{r.clientName}</span>
          ) : null}
          {r.uploadedByName ? <span>· {r.uploadedByName}</span> : null}
          <span>· {r.createdAtLabel}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {r.url ? (
          <button
            type="button"
            onClick={onCopy}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title={r.kind === "NAS" ? "Copiar ruta" : "Copiar enlace"}
          >
            {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
          </button>
        ) : null}
        {canManage ? (
          <form action={toggleLibraryPin.bind(null, r.id)}>
            <button
              className={`flex size-7 items-center justify-center rounded-md hover:bg-accent ${r.pinned ? "text-amber-500" : "text-muted-foreground hover:text-foreground"}`}
              title={r.pinned ? "Soltar de fijados" : "Fijar arriba"}
            >
              <Star className={`size-4 ${r.pinned ? "fill-current" : ""}`} />
            </button>
          </form>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Editar"
          >
            <Pencil className="size-4" />
          </button>
        ) : null}
        {canEdit ? (
          <form action={deleteLibraryAsset.bind(null, r.id)}>
            <ConfirmSubmit
              message={`¿Eliminar «${r.name}» de la biblioteca?`}
              title="Eliminar"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </ConfirmSubmit>
          </form>
        ) : null}
      </div>
    </div>
  );
}

export function Recursos({ rows, canManage, userId, projects, clients, baseCategories }: {
  rows: LibRow[];
  canManage: boolean;
  userId: string;
  projects: LibOption[];
  clients: LibOption[];
  baseCategories: string[];
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("ALL");
  const [cat, setCat] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<"cerrado" | "link" | "nas">("cerrado");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Categorías con conteo (de los datos + las sugeridas de siempre para el alta).
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const key = r.category || SIN_CATEGORIA;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return rows.filter((r) => {
      if (kind !== "ALL" && r.kind !== kind) return false;
      if (cat && (r.category || SIN_CATEGORIA) !== cat) return false;
      if (!nq) return true;
      const hay = norm(
        [r.name, r.category ?? "", r.url ?? "", r.projectName ?? "", r.clientName ?? "", r.uploadedByName ?? ""].join(" ")
      );
      return nq.split(/\s+/).every((part) => hay.includes(part));
    });
  }, [rows, q, kind, cat]);

  const pinned = filtered.filter((r) => r.pinned);
  const rest = filtered.filter((r) => !r.pinned);

  // Agrupar por categoría, alfabético, «Sin categoría» al final.
  const groups = useMemo(() => {
    const m = new Map<string, LibRow[]>();
    for (const r of rest) {
      const key = r.category || SIN_CATEGORIA;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return [...m.entries()].sort((a, b) => {
      if (a[0] === SIN_CATEGORIA) return 1;
      if (b[0] === SIN_CATEGORIA) return -1;
      return a[0].localeCompare(b[0], "es");
    });
  }, [rest]);

  function copiar(r: LibRow) {
    if (!r.url) return;
    navigator.clipboard?.writeText(r.url).then(() => {
      setCopiedId(r.id);
      setTimeout(() => setCopiedId((prev) => (prev === r.id ? null : prev)), 1600);
    });
  }

  function row(r: LibRow) {
    return (
      <RecursoRow
        key={r.id}
        r={r}
        editing={editingId === r.id}
        copied={copiedId === r.id}
        canManage={canManage}
        userId={userId}
        projects={projects}
        clients={clients}
        onCopy={() => copiar(r)}
        onEdit={() => setEditingId(r.id)}
        onCancel={() => setEditingId(null)}
      />
    );
  }

  return (
    <div>
      {/* Buscador + filtros */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, categoría, proyecto o ruta…"
            className={`w-full pl-9 ${inputCls}`}
          />
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setAddMode((m) => (m === "cerrado" ? "link" : "cerrado"))}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Añadir
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setKind(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              kind === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="px-1 text-muted-foreground">·</span>
        {[...catCounts.entries()]
          .sort((a, b) => (a[0] === SIN_CATEGORIA ? 1 : b[0] === SIN_CATEGORIA ? -1 : a[0].localeCompare(b[0], "es")))
          .map(([c, n]) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat((prev) => (prev === c ? null : c))}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                cat === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {c} <span className="opacity-70">{n}</span>
            </button>
          ))}
      </div>

      {/* Alta (solo gestores) */}
      {canManage && addMode !== "cerrado" ? (
        <div className="mt-4 rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => setAddMode("link")}
              className={`rounded-md px-3 py-1.5 font-medium ${addMode === "link" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Enlace (Drive, web)
            </button>
            <button
              type="button"
              onClick={() => setAddMode("nas")}
              className={`rounded-md px-3 py-1.5 font-medium ${addMode === "nas" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Ruta del NAS (SMB)
            </button>
          </div>
          {addMode === "link" ? (
            <form action={addLibraryAsset} onSubmit={() => setAddMode("cerrado")} className="flex flex-wrap items-center gap-2">
              <input name="name" required placeholder="Nombre del recurso" className={`min-w-44 flex-1 ${inputCls}`} />
              <input
                name="url"
                type="url"
                required
                placeholder="https://… (Drive, web)"
                title="Pega un enlace completo, p.ej. https://drive.google.com/…"
                className={`min-w-44 flex-1 ${inputCls}`}
              />
              <input name="category" list="lib-cats" placeholder="Categoría" className={`w-32 ${inputCls}`} />
              <LinkSelectors projects={projects} clients={clients} />
              <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Añadir</button>
            </form>
          ) : (
            <form action={addLibraryNasPath} onSubmit={() => setAddMode("cerrado")} className="flex flex-wrap items-center gap-2">
              <input name="name" required placeholder="Nombre (ej. Material bruto Danney)" className={`min-w-44 flex-1 ${inputCls}`} />
              <input name="path" required placeholder="\\NAS\proyectos\danney\bruto" className={`min-w-52 flex-1 font-mono ${inputCls}`} />
              <input name="category" defaultValue="NAS" list="lib-cats" className={`w-32 ${inputCls}`} />
              <LinkSelectors projects={projects} clients={clients} />
              <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Añadir ruta</button>
              <p className="w-full text-xs text-muted-foreground">Pega la ruta tal cual la usas en Windows; quedará con botón «Copiar» para pegarla en el explorador.</p>
            </form>
          )}
        </div>
      ) : null}

      <datalist id="lib-cats">
        {baseCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* Fijados */}
      {pinned.length > 0 ? (
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">★ Fijados</h2>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-amber-500/30 bg-card shadow-sm">
            {pinned.map((r) => (
              row(r)
            ))}
          </div>
        </div>
      ) : null}

      {/* Resto por categoría */}
      {filtered.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={<IconBiblioteca />}
            title={rows.length === 0 ? "La biblioteca está vacía" : "Nada coincide con la búsqueda"}
            description={rows.length === 0 ? "Añade música, logos, plantillas, stock o rutas del NAS." : "Prueba con otro término o quita los filtros."}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map(([c, items]) => (
            <section key={c}>
              <h2 className="mb-2 text-sm font-semibold">
                {c} <span className="text-muted-foreground">· {items.length}</span>
              </h2>
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                {items.map((r) => (
                  row(r)
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
