import { redirect } from "next/navigation";
import { HardDrive } from "lucide-react";
import { getSession } from "@/lib/auth";
import { opsEnabled, opsReady } from "@/lib/nas-ops";
import { galeriaEnabled } from "@/lib/nas-galeria";
import { onlyofficeReady } from "@/lib/onlyoffice";
import { DiscoTabs } from "@/components/discos/disco-tabs";
import { OpsExplorer } from "./ops-explorer";

export const dynamic = "force-dynamic";

// Explorador de Operaciones_LAB: el disco del volumen 5 del NAS, montado dentro del
// contenedor. Solo equipo (los clientes no ven rutas internas); el rol demo mira sin tocar.
export default async function OperacionesPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "cliente") redirect("/inicio");

  const { path } = await searchParams;

  if (!opsEnabled() || !(await opsReady())) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
        {/* Con las pestañas a la vista, un disco caído no te deja atrapado: saltas al otro. */}
        <DiscoTabs activo="operaciones" hayOps={opsEnabled()} hayGaleria={galeriaEnabled()} />
        <div className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
          <HardDrive className="size-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Operaciones_LAB no está conectado</h1>
          <p className="text-sm text-muted-foreground">
            {opsEnabled()
              ? "La variable NAS_OPS_DIR está definida pero la carpeta no responde: revisa que el bind mount del docker-compose apunte a /volume5/Operaciones_LAB y que el contenedor se haya recreado (up -d --force-recreate app)."
              : "Falta montar la carpeta del NAS en el contenedor: añade el bind mount /volume5/Operaciones_LAB → /nas/operaciones y la variable NAS_OPS_DIR en docker-compose.yml, y recrea el contenedor."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
      <DiscoTabs activo="operaciones" hayOps hayGaleria={galeriaEnabled()} />
      <OpsExplorer
        initialPath={path || ""}
        canWrite={session.role !== "demo"}
        ooReady={await onlyofficeReady()}
      />
    </div>
  );
}
