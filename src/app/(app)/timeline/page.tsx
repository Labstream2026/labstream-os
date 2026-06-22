import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// El Cronograma se unificó dentro de "Calendario" (conmutador Calendario/Cronograma). Esta
// ruta antigua queda como redirección para no romper enlaces/marcadores existentes.
export default async function TimelinePage() {
  redirect("/calendario");
}
