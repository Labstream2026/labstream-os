import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { construirRastreo } from "@/lib/rastreo/datos";
import { RastreoShell } from "./rastreo-shell";

export const dynamic = "force-dynamic";

// ── Panel de RASTREO de trabajo ──
// Vive aparte de Reportes a propósito: lo que hay aquí es dato personal del equipo (horas
// efectivas, apps, a qué hora entró y salió cada quien) y se abre con su propia llave, el
// permiso `ver_rastreo`, que NINGÚN rol trae de fábrica. Quien no la tenga —aunque sea
// gerente o vea todos los reportes— cae al inicio y nunca sabe que esto existe.
//
// Hay un segundo camino de entrada: que le hayan COMPARTIDO a alguien el rastreo de una
// persona concreta. Entonces ve el panel con esa sola ficha. Todo eso lo resuelve
// construirRastreo, que devuelve null cuando no hay nada que enseñar.
export default async function RastreoPage({ searchParams }: { searchParams: Promise<{ p?: string; m?: string }> }) {
  const session = await getSession();
  const sp = await searchParams;
  const datos = await construirRastreo(session, sp);
  if (!datos) redirect("/");

  return (
    // max-w-7xl, el mismo que Reportes: son la pareja de tableros del estudio, comparten hasta
    // el relleno apretado, y saltar de uno al otro movía el contenido 128 px de ancho.
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-7">
      <RastreoShell datos={datos} />
    </div>
  );
}
