import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { ProfileForm } from "./profile-form";
import { CalendarConnect } from "./calendar-connect";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const conn = await db.calendarConnection.findUnique({
    where: { userId: me.id },
    select: { serverUrl: true, username: true, calendarUrl: true, calendarName: true, lastSyncAt: true, lastError: true },
  });

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Mi perfil</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Personaliza cómo te ve el equipo. Se guarda en el servidor del NAS.
      </p>
      <ProfileForm
        name={me.name}
        email={me.email}
        title={me.title}
        initials={me.initials}
        color={me.avatarColor}
        avatarUrl={me.avatarUrl}
        cedula={me.cedula}
        eps={me.eps}
        arl={me.arl}
        birthDate={me.birthDate ? me.birthDate.toISOString() : null}
      />
      <CalendarConnect
        email={me.email}
        connection={conn ? { ...conn, lastSyncAt: conn.lastSyncAt ? conn.lastSyncAt.toISOString() : null } : null}
      />
    </div>
  );
}
