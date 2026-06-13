import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessChannel } from "@/lib/chat-access";
import { onlyofficeEnabled, isEditableOffice, buildConfig, signConfig, DOCS_URL } from "@/lib/onlyoffice";
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
          channel: { include: { members: true, project: { select: { leadId: true } } } },
        },
      },
    },
  });
  if (!att) notFound();

  const ch = att.message.channel;
  const access = canAccessChannel(
    { isPublic: ch.isPublic, project: ch.project, members: ch.members },
    session,
  );
  const backHref = ch.projectId ? `/proyectos/${ch.projectId}?tab=chat` : "/";

  if (!access) {
    return <Notice title="Sin acceso" msg="No tienes acceso a este documento." backHref="/" />;
  }
  if (!onlyofficeEnabled) {
    return <Notice title="Edición no disponible" msg="OnlyOffice no está configurado todavía." backHref={backHref} download={id} />;
  }
  if (!isEditableOffice(att.name)) {
    return <Notice title="No editable" msg="Este tipo de archivo no se edita en OnlyOffice." backHref={backHref} download={id} />;
  }

  const base = process.env.NEXTAUTH_URL || "http://localhost:3200";
  const fileUrl = `${base}/api/files/${id}?t=${signFileToken(id)}`;
  const callbackUrl = `${base}/api/docs/${id}/callback`;
  const config = await signConfig(
    buildConfig({
      attachmentId: id,
      name: att.name,
      version: att.version,
      fileUrl,
      callbackUrl,
      canEdit: true,
      user: { id: session.id, name: session.name },
    }),
  );

  return <OnlyOfficeEditor docsUrl={DOCS_URL} config={config} title={att.name} backHref={backHref} />;
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
