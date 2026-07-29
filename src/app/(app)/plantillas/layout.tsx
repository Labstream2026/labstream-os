import { getSession } from "@/lib/auth";
import { canSeeWiki } from "@/lib/wiki-access";
import { WikiShell } from "@/components/wiki/wiki-shell";

// Las Plantillas pertenecen al espacio de la Wiki (se llega a ellas desde ahí) pero viven
// en su propia ruta, fuera de (app)/wiki. Sin este layout se quedaban SIN NINGUNA salida en
// escritorio: no recibían el árbol lateral y las pestañas solo se pintan en móvil.
//
// A diferencia del layout de /wiki, aquí NO se redirige a quien no puede ver la Wiki: las
// plantillas tienen su propio control de acceso y no es asunto de la barra cambiarlo. Lo
// que sí se hace es no enseñarle el árbol (son títulos de páginas que no le tocan).
export default async function PlantillasLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!(await canSeeWiki(session))) return <>{children}</>;

  return <WikiShell>{children}</WikiShell>;
}
