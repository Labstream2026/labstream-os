import { db } from "@/lib/db";
import { FILE_KIND_LABEL, formatShortDate } from "@/lib/ui";
import { ExternalLink, Trash2, Library } from "lucide-react";
import { addLibraryAsset, deleteLibraryAsset } from "./actions";

export const dynamic = "force-dynamic";

const CATEGORIES = ["Música", "Logos", "Stock", "Plantillas", "Fuentes", "Marca"];

export default async function BibliotecaPage() {
  const assets = await db.libraryAsset.findMany({
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
    include: { uploadedBy: { select: { name: true } } },
  });

  // agrupar por categoría
  const groups = new Map<string, typeof assets>();
  for (const a of assets) {
    const key = a.category || "Sin categoría";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Biblioteca</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Recursos reutilizables del equipo: música, logos, stock, plantillas… {assets.length} elementos.
      </p>

      {/* Añadir */}
      <form action={addLibraryAsset} className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <input
          name="name"
          required
          placeholder="Nombre del recurso"
          className="min-w-44 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          name="url"
          required
          placeholder="Enlace (Drive, web…)"
          className="min-w-44 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          name="category"
          list="lib-cats"
          placeholder="Categoría"
          className="w-36 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <datalist id="lib-cats">
          {CATEGORIES.map((c) => <option key={c} value={c} />)}
        </datalist>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Añadir
        </button>
      </form>

      {assets.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <Library className="size-7 text-muted-foreground" />
          <p className="font-medium">La biblioteca está vacía</p>
          <p className="text-sm text-muted-foreground">Añade música, logos, plantillas o stock para reutilizar.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {[...groups.entries()].map(([cat, items]) => (
            <section key={cat}>
              <h2 className="mb-2 text-sm font-semibold">{cat} <span className="text-muted-foreground">· {items.length}</span></h2>
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                {items.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <a href={a.url ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium hover:underline">
                        {a.name} <ExternalLink className="size-3.5 text-muted-foreground" />
                      </a>
                      <p className="truncate text-xs text-muted-foreground">
                        {FILE_KIND_LABEL[a.kind] ?? a.kind}
                        {a.uploadedBy ? ` · ${a.uploadedBy.name}` : ""}
                        {` · ${formatShortDate(a.createdAt)}`}
                      </p>
                    </div>
                    <form action={deleteLibraryAsset.bind(null, a.id)}>
                      <button
                        type="submit"
                        title="Eliminar"
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
