import { getSession } from "@/lib/auth";
import { canSeeWiki } from "@/lib/wiki-access";
import { WikiShell } from "@/components/wiki/wiki-shell";

// La Biblioteca pasó a vivir dentro del espacio de la Wiki: se llega a ella desde sus
// Herramientas y ya no ocupa un icono propio en la barra izquierda de la app.
//
// Como en /plantillas, aquí NO se redirige a quien no pueda ver la Wiki: la Biblioteca tiene
// su propio permiso (`ver_biblioteca`) y la página ya lo comprueba. Lo único que se decide
// aquí es si además se le enseña el árbol de páginas.
export default async function BibliotecaLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!(await canSeeWiki(session))) return <>{children}</>;

  return <WikiShell>{children}</WikiShell>;
}
