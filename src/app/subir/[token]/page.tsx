import { db } from "@/lib/db";
import { parseUploadToken } from "@/lib/upload-token";
import { PublicLinkInvalid } from "@/components/public-link-invalid";
import { Logo } from "@/components/brand/logo";
import { UploadClient } from "./upload-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}

export default async function UploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = parseUploadToken(token);
  if (!parsed) return <PublicLinkInvalid />;
  const { projectId, nonce } = parsed;

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { name: true, emoji: true, uploadNonce: true, uploadRevokedAt: true, uploadExpiresAt: true, archivedAt: true, finishedAt: true, client: { select: { name: true } } },
  });
  // Papelera O terminado: un proyecto que ya no está activo no recibe más material del cliente.
  if (!project || project.archivedAt || project.finishedAt) return <PublicLinkInvalid />;

  const expired = project.uploadExpiresAt ? project.uploadExpiresAt.getTime() < Date.now() : false;
  // El nonce del token debe coincidir con el vigente del proyecto (revocar lo rota → URL filtrada muere).
  const badNonce = !project.uploadNonce || project.uploadNonce !== nonce;
  if (project.uploadRevokedAt || badNonce || expired) {
    return (
      <Shell>
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <Logo className="mx-auto h-7" />
          <h1 className="mt-4 text-xl font-bold">Enlace no disponible</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {expired ? "Este enlace para subir material ha caducado." : "Este enlace para subir material fue desactivado por el equipo."} Pídele uno nuevo a tu productor.
          </p>
        </div>
      </Shell>
    );
  }

  // Cuenta la visita (no bloquea el render si falla).
  await db.project.update({ where: { id: projectId }, data: { uploadVisits: { increment: 1 } } }).catch(() => {});

  return (
    <Shell>
      <UploadClient token={token} projectName={project.name} projectEmoji={project.emoji} clientName={project.client?.name ?? null} />
    </Shell>
  );
}
