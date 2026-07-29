import Link from "next/link";
import { getSaludWiki } from "@/lib/wiki-health";
import { UserAvatar } from "@/components/user-avatar";
import { formatBogotaDate } from "@/lib/bogota-time";
import { Stethoscope, ChevronRight, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

// Panel de salud del conocimiento: qué se está quedando viejo y a quién le toca. Antes,
// una página obsoleta solo se notaba si alguien entraba a mirarla.
export default async function WikiSaludPage() {
  const s = await getSaludWiki();
  const pct = s.total ? Math.round((s.alDia / s.total) * 100) : 0;

  const stats = [
    { k: "Páginas", v: s.total, tono: "" },
    { k: "Al día", v: s.alDia, tono: "text-emerald-600 dark:text-emerald-400", pie: s.total ? `${pct} % del total` : null },
    { k: "Para revisar", v: s.paraRevisar, tono: "text-amber-600 dark:text-amber-400", pie: s.paraRevisar ? "sus dueños ya reciben aviso" : null },
    { k: "Sin dueño", v: s.sinDuenno, tono: "text-amber-600 dark:text-amber-400", pie: s.sinDuenno ? "nadie responde por ellas" : null },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <nav aria-label="Ruta" className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/wiki" className="hover:text-foreground">Wiki</Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground">Salud del conocimiento</span>
      </nav>

      <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Stethoscope className="size-6 text-muted-foreground" /> Salud del conocimiento
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Qué se está quedando viejo y a quién le toca. Los dueños reciben un aviso cuando su página vence.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((st) => (
          <div key={st.k} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{st.k}</p>
            <p className={`mt-0.5 text-2xl font-bold tabular-nums tracking-tight ${st.v > 0 ? st.tono : "text-muted-foreground"}`}>{st.v}</p>
            {st.pie ? <p className="mt-1 text-[11px] text-muted-foreground">{st.pie}</p> : null}
          </div>
        ))}
      </div>

      {/* A quién le toca */}
      {s.porDuenno.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Le toca a cada quien</h2>
          <div className="space-y-2">
            {s.porDuenno.map((d) => (
              <div key={d.id ?? "none"} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <UserAvatar initials={d.initials} name={d.name} color={d.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.vencidas} página{d.vencidas === 1 ? "" : "s"} vencida{d.vencidas === 1 ? "" : "s"}
                    {d.avisadoAt ? ` · avisado el ${formatBogotaDate(d.avisadoAt, { day: "numeric", month: "short" })}` : " · aún sin avisar"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  {d.vencidas}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Sin dueño: nadie responde por ellas, así que nadie recibirá el aviso */}
      {s.huerfanas.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sin dueño · {s.sinDuenno}
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Ponles dueño desde la propia página: mientras no lo tengan, nadie recibirá el aviso de revisión.
          </p>
          <div className="space-y-2">
            {s.huerfanas.map((p) => (
              <Link key={p.id} href={`/wiki/${p.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 transition-colors hover:border-primary/40">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base">
                  {p.icon ?? <FileText className="size-4 text-muted-foreground" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatBogotaDate(p.updatedAt, { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Las que llevan más tiempo sin tocarse */}
      {s.olvidadas.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Las más olvidadas</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Llevan más tiempo sin tocarse. O siguen siendo verdad, o conviene archivarlas.
          </p>
          <div className="space-y-2">
            {s.olvidadas.map((p) => (
              <Link key={p.id} href={`/wiki/${p.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 transition-colors hover:border-primary/40">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base">
                  {p.icon ?? <FileText className="size-4 text-muted-foreground" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatBogotaDate(p.updatedAt, { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
