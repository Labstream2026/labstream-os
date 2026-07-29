import { loadWikiNav } from "@/lib/wiki-nav";
import { WikiSidebar } from "@/components/wiki/wiki-sidebar";

// El marco del espacio de la Wiki: árbol lateral a la izquierda, contenido a la derecha.
//
// Vive aquí porque lo montan TRES rutas distintas: /wiki, /plantillas y /biblioteca. Cuando
// cada layout repetía este JSX, añadir un dato al árbol obligaba a acordarse de los tres —y
// olvidarse de uno dejó a /plantillas sin ninguna salida en escritorio. Con un solo sitio,
// eso no puede volver a pasar.
//
// El árbol se esconde en móvil (allí manda el índice y la barra inferior de la app): 224 px
// de barra en una pantalla de teléfono no dejarían leer nada.
export async function WikiShell({ children }: { children: React.ReactNode }) {
  const nav = await loadWikiNav();

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-0 h-[calc(100dvh-var(--pwa-nav-h,0px)-3.5rem)]">
          <WikiSidebar
            grupos={nav.grupos}
            todas={nav.todas}
            canSeePasswords={nav.canSeePasswords}
            canBiblioteca={nav.canBiblioteca}
            alertInventario={nav.alertInventario}
            alertMaterial={nav.alertMaterial}
            alertSalud={nav.alertSalud}
            alertBiblioteca={nav.alertBiblioteca}
          />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
