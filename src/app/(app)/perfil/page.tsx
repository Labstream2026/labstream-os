import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { getSession } from "@/lib/auth";
import { getUserPreference } from "@/lib/user-preference";
import { getAllUserNotifPrefs } from "@/lib/user-notif-prefs";
import { ProfileForm } from "./profile-form";
import { PreferencesForm } from "./preferences-form";
import { NotificationPrefsForm } from "./notification-prefs-form";
import { SilenceSettings, type MutedTarget } from "./silence-settings";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const session = await getSession();
  const isCliente = session?.role === "cliente";
  const [prefs, notifPrefs, meSilence, muteRows, team] = await Promise.all([
    getUserPreference(me.id),
    getAllUserNotifPrefs(me.id),
    db.user.findUnique({ where: { id: me.id }, select: { quietStart: true, quietEnd: true } }),
    db.notificationMute.findMany({ where: { userId: me.id }, select: { kind: true, targetId: true } }),
    // Equipo (para silenciar personas): internos, sin bots ni cliente/demo.
    db.user.findMany({
      where: { active: true, isSystemBot: false, id: { not: me.id }, role: { key: { notIn: ["cliente", "demo"] } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Nombres de las personas/proyectos silenciados.
  const mutedUserIds = muteRows.filter((m) => m.kind === "user").map((m) => m.targetId);
  const mutedProjectIds = muteRows.filter((m) => m.kind === "project").map((m) => m.targetId);
  const [mutedUsers, mutedProjects] = await Promise.all([
    mutedUserIds.length ? db.user.findMany({ where: { id: { in: mutedUserIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    mutedProjectIds.length ? db.project.findMany({ where: { id: { in: mutedProjectIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const mutes: MutedTarget[] = muteRows.map((m) => ({
    kind: m.kind as "user" | "project",
    targetId: m.targetId,
    name:
      m.kind === "user"
        ? mutedUsers.find((u) => u.id === m.targetId)?.name ?? "Alguien"
        : mutedProjects.find((p) => p.id === m.targetId)?.name ?? "Proyecto",
  }));

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
      {!isCliente ? (
        <SilenceSettings quietStart={meSilence?.quietStart ?? null} quietEnd={meSilence?.quietEnd ?? null} mutes={mutes} team={team} />
      ) : null}
    </div>
  );
}
