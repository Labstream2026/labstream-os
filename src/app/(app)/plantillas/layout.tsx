import { getSession } from "@/lib/auth";
import { canSeeWiki } from "@/lib/wiki-access";
import { loadWikiNav } from "@/lib/wiki-nav";
import { WikiSidebar } from "@/components/wiki/wiki-sidebar";

// Las Plantillas pertenecen al espacio de la Wiki (se llega a ellas desde ahí) pero viven
// en su propia ruta, fuera de (app)/wiki. Sin este layout se quedaban SIN NINGUNA salida en
// escritorio: no recibían el árbol lateral y las pestañas solo se pintan en móvil.
//
// A diferencia del layout de /wiki, aquí NO se redirige a quien no puede ver la Wiki: las
// plantillas tienen su propio control de acceso y no es asunto de la barra cambiarlo. Lo
// que sí se hace es no enseñarle el árbol (son títulos de páginas que no le tocan).
export default async function PlantillasLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const puedeVerWiki = await canSeeWiki(session);
  if (!puedeVerWiki) return <>{children}</>;

  const nav = await loadWikiNav();

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-0 h-[calc(100dvh-var(--pwa-nav-h,0px)-3.5rem)]">
          <WikiSidebar grupos={nav.grupos} todas={nav.todas} canSeePasswords={nav.canSeePasswords} alertInventario={nav.alertInventario} alertMaterial={nav.alertMaterial} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
