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
  createdAtMs: number; // para ordenar por «Recientes» sin volver a parsear la fecha
  projectId: string | null;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
};

export type LibOption = { id: string; name: string };

const KIND_LABEL: Record<string, string> = { DRIVE: "Google Drive", LINK: "Enlace", NAS: "Ruta del NAS", LOCAL: "Archivo" };
const KIND_FILTERS: { key: string; label: string }[] = [
  { key: "ALL", label: "Todo" },
  { key: "DRIVE", label: "Drive" },
  { key: "LINK", label: "Enlaces" },
  { key: "NAS", label: "Rutas NAS" },
];
const SIN_CATEGORIA = "Sin categoría";
// Cuántas categorías se ven antes de plegar el resto. Con muchas categorías la fila de
// chips se convertía en un muro de tres renglones que empujaba la lista fuera de pantalla.
const CATS_VISIBLES = 8;
const inputCls = "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Dónde lleva el recurso, en corto: el dominio para los enlaces y la ruta para el NAS. Se
// pinta junto al nombre porque «Manual de marca» no dice si abre en Drive o en el NAS, y
// eso cambia lo que hay que hacer con él (abrirlo o copiarlo y pegarlo en el explorador).
function destino(kind: string, url: string | null): string | null {
  if (!url) return null;
  if (kind === "NAS") return url;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const resto = u.pathname.replace(/\/$/, "");
    return resto && resto !== "/" ? `${host}${resto}` : host;
  } catch {
    return url;
  }
}

