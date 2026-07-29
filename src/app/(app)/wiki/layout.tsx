import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canSeeWiki } from "@/lib/wiki-access";
import { WikiShell } from "@/components/wiki/wiki-shell";

// La Wiki (y todas sus secciones) es solo para el equipo interno. Los invitados
// (freelancer/cliente o usuarios marcados como invitado) no pueden entrar.
export default async function WikiLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!(await canSeeWiki(session))) redirect("/");

  // El árbol acompaña a TODAS las pantallas de la Wiki, para que una página deje de ser una
  // isla desde la que solo se puede volver al índice.
  return <WikiShell>{children}</WikiShell>;
}
