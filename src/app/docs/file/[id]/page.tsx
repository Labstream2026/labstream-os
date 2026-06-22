import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject, canWriteProject } from "@/lib/project-access";
import { getOnlyOfficeConfig, isEditableOffice, buildConfig, signConfig } from "@/lib/onlyoffice";
import { signFileToken } from "@/lib/storage";
import { OnlyOfficeEditor } from "../../[id]/editor";

export const dynamic = "force-dynamic";

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
} as const;

export default async function ProjectFileEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const file = await db.fileAsset.findUnique({
    where: { id },
    select: { name: true, version: true, path: true, projectId: true, project: { select: accessSelect } },
  });
  if (!file) notFound();

  const backHref = `/proyectos/${file.projectId}?tab=archivos`;
  if (!canAccessProject(file.project, session)) {
    return <Notice title="Sin acceso" msg="No tienes acceso a este documento." backHref="/" />;
  }
  if (!file.path) {
    return <Notice title="No editable" msg="Este archivo no es local (es un enlace)." backHref={backHref} />;
  }
  const cfg = await getOnlyOfficeConfig();
  if (!cfg.enabled) {
    return <Notice title="Edición no disponible" msg="OnlyOffice no está conectado todavía. Configúralo en Configuración → Integraciones." backHref={backHref} download={id} />;
  }
  if (!isEditableOffice(file.name)) {
    return <Notice title="No editable" msg="Este tipo de archivo no se edita en OnlyOffice." backHref={backHref} download={id} />;
  }

  // Solo abre en modo edición quien puede ESCRIBIR en el proyecto; los de solo lectura
  // (miembro GUEST, o quien ve un proyecto público sin ser miembro) lo abren en modo vista.
  const canEdit = canWriteProject(file.project, session);
  const fileUrl = `${cfg.callbackBase}/api/files-asset/${id}?t=${signFileToken(id)}`;
  const callbackUrl = `${cfg.callbackBase}/api/docs/file/${id}/callback`;
  const config = await signConfig(
    buildConfig({
      attachmentId: id,
      name: file.name,
      version: file.version,
      fileUrl,
      callbackUrl,
      canEdit,
      user: { id: session.id, name: session.name },
    }),
  );

  return <OnlyOfficeEditor docsUrl={cfg.docsUrl} config={config} title={file.name} backHref={backHref} />;
}

function Notice({ title, msg, backHref, download }: { title: string; msg: string; backHref: string; download?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{msg}</p>
      <div className="flex gap-3">
        {download ? (
          <a href={`/api/files-asset/${download}?download=1`} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
            Descargar archivo
          </a>
        ) : null}
        <Link href={backHref} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Volver
        </Link>
      </div>
    </div>
  );
}
