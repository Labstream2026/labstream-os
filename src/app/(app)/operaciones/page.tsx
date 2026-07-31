import { redirect } from "next/navigation";
import { HardDrive } from "lucide-react";
import { getSession, hasPermission } from "@/lib/auth";
import { leerPreferenciasUI } from "@/app/(app)/prefs-actions";
import { db } from "@/lib/db";
import { opsEnabled, opsReady, opsDiskUsage } from "@/lib/nas-ops";
import { galeriaEnabled } from "@/lib/nas-galeria";
import { onlyofficeReady } from "@/lib/onlyoffice";
import { daysSince, diskNeedsCheck, DISK_KIND_LABEL } from "@/lib/material-health";
import { DiscoTabs } from "@/components/discos/disco-tabs";
import { CabeceraDisco } from "@/components/discos/cabecera-disco";
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

  // La cabecera del disco: los datos de su registro en la Biblioteca + la ocupación EN VIVO
  // (statfs del montaje). Si el disco no está dado de alta, la pantalla funciona igual sin
  // cabecera: el explorador no depende de que exista la fila.
  const [disco, uso, ooReady, prefs] = await Promise.all([
    db.storageDisk.findFirst({ where: { mountKey: "OPS" } }).catch(() => null),
    opsDiskUsage(),
    onlyofficeReady(),
    leerPreferenciasUI(),
  ]);
  const now = new Date();
  // Las tres llaves de los discos, cada botón con la suya (el servidor las vuelve a exigir).
  const esDemo = session.role === "demo";
  const canWrite = !esDemo && hasPermission(session, "escribir_discos");
  const canOrganizar = !esDemo && hasPermission(session, "organizar_discos");
  const canBorrar = !esDemo && hasPermission(session, "borrar_discos");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
      <DiscoTabs activo="operaciones" hayOps hayGaleria={galeriaEnabled()} />
      {disco ? (
        <CabeceraDisco
          nombre={disco.name}
          color={disco.color}
          kindLabel={DISK_KIND_LABEL[disco.kind] ?? disco.kind}
          montado
          ubicacion={disco.location}
          lastCheckDays={daysSince(disco.lastCheckAt, now)}
          pideCheck={diskNeedsCheck({
            kind: disco.kind,
            status: disco.status,
            lastCheckDays: daysSince(disco.lastCheckAt, now),
            ageDays: daysSince(disco.createdAt, now),
          })}
          usedGB={uso?.usedGB ?? disco.usedGB}
          totalGB={uso?.totalGB ?? disco.capacityGB}
          enVivo={Boolean(uso)}
        />
      ) : null}
      <OpsExplorer
        initialPath={path || ""}
        canWrite={canWrite}
        canOrganizar={canOrganizar}
        canBorrar={canBorrar}
        vistaInicial={prefs["discos.vista"] as "lista" | "cuadricula" | undefined}
        ooReady={ooReady}
      />
    </div>
  );
}
