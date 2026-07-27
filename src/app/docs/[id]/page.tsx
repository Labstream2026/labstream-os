import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessChannel } from "@/lib/chat-access";
import { canWriteProject } from "@/lib/project-access";
import { getOnlyOfficeConfig, isEditableOffice, buildConfig, signConfig, type DocAccess } from "@/lib/onlyoffice";
import { signFileToken } from "@/lib/storage";
import { OnlyOfficeEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function DocEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const att = await db.messageAttachment.findUnique({
    where: { id },
    include: {
      message: {
        include: {
          // El proyecto se trae ENTERO (privacidad, miembros, ciclo de vida) porque de él sale
          // el permiso de ESCRITURA sobre el documento, no solo el de entrar al canal.
          channel: {
            include: {
              members: true,
              project: { select: { leadId: true, isPrivate: true, archivedAt: true, finishedAt: true, members: { select: { userId: true, role: true } } } },
            },
          },
        },
      },
    },
  });
  if (!att) notFound();

  const ch = att.message.channel;
  const inChannel = canAccessChannel(
    { isPublic: ch.isPublic, project: ch.project, members: ch.members },
    session,
  );
  const backHref = ch.projectId ? `/proyectos/${ch.projectId}?tab=chat` : "/";

  if (!inChannel) {
    return <Notice title="Sin acceso" msg="No tienes acceso a este documento." backHref="/" />;
  }
  const cfg = await getOnlyOfficeConfig();
  if (!cfg.enabled) {
    return <Notice title="Edición no disponible" msg="OnlyOffice no está conectado todavía. Configúralo en Configuración → Integraciones." backHref={backHref} download={id} />;
  }
  if (!isEditableOffice(att.name)) {
    return <Notice title="No editable" msg="Este tipo de archivo no se edita en OnlyOffice." backHref={backHref} download={id} />;
  }

  // ── Quién puede ESCRIBIR en el documento (no solo entrar al canal) ──
  // Antes esto era `canEdit: true` para cualquiera que alcanzara el canal: un invitado de solo
  // lectura (miembro GUEST del proyecto) podía reescribir el documento del equipo. Ahora manda
  // el permiso del PROYECTO; los canales sin proyecto (grupos, directos) los edita su gente.
  const docAccess: DocAccess =
    session.role === "demo"
      ? "view"
      : ch.project
        ? canWriteProject(ch.project, session)
          ? "edit"
          : "comment" // invitado del proyecto: puede comentar, no reescribir
        : "edit";

  const fileUrl = `${cfg.callbackBase}/api/files/${id}?t=${signFileToken(id)}`;
  const callbackUrl = `${cfg.callbackBase}/api/docs/${id}/callback`;
  const config = await signConfig(
    buildConfig({
      attachmentId: id,
      name: att.name,
      version: att.version,
      fileUrl,
      callbackUrl,
      access: docAccess,
      user: { id: session.id, name: session.name },
      backUrl: backHref,
    }),
  );

  return <OnlyOfficeEditor docsUrl={cfg.docsUrl} config={config} title={att.name} backHref={backHref} downloadHref={`/api/files/${id}?download=1`} />;
}

function Notice({
  title,
  msg,
  backHref,
  download,
}: {
  title: string;
  msg: string;
  backHref: string;
  download?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{msg}</p>
      <div className="flex gap-3">
        {download ? (
          <a href={`/api/files/${download}?download=1`} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
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
