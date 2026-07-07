import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getSession } from "@/lib/auth";
import { getUserPreference } from "@/lib/user-preference";
import { getAllUserNotifPrefs } from "@/lib/user-notif-prefs";
import { ProfileForm } from "./profile-form";
import { PreferencesForm } from "./preferences-form";
import { NotificationPrefsForm } from "./notification-prefs-form";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const session = await getSession();
  const isCliente = session?.role === "cliente";
  const [prefs, notifPrefs] = await Promise.all([getUserPreference(me.id), getAllUserNotifPrefs(me.id)]);

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
        isCliente={isCliente}
      />
      <PreferencesForm reduceMotion={prefs.reduceMotion} startPage={prefs.startPage} density={prefs.density} />
      <NotificationPrefsForm prefs={notifPrefs} />
    </div>
  );
}
