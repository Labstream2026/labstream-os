import { redirect } from "next/navigation";
import { Images } from "lucide-react";
import { getSession, hasPermission } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";
import { db } from "@/lib/db";
import { galeriaEnabled, galeriaReady, galeriaWritable, listGaleriaFolders, normalizeGaleriaRel } from "@/lib/nas-galeria";
import { GaleriaCliente } from "./galeria-cliente";
import { GaleriaHerramientas, type VinculoChip } from "./herramientas";

export const dynamic = "force-dynamic";

// Galería de entregas: el material que vive en LabTem (el segundo NAS). El visor (línea de
// tiempo) es GaleriaCliente; encima va la barra de herramientas: subcarpetas, crear, subir y
// el vínculo carpeta ↔ cliente/proyecto. Solo equipo; el cliente entra por /galeria/[token].
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

  // Ruta actual saneada (si viene rota, se cae a la raíz en vez de reventar la página).
  let relNorm = "";
  try {
    relNorm = normalizeGaleriaRel(rel || "");
  } catch {
    relNorm = "";
  }

  // Subcarpetas del nivel actual (la línea de tiempo las aplana; la barra las devuelve a la
  // vista) + vínculos de ESTA carpeta + catálogos para el selector de vincular.
  const puedeEscribir = session.role !== "demo" && hasPermission(session, "escribir_discos");
  const [subcarpetas, escrituraLista, clienteVinculado, proyectoVinculado, clientes, proyectos] = await Promise.all([
    listGaleriaFolders(relNorm).catch(() => []),
    galeriaWritable(),
    relNorm ? db.client.findFirst({ where: { galeriaFolder: relNorm }, select: { id: true, name: true, accentColor: true } }) : null,
    relNorm ? db.project.findFirst({ where: { galeriaFolder: relNorm }, select: { id: true, name: true } }) : null,
    // Solo lo que esta persona puede VER: sin el filtro, el selector le enumeraba los
    // clientes y proyectos privados ajenos a cualquiera con permiso de escribir.
    puedeEscribir
      ? db.client.findMany({ where: { AND: [accessibleClientWhere(session), { archivedAt: null }] }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [],
    puedeEscribir
      ? db.project
          .findMany({
            where: { archivedAt: null, finishedAt: null },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              isPrivate: true,
              leadId: true,
              members: { select: { userId: true, role: true } },
              client: { select: { name: true } },
            },
          })
          .then((ps) => ps.filter((p) => canAccessProject(p, session)))
      : [],
  ]);

  const vinculos: VinculoChip[] = [
    ...(clienteVinculado ? [{ tipo: "cliente" as const, id: clienteVinculado.id, nombre: clienteVinculado.name, color: clienteVinculado.accentColor }] : []),
    ...(proyectoVinculado ? [{ tipo: "proyecto" as const, id: proyectoVinculado.id, nombre: proyectoVinculado.name }] : []),
  ];

  // ¿De qué CLIENTE es cada subcarpeta? Su chip se tiñe con el color del cliente (mismo tono
  // que su cabecera y sus proyectos): en la raíz, la galería queda organizada a simple vista.
  const relsNivel = subcarpetas.map((f) => f.rel);
  const duenos = relsNivel.length
    ? await db.client.findMany({
        where: { galeriaFolder: { in: relsNivel } },
        select: { name: true, accentColor: true, galeriaFolder: true },
      })
    : [];
  const duenoPorRel = new Map(duenos.map((c) => [c.galeriaFolder as string, { nombre: c.name, color: c.accentColor }]));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
      <GaleriaHerramientas
        rel={relNorm}
        subcarpetas={subcarpetas.map((f) => ({ rel: f.rel, name: f.name, dueno: duenoPorRel.get(f.rel) ?? null }))}
        vinculos={vinculos}
        clientes={clientes.map((c) => ({ id: c.id, nombre: c.name }))}
        proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.client ? `${p.name} · ${p.client.name}` : p.name }))}
        puedeEscribir={puedeEscribir}
        escrituraLista={escrituraLista}
      />
      {/* `rel` viene del servidor y es LA fuente de verdad: el visor navega con router.push
          y las dos mitades (barra y cuadrícula) siempre ven la misma carpeta. */}
      <GaleriaCliente rel={relNorm} puedeEscribir={puedeEscribir && escrituraLista} duenos={Object.fromEntries(duenoPorRel)} />
    </div>
  );
}
