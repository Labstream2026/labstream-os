import { redirect } from "next/navigation";
import { Images } from "lucide-react";
import { getSession } from "@/lib/auth";
import { galeriaEnabled, galeriaReady } from "@/lib/nas-galeria";
import { GaleriaCliente } from "./galeria-cliente";

export const dynamic = "force-dynamic";

// Galería de entregas: el material que vive en LabTem (el segundo NAS), montado en solo
// lectura dentro del contenedor. Solo equipo; el cliente tendrá su propia sala con enlace
// firmado, que no pasa por aquí.
export default async function GaleriaPage({ searchParams }: { searchParams: Promise<{ rel?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "cliente") redirect("/inicio");

  const { rel } = await searchParams;

  if (!galeriaEnabled() || !(await galeriaReady())) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
        <Images className="size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">La galería de entregas no está conectada</h1>
        <p className="text-sm text-muted-foreground">
          {galeriaEnabled()
            ? "La variable NAS_GALERIA_DIR está definida pero la carpeta no responde. Suele pasar tras reiniciar el NAS: el montaje NFS de LabTem se cae y hay que volver a montarlo."
            : "Falta montar la carpeta de LabTem en el contenedor: añade el bind mount /volume1/entregas-labtem → /entregas y la variable NAS_GALERIA_DIR en el docker-compose, y recrea el contenedor."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
      <GaleriaCliente relInicial={rel || ""} />
    </div>
  );
}
