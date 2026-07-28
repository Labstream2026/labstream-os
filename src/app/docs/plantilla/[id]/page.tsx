import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { getOnlyOfficeConfig, buildConfig, signConfig, type DocAccess } from "@/lib/onlyoffice";
import { signFileToken } from "@/lib/storage";
import { OnlyOfficeEditor } from "../../[id]/editor";

export const dynamic = "force-dynamic";

// Editar la PLANTILLA en su sitio: se mantiene el molde de la empresa sin bajarlo, cambiarlo y
// volver a subirlo. Los documentos ya creados no se tocan (nacieron con una copia).
export default async function DocTemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const t = await db.docTemplate.findUnique({
    where: { id },
    select: { name: true, ext: true, path: true, size: true, archivedAt: true },
  });
  if (!t) notFound();

  const backHref = "/plantillas/documentos";
  // La mantiene el equipo con permiso para subir archivos; el resto la mira.
  const puedeEditar =
    session.role !== "cliente" && session.role !== "demo" && !t.archivedAt && hasPermission(session, "subir_archivos");
  if (session.role === "cliente") {
    return <Notice title="Sin acceso" msg="Las plantillas son del equipo." backHref="/inicio" />;
  }

  const cfg = await getOnlyOfficeConfig();
  if (!cfg.enabled) {
    return <Notice title="Edición no disponible" msg="OnlyOffice no está conectado todavía. Configúralo en Configuración → Integraciones." backHref={backHref} />;
  }

  const nombre = `${t.name}.${t.ext}`;
  const access: DocAccess = puedeEditar ? "edit" : "view";
  const config = await signConfig(
    buildConfig({
      // La «versión» es el tamaño: cambia cuando cambia el archivo, así que el editor no
      // reabre una copia vieja de su caché tras guardar.
      attachmentId: `tpl-${id}`,
      name: nombre,
      version: t.size,
      fileUrl: `${cfg.callbackBase}/api/doc-templates/${id}?t=${signFileToken(id)}`,
      callbackUrl: `${cfg.callbackBase}/api/docs/plantilla/${id}/callback`,
      access,
      user: { id: session.id, name: session.name },
      backUrl: backHref,
    }),
  );

  return (
    <OnlyOfficeEditor
      docsUrl={cfg.docsUrl}
      config={config}
      title={`Plantilla · ${t.name}`}
      backHref={backHref}
      downloadHref={`/api/doc-templates/${id}?download=1`}
    />
  );
}

function Notice({ title, msg, backHref }: { title: string; msg: string; backHref: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{msg}</p>
      <Link href={backHref} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Volver
      </Link>
    </div>
  );
}
