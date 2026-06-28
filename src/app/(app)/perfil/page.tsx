import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getUserPreference } from "@/lib/user-preference";
import { ProfileForm } from "./profile-form";
import { PreferencesForm } from "./preferences-form";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const prefs = await getUserPreference(me.id);

  return (
    <div className="px-6 py-8 lg:px-10">
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
      <PreferencesForm reduceMotion={prefs.reduceMotion} startPage={prefs.startPage} />
    </div>
  );
}
