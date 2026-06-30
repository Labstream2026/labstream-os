import Link from "next/link";
import { db } from "@/lib/db";
import { verifyClientInviteToken } from "@/lib/client-invite-token";
import { Logo } from "@/components/brand/logo";
import { SetPasswordForm } from "./set-password-form";
import { CheckCircle2, Unlink } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = verifyClientInviteToken(token);
  const user = userId
    ? await db.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, passwordHash: true, active: true, role: { select: { key: true } } },
      })
    : null;

  const invalid = !user || user.role?.key !== "cliente" || !user.active;
  const alreadyActive = !invalid && !!user!.passwordHash;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo className="h-7" /></div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {invalid ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Unlink className="size-7 text-muted-foreground" />
              <h1 className="text-lg font-semibold">Enlace no válido</h1>
              <p className="text-sm text-muted-foreground">Esta invitación no es válida o ya caducó. Pídele al equipo de Labstream que te envíe una nueva.</p>
              <Link href="/login" className="mt-1 text-sm font-medium text-primary hover:underline">Ir a iniciar sesión</Link>
            </div>
          ) : alreadyActive ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="size-7 text-emerald-600" />
              <h1 className="text-lg font-semibold">Tu cuenta ya está activa</h1>
              <p className="text-sm text-muted-foreground">Inicia sesión con tu correo y contraseña para entrar a tu portal.</p>
              <Link href="/login" className="mt-1 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Iniciar sesión</Link>
            </div>
          ) : (
            <>
              <h1 className="mb-1 text-lg font-semibold">Bienvenido a tu portal</h1>
              <SetPasswordForm token={token} name={user!.name} email={user!.email} />
            </>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">Portal de clientes · Labstream Studio</p>
      </div>
    </div>
  );
}
