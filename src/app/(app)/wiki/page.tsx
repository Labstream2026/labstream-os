import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { createWikiPage } from "./actions";

export const dynamic = "force-dynamic";

export default async function WikiPage() {
  const pages = await db.wikiPage.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { tables: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Wiki del equipo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Documentación y bases de conocimiento. Cada página admite texto y tablas tipo Notion.
          </p>
        </div>
        <form action={createWikiPage}>
          <button className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> Nueva página
          </button>
        </form>
      </div>

      <div className="mt-8 space-y-2">
        {pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay páginas. Crea la primera.</p>
        ) : (
          pages.map((p) => (
            <Link
              key={p.id}
              href={`/wiki/${p.id}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-lg">
                {p.icon ?? <FileText className="size-4 text-muted-foreground" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  {p._count.tables} tabla{p._count.tables === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
