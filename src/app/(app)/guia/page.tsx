import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { GUIA, GUIA_TOTAL } from "@/lib/demo-guia";
import { leerEstadoDemo } from "@/lib/demo-mode";
import { Sparkles, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

// ── GUÍA DE LA APP ──
// Qué es y para qué sirve cada sección, en una sola página. Pensada para enseñar la
// herramienta (a alguien nuevo del equipo o a un cliente) y para acompañar al modo demo:
// cuando la muestra está encendida, cada tarjeta dice además qué mirar.
// No documenta facturación ni propuestas a propósito.
export default async function GuiaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const esCliente = session.role === "cliente";
  const demo = await leerEstadoDemo();

  // Al cliente solo se le enseña su portal; al equipo, todo menos las tarjetas del portal.
  const bloques = GUIA.map((b) => ({ ...b, funciones: b.funciones.filter((f) => (esCliente ? f.portal : !f.portal)) })).filter(
    (b) => b.funciones.length > 0,
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="border-b border-border pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Guía de la app</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {esCliente
            ? "Qué puedes hacer en tu portal y para qué sirve cada parte."
            : `Qué es cada sección de Labstream y para qué sirve en el día a día. ${GUIA_TOTAL} funciones explicadas.`}
        </p>

        {!esCliente ? (
          demo.activo ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-3.5 py-2.5">
              <Sparkles className="size-4 shrink-0 text-primary" />
              <span className="text-sm">
                El <strong>modo demo</strong> está encendido: hay un cliente y un proyecto de muestra para probar todo esto.
              </span>
              {demo.proyectoId ? (
                <Link href={`/proyectos/${demo.proyectoId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  Ver el proyecto <ArrowRight className="size-3.5" />
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
              <Sparkles className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Puedes llenar la app con datos de muestra para probar sin tocar el trabajo real.
              </span>
              <Link href="/ajustes?s=demo" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                Encender el modo demo <ArrowRight className="size-3.5" />
              </Link>
            </div>
          )
        ) : null}
      </header>

      <div className="mt-8 space-y-10">
        {bloques.map((b) => (
          <section key={b.titulo}>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{b.titulo}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{b.descripcion}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {b.funciones.map((f) => (
                <article key={`${b.titulo}-${f.nombre}`} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold">
                    <span aria-hidden className="text-base">{f.emoji}</span>
                    {f.nombre}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.que}</p>
                  <p className="mt-2 text-sm">{f.para}</p>

                  {demo.activo && !esCliente ? (
                    <p className="mt-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[12.5px] text-muted-foreground">
                      <span className="font-semibold text-foreground">Pruébalo: </span>
                      {f.probar}
                    </p>
                  ) : null}

                  <Link
                    href={f.ruta}
                    className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
                  >
                    Abrir {f.nombre} <ArrowRight className="size-3.5" />
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-10 border-t border-border pt-5 text-xs text-muted-foreground">
        ¿Falta algo o hay una función que no se entiende? Dilo en el chat del equipo y la ampliamos.
      </p>
    </div>
  );
}