function KindIcon({ kind }: { kind: string }) {
  const base = "flex size-7 shrink-0 items-center justify-center rounded-lg";
  if (kind === "NAS") {
    return (
      <span className={`${base} bg-amber-500/10 text-amber-600 dark:text-amber-400`} title="Ruta del NAS">
        <Server className="size-3.5" />
      </span>
    );
  }
  if (kind === "DRIVE") {
    return (
      <span className={`${base} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`} title="Google Drive">
        <ExternalLink className="size-3.5" />
      </span>
    );
  }
  return (
    <span className={`${base} bg-primary/10 text-primary`} title="Enlace">
      <ExternalLink className="size-3.5" />
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
function RecursoRow({ r, editing, copied, canManage, userId, projects, clients, mostrarCategoria, onCopy, onEdit, onCancel }: {
  r: LibRow;
  editing: boolean;
  copied: boolean;
  canManage: boolean;
  userId: string;
  projects: LibOption[];
  clients: LibOption[];
  // En la vista agrupada la categoría ya la dice el encabezado: repetirla en cada fila es ruido.
  mostrarCategoria: boolean;
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

  const dest = destino(r.kind, r.url);
  const quienCuando = [r.uploadedByName, r.createdAtLabel].filter(Boolean).join(" · ");

  return (
    <div className="group flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-accent/40">
      <KindIcon kind={r.kind} />

      {/* Nombre + a dónde lleva, en UN renglón. Antes cada recurso ocupaba tres. */}
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        {r.kind === "NAS" ? (
          <span className="truncate text-sm font-medium">{r.name}</span>
        ) : (
          <a
            href={r.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sm font-medium hover:text-primary hover:underline"
          >
            {r.name}
          </a>
        )}
        {dest ? (
          <span
            className={`hidden max-w-[42%] shrink-0 truncate text-[11px] text-muted-foreground lg:block ${r.kind === "NAS" ? "font-mono" : ""}`}
            title={r.url ?? undefined}
          >
            {dest}
          </span>
        ) : null}
      </div>

      {/* Etiquetas: solo las que aportan algo aquí. */}
      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        {mostrarCategoria && r.category ? (
          <span className="rounded-full bg-accent px-2 py-px text-[11px] font-medium text-accent-foreground">{r.category}</span>
        ) : null}
        {r.projectName ? (
          <span className="max-w-40 truncate rounded-full bg-primary/10 px-2 py-px text-[11px] font-medium text-primary" title={`Proyecto: ${r.projectName}`}>
            {r.projectName}
          </span>
        ) : null}
        {r.clientName ? (
          <span className="max-w-32 truncate rounded-full bg-accent px-2 py-px text-[11px] font-medium text-accent-foreground" title={`Cliente: ${r.clientName}`}>
            {r.clientName}
          </span>
        ) : null}
        <span className="w-20 shrink-0 truncate text-right text-[11px] text-muted-foreground" title={quienCuando}>
          {r.createdAtLabel}
        </span>
      </div>

      {/* Acciones: se atenúan hasta que el puntero entra en la fila, pero siguen ahí para
          el teclado y para el táctil (no se ocultan con `hidden`). */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {r.url ? (
          <button
            type="button"
            onClick={onCopy}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title={r.kind === "NAS" ? "Copiar ruta" : "Copiar enlace"}
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          </button>
        ) : null}
        {canManage ? (
          <form action={toggleLibraryPin.bind(null, r.id)}>
            <button
              className={`flex size-7 items-center justify-center rounded-md hover:bg-accent ${r.pinned ? "text-amber-500" : "text-muted-foreground hover:text-foreground"}`}
              title={r.pinned ? "Soltar de fijados" : "Fijar arriba"}
            >
              <Star className={`size-3.5 ${r.pinned ? "fill-current" : ""}`} />
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
            <Pencil className="size-3.5" />
          </button>
        ) : null}
        {canEdit ? (
          <form action={deleteLibraryAsset.bind(null, r.id)}>
            <ConfirmSubmit
              message={`¿Eliminar «${r.name}» de la biblioteca?`}
              title="Eliminar"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </ConfirmSubmit>
          </form>
        ) : null}
      </div>
    </div>
  );
}

export function Recursos({ rows, canManage, userId, projects, clients, baseCategories, initialQ = "" }: {
  rows: LibRow[];
  canManage: boolean;
  userId: string;
  projects: LibOption[];
  clients: LibOption[];
  baseCategories: string[];
  initialQ?: string; // llega del deep-link de ⌘K (/biblioteca?q=…)
}) {
  const [q, setQ] = useState(initialQ);
  const [kind, setKind] = useState("ALL");
  const [cat, setCat] = useState<string | null>(null);
  const [orden, setOrden] = useState<"categoria" | "recientes">("categoria");
  const [verTodasCats, setVerTodasCats] = useState(false);
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

  // Alfabético y con «Sin categoría» al final: el orden no baila cuando cambian los conteos.
  const catsOrdenadas = useMemo(
    () =>
      [...catCounts.entries()].sort((a, b) =>
        a[0] === SIN_CATEGORIA ? 1 : b[0] === SIN_CATEGORIA ? -1 : a[0].localeCompare(b[0], "es"),
      ),
    [catCounts],
  );
  // La categoría elegida siempre se ve, aunque esté fuera de las primeras.
  const catsVisibles = verTodasCats
    ? catsOrdenadas
    : catsOrdenadas.filter(([c], i) => i < CATS_VISIBLES || c === cat);
  const catsOcultas = catsOrdenadas.length - catsVisibles.length;

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

  const hayFiltro = Boolean(q.trim()) || kind !== "ALL" || cat !== null;
  const limpiar = () => { setQ(""); setKind("ALL"); setCat(null); };

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

  // «Recientes»: lo último que entró, sin agrupar. Responde a «¿qué se añadió esta semana?»,
  // que con la lista por categorías obligaba a recorrerlas todas.
  const recientes = useMemo(() => [...rest].sort((a, b) => b.createdAtMs - a.createdAtMs), [rest]);

  function copiar(r: LibRow) {
    if (!r.url) return;
    navigator.clipboard?.writeText(r.url).then(() => {
      setCopiedId(r.id);
      setTimeout(() => setCopiedId((prev) => (prev === r.id ? null : prev)), 1600);
    });
  }

  function row(r: LibRow, mostrarCategoria: boolean) {
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
        mostrarCategoria={mostrarCategoria}
        onCopy={() => copiar(r)}
        onEdit={() => setEditingId(r.id)}
        onCancel={() => setEditingId(null)}
      />
    );
  }

  const chipCls = (activo: boolean) =>
    `shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
      activo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div>
      {/* Buscador + orden + alta */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, categoría, proyecto o ruta…"
            className={`w-full pl-9 ${inputCls}`}
          />
        </div>
        <div className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-muted p-1">
          {([["categoria", "Por categoría"], ["recientes", "Recientes"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setOrden(k)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                orden === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setAddMode((m) => (m === "cerrado" ? "link" : "cerrado"))}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Añadir
          </button>
        ) : null}
      </div>

      {/* Filtros: tipo y categoría en UNA fila que no se desborda. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {KIND_FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setKind(f.key)} className={chipCls(kind === f.key)}>
            {f.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {catsVisibles.map(([c, n]) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat((prev) => (prev === c ? null : c))}
            className={chipCls(cat === c)}
          >
            {c} <span className="opacity-70 tabular-nums">{n}</span>
          </button>
        ))}
        {catsOcultas > 0 && !verTodasCats ? (
          <button type="button" onClick={() => setVerTodasCats(true)} className="shrink-0 px-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            +{catsOcultas} más
          </button>
        ) : null}
        {verTodasCats && catsOrdenadas.length > CATS_VISIBLES ? (
          <button type="button" onClick={() => setVerTodasCats(false)} className="shrink-0 px-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            Ver menos
          </button>
        ) : null}
      </div>

      {/* Qué se está viendo: sin esto, un filtro puesto sin querer parece una biblioteca vacía. */}
      {hayFiltro ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {filtered.length} de {rows.length} recurso{rows.length === 1 ? "" : "s"}
          </span>
          <button type="button" onClick={limpiar} className="font-medium text-primary hover:underline">
            Limpiar filtros
          </button>
        </p>
      ) : null}

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

      {/* Fijados: los recursos de cabecera del estudio, siempre arriba. */}
      {pinned.length > 0 ? (
        <div className="mt-5">
          <h2 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Star className="size-3 fill-amber-500 text-amber-500" /> Fijados
          </h2>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-amber-500/30 bg-card shadow-sm">
            {pinned.map((r) => row(r, true))}
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={<IconBiblioteca />}
            title={rows.length === 0 ? "La biblioteca está vacía" : "Nada coincide con la búsqueda"}
            description={rows.length === 0 ? "Añade música, logos, plantillas, stock o rutas del NAS." : "Prueba con otro término o quita los filtros."}
          />
        </div>
      ) : orden === "recientes" ? (
        <div className="mt-5">
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lo último añadido {rest.length ? <span className="opacity-70">· {rest.length}</span> : null}
          </h2>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {recientes.map((r) => row(r, true))}
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {groups.map(([c, items]) => (
            <section key={c}>
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {c} <span className="opacity-70">· {items.length}</span>
              </h2>
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                {items.map((r) => row(r, false))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
