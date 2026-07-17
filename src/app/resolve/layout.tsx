import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// Panel de correcciones para DaVinci Resolve. Vive FUERA del grupo (app) a propósito:
// no lleva sidebar ni chrome — es una vista compacta (~420px) pensada para la ventana
// del plugin de Workflow Integration (o cualquier navegador angosto). La protege el
// proxy (no está en PUBLIC_PREFIXES → sin sesión redirige a /login) y este layout
// re-verifica con permisos vivos de BD, igual que el layout de (app).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Correcciones · Labstream OS" };
export const viewport: Viewport = { themeColor: "#0b0b0e" };

export default async function ResolveLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/resolve");
  // El panel es una herramienta del EQUIPO: los usuarios invitados de clientes tienen su
  // propio portal de revisión (/review) y no deben ver la estructura interna de proyectos.
  if (session.role === "cliente") {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-center text-sm text-zinc-300">
        <p>
          Este panel es para el equipo de edición.
          <br />
          Tu espacio de revisión es el enlace que te compartió el equipo.
        </p>
      </div>
    );
  }
  // El wrapper .dark fuerza el tema oscuro SOLO en esta ruta (los tokens .dark de
  // globals.css cascadean a los descendientes): el panel convive con la UI de Resolve.
  return <div className="dark min-h-screen bg-zinc-950 text-zinc-100 antialiased">{children}</div>;
}
