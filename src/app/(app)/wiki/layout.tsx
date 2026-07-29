import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canSeeWiki } from "@/lib/wiki-access";
import { loadWikiNav } from "@/lib/wiki-nav";
import { WikiSidebar } from "@/components/wiki/wiki-sidebar";

// La Wiki (y todas sus secciones) es solo para el equipo interno. Los invitados
// (freelancer/cliente o usuarios marcados como invitado) no pueden entrar.
export default async function WikiLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!(await canSeeWiki(session))) redirect("/");

  // Árbol de navegación: acompaña a TODAS las pantallas de la Wiki, para que una página
  // deje de ser una isla desde la que solo se puede volver al índice.
  const nav = await loadWikiNav();

  return (
    // El árbol se esconde en móvil (allí manda el índice y la barra inferior de la app):
    // 224 px de barra en una pantalla de teléfono no dejarían leer nada.
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-0 h-[calc(100dvh-var(--pwa-nav-h,0px)-3.5rem)]">
          <WikiSidebar grupos={nav.grupos} todas={nav.todas} canSeePasswords={nav.canSeePasswords} alertInventario={nav.alertInventario} alertMaterial={nav.alertMaterial} alertSalud={nav.alertSalud} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
