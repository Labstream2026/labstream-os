import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canSeeWiki } from "@/lib/wiki-access";

// La Wiki (y todas sus secciones) es solo para el equipo interno. Los invitados
// (freelancer/cliente o usuarios marcados como invitado) no pueden entrar.
export default async function WikiLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!(await canSeeWiki(session))) redirect("/");
  return <>{children}</>;
}
