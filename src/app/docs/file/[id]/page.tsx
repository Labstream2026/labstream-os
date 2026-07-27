import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canAccessProject, canWriteProject } from "@/lib/project-access";
import { getOnlyOfficeConfig, isEditableOffice, buildConfig, signConfig, type DocAccess } from "@/lib/onlyoffice";
import { signFileToken } from "@/lib/storage";
import { OnlyOfficeEditor } from "../../[id]/editor";

export const dynamic = "force-dynamic";

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
  // Ciclo de vida: en un proyecto dormido el documento se abre en SOLO LECTURA.
  archivedAt: true,
  finishedAt: true,
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

  // ── Qué puede hacer cada quien con este documento ──
  // Edita quien puede ESCRIBIR en el proyecto. Los invitados del PORTAL DEL CLIENTE (rol
  // `cliente`, miembros del proyecto) con permiso para subir archivos también editan: ya pueden
  // reemplazarlos subiendo otra versión, así que editarlos en vivo es equivalente y más
  // controlado. El resto de clientes COMENTA (puede opinar sin poder romper el documento) y los
  // invitados de solo lectura y el usuario demo solo miran.
  // El candado del ciclo de vida manda sobre todo: en un proyecto dormido (papelera o terminado)
  // nadie escribe — ni siquiera un comentario, que también se guarda dentro del archivo.
  const isClienteMember =
    session.role === "cliente" && file.project.members.some((m) => m.userId === session.id);
  const asleep = Boolean(file.project.archivedAt || file.project.finishedAt);
  const access: DocAccess = asleep || session.role === "demo"
    ? "view"
    : canWriteProject(file.project, session) || (isClienteMember && hasPermission(session, "subir_archivos"))
      ? "edit"
      : isClienteMember
        ? "comment"
        : "view";
  const fileUrl = `${cfg.callbackBase}/api/files-asset/${id}?t=${signFileToken(id)}`;
  const callbackUrl = `${cfg.callbackBase}/api/docs/file/${id}/callback`;
  const config = await signConfig(
    buildConfig({
      attachmentId: id,
      name: file.name,
      version: file.version,
      fileUrl,
      callbackUrl,
      access,
      user: { id: session.id, name: session.name },
      backUrl: backHref,
    }),
  );

  return <OnlyOfficeEditor docsUrl={cfg.docsUrl} config={config} title={file.name} backHref={backHref} downloadHref={`/api/files-asset/${id}?download=1`} />;
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
