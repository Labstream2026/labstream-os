import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { UserAvatar } from "@/components/user-avatar";
import { isEmailEnabled } from "@/lib/email";
import { caldavEnabled } from "@/lib/caldav";
import { aiEnabled } from "@/lib/ai";
import { getOnlyOfficeConfig } from "@/lib/onlyoffice";
import { UserControls } from "@/app/(app)/configuracion/user-controls";
import { CleanupNamesButton } from "@/app/(app)/configuracion/cleanup-names-button";
import { DemoPanel } from "@/app/(app)/configuracion/demo-panel";
import { RolesManager } from "@/app/(app)/configuracion/roles-manager";
import { UserPermissions } from "@/app/(app)/configuracion/user-permissions";
import { IntegrationsPanel } from "@/app/(app)/configuracion/integrations-panel";
import { CalendarSubscribe } from "@/app/(app)/perfil/calendar-subscribe";
import { ensurePermissionsCatalog, ensureBuiltinRolesFlag, ensureRoleDefaults, ensureWriteGateDefaults, ensureAsistenteDefault, ensureCumplimientoDefault, ensureFinanzasDefault, ensureVentasFinanzas, ensureNotasDefault, ensureClienteDefaults, ensureClienteWriteDefaults, ensureClienteCollabDefaults, PERMISSION_CATALOG, PERMISSION_CATEGORIES } from "@/lib/permissions";
import { LabelsManager } from "@/app/(app)/configuracion/labels-manager";
import { MarcebotSettings } from "@/app/(app)/configuracion/marcebot-settings";
import { NotificationSettingsPanel } from "@/app/(app)/configuracion/notification-settings-panel";
import { ApiKeysPanel } from "@/app/(app)/configuracion/api-keys-panel";
import { AuditLogPanel } from "@/app/(app)/configuracion/audit-log-panel";
import { BrandingPanel } from "@/app/(app)/configuracion/branding-panel";
import { ProjectStatusesPanel } from "@/app/(app)/configuracion/project-statuses-panel";
import { getOrgSettings } from "@/lib/org-settings";
import { projectStatusesFromJson } from "@/lib/project-status";
import { getMarcebotConfig } from "@/lib/marcebot/config";
import { CalendarSyncSettings } from "@/app/(app)/configuracion/calendar-sync-settings";
import { getCalendarSyncConfig } from "@/lib/calendar-sync-config";
import { ProfileForm } from "@/app/(app)/perfil/profile-form";
import { PreferencesForm } from "@/app/(app)/perfil/preferences-form";
import { NotificationPrefsForm } from "@/app/(app)/perfil/notification-prefs-form";
import { SilenceSettings, type MutedTarget } from "@/app/(app)/perfil/silence-settings";
import { CalendarConnect } from "@/app/(app)/perfil/calendar-connect";
import { getUserPreference } from "@/lib/user-preference";
import { getAllUserNotifPrefs } from "@/lib/user-notif-prefs";
import { Mail } from "lucide-react";
import { IconConfiguracion, IconUsuarios, IconEtiquetas, IconRoles, IconNotificaciones, IconAuditoria, IconMarcebot, IconIntegraciones, IconApi, IconMarca, IconFlujo, IconPersonalizacion, IconCalendario } from "@/components/icons";
import { AjustesShell, type AjustesSection } from "./ajustes-shell";

export const dynamic = "force-dynamic";

// ── AJUSTES: la única casa de configuración ──
// Une lo que antes vivía en /perfil (mi cuenta) y /configuracion (equipo y sistema) en una
// sola página con menú agrupado y buscador. Los paneles son LOS MISMOS de siempre — aquí
// solo se reorganizan. /perfil y /configuracion redirigen aquí para no romper enlaces.

export default async function AjustesPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { s } = await searchParams;
  const isAdmin = hasPermission(session, "administrar_usuarios");
  const isCliente = session.role === "cliente";

  // ── MI CUENTA (todos los usuarios) ──
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const [prefs, notifPrefs, meSilence, muteRows, silenceTeam] = await Promise.all([
    getUserPreference(me.id),
    getAllUserNotifPrefs(me.id),
    db.user.findUnique({ where: { id: me.id }, select: { quietStart: true, quietEnd: true } }),
    db.notificationMute.findMany({ where: { userId: me.id }, select: { kind: true, targetId: true } }),
    db.user.findMany({
      where: { active: true, isSystemBot: false, id: { not: me.id }, role: { key: { notIn: ["cliente", "demo"] } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
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

  const perfilNode = (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
        <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium">Correo de notificaciones</p>
          <p className="text-muted-foreground">
            Tus notificaciones por correo llegan a <span className="font-medium text-foreground">{me.email}</span>.
            Lo gestiona Authentik (SSO); para cambiarlo, contacta con el administrador del sistema.
          </p>
        </div>
      </div>
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
    </div>
  );
  const preferenciasNode = <PreferencesForm reduceMotion={prefs.reduceMotion} startPage={prefs.startPage} density={prefs.density} />;
  const notifCuentaNode = (
    <div className="space-y-4">
      <NotificationPrefsForm prefs={notifPrefs} />
      {!isCliente ? (
        <SilenceSettings quietStart={meSilence?.quietStart ?? null} quietEnd={meSilence?.quietEnd ?? null} mutes={mutes} team={silenceTeam} />
      ) : null}
    </div>
  );

  const cuentaSections: AjustesSection[] = [
    { key: "perfil", label: "Perfil", group: "cuenta", icon: <IconPersonalizacion />, node: perfilNode },
    { key: "preferencias", label: "Preferencias", group: "cuenta", icon: <IconConfiguracion />, node: preferenciasNode },
    { key: "notificaciones", label: "Notificaciones y silencio", group: "cuenta", icon: <IconNotificaciones />, node: notifCuentaNode },
  ];

  // ── Colaboradores NO admin: Mi cuenta + su calendario (lo único de sistema que gestionan) ──
  if (!isAdmin) {
    const sections: AjustesSection[] = [...(isCliente ? [cuentaSections[0], cuentaSections[2]] : cuentaSections)];
    if (!isCliente) {
      const [myCalRow, meUser] = await Promise.all([
        db.calendarConnection.findUnique({
          where: { userId: session.id },
          select: { serverUrl: true, username: true, calendarUrl: true, calendarName: true, lastSyncAt: true, lastError: true },
        }),
        db.user.findUnique({ where: { id: session.id }, select: { calendarFeedToken: true } }),
      ]);
      const myCal = myCalRow ? { ...myCalRow, lastSyncAt: myCalRow.lastSyncAt ? myCalRow.lastSyncAt.toISOString() : null } : null;
      sections.push({
        key: "calendario",
        label: "Mi calendario",
        group: "sistema",
        icon: <IconCalendario />,
        node: (
          <div>
            <p className="mb-3 text-xs text-muted-foreground">Conecta tu calendario de Synology para sincronizar tus citas en ambos sentidos.</p>
            <CalendarConnect email={session.email ?? ""} connection={myCal} />
            <CalendarSubscribe initialToken={meUser?.calendarFeedToken ?? null} baseUrl={process.env.NEXTAUTH_URL ?? ""} />
          </div>
        ),
      });
    }
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
        <Header subtitle="Tu cuenta y tus preferencias." />
        <AjustesShell sections={sections} initial={s} />
      </div>
    );
  }

  // ── EQUIPO Y SISTEMA (admin) — mismos paneles de la antigua Configuración ──
  await ensurePermissionsCatalog();
  await ensureBuiltinRolesFlag();
  await ensureRoleDefaults();
  await ensureWriteGateDefaults();
  await ensureAsistenteDefault();
  await ensureCumplimientoDefault();
  await ensureFinanzasDefault();
  await ensureVentasFinanzas();
  await ensureNotasDefault();
  await ensureClienteDefaults();
  await ensureClienteWriteDefaults();
  await ensureClienteCollabDefaults();

  const [roles, users] = await Promise.all([
    db.role.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    }),
    db.user.findMany({
      where: { isSystemBot: false },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { role: { select: { key: true, name: true } } },
    }),
  ]);

  const catalog = PERMISSION_CATALOG.map((p) => ({ key: p.key, label: p.label, category: p.category }));
  const categories = [...PERMISSION_CATEGORIES];

  const marcebotConfig = await getMarcebotConfig();
  const calSyncConfig = await getCalendarSyncConfig();
  const mailRow = await db.mailSettings.findUnique({ where: { id: "default" } });
  const mailSettings = {
    enabled: mailRow?.enabled ?? false,
    host: mailRow?.host ?? "",
    port: mailRow?.port ?? 587,
    secure: mailRow?.secure ?? false,
    username: mailRow?.username ?? "",
    fromName: mailRow?.fromName ?? "Labstream OS",
    fromEmail: mailRow?.fromEmail ?? "",
    rejectUnauthorized: mailRow?.rejectUnauthorized ?? false,
    hasPassword: Boolean(mailRow?.passwordEnc),
  };
  const openClawRow = await db.openClawSettings.findUnique({ where: { id: "default" } });
  const openClawSettings = {
    enabled: openClawRow?.enabled ?? false,
    baseUrl: openClawRow?.baseUrl ?? "",
    agentModel: openClawRow?.agentModel ?? "openclaw",
    hasToken: Boolean(openClawRow?.tokenEnc),
  };
  const taskLabels = await db.workflowLabel.findMany({ orderBy: { position: "asc" } });
  const statusRows = taskLabels.filter((l) => l.kind === "TASK_STATUS").map((l) => ({ id: l.id, key: l.key, label: l.label, color: l.color, isDefault: l.isDefault, isDone: l.isDone }));
  const priorityRows = taskLabels.filter((l) => l.kind === "TASK_PRIORITY").map((l) => ({ id: l.id, key: l.key, label: l.label, color: l.color, isDefault: l.isDefault, isDone: l.isDone }));

  const roleOptions = roles.map((r) => ({ key: r.key, name: r.name }));

  const usuariosNode = (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Los miembros del equipo entran con Authentik y se crean automáticamente. Aquí ajustas su rol,
        das/quitas acceso a la Wiki, desactivas cuentas (no pueden iniciar sesión) o las eliminas.
      </p>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-4 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar initials={u.initials} color={u.avatarColor} size="md" />
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {u.name}
                  {u.email === session!.email ? <span className="ml-2 text-[11px] font-normal text-muted-foreground">(tú)</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <UserControls
                userId={u.id}
                userName={u.name}
                roleKey={u.role.key}
                active={u.active}
                isGuest={u.isGuest}
                gender={u.gender}
                color={u.avatarColor}
                whatsappPhone={u.whatsappPhone}
                whatsappCommand={u.whatsappCommand}
                roles={roleOptions}
                isSelf={u.email === session!.email}
              />
              <UserPermissions userId={u.id} userName={u.name} permissions={catalog} categories={categories} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const labelsNode = (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Personaliza las opciones de estado y prioridad de las tareas (nombre, color de 20 tonos y orden).
        La ⭐ marca el valor por defecto al crear una tarea; «Terminada» saca el estado de «Mis tareas».
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LabelsManager kind="TASK_STATUS" title="Estados" hint="Columnas de avance de una tarea." rows={statusRows} />
        <LabelsManager kind="TASK_PRIORITY" title="Prioridades" hint="Nivel de urgencia (también aplica a proyectos)." rows={priorityRows} />
      </div>
    </div>
  );

  const rolesNode = (
    <RolesManager
      permissions={catalog}
      categories={categories}
      roles={roles.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        emoji: r.emoji,
        color: r.color,
        isSystem: r.isSystem,
        userCount: r._count.users,
        assigned: r.permissions.map((rp) => rp.permission.key),
      }))}
    />
  );

  const emailOn = await isEmailEnabled();
  const [calConns, calTotal] = await Promise.all([
    db.calendarConnection.findMany({
      where: { enabled: true, NOT: { calendarUrl: null } },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.user.count({ where: { active: true, isSystemBot: false, isGuest: false } }),
  ]);
  const calendarTeam = calConns.map((c) => ({
    name: c.user.name,
    calendarName: c.calendarName,
    lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
    lastError: c.lastError,
  }));
  const myCalRow = await db.calendarConnection.findUnique({
    where: { userId: session!.id },
    select: { serverUrl: true, username: true, calendarUrl: true, calendarName: true, lastSyncAt: true, lastError: true },
  });
  const myCalendarConnection = myCalRow
    ? { ...myCalRow, lastSyncAt: myCalRow.lastSyncAt ? myCalRow.lastSyncAt.toISOString() : null }
    : null;
  const myFeed = await db.user.findUnique({ where: { id: session!.id }, select: { calendarFeedToken: true } });
  const ooCfg = await getOnlyOfficeConfig();
  const integracionesNode = (
    <div className="space-y-4">
      <IntegrationsPanel email={emailOn} caldav={caldavEnabled} ai={aiEnabled} onlyoffice={ooCfg.enabled} onlyofficeSettings={{ docsUrl: ooCfg.docsUrl, callbackBase: ooCfg.callbackBase, internalUrl: ooCfg.internalUrl, hasSecret: !!ooCfg.jwtSecret }} mailSettings={mailSettings} openclawOn={openClawSettings.enabled} openclawSettings={openClawSettings} calendarTeam={calendarTeam} calendarTotal={calTotal} myEmail={session!.email ?? ""} myCalendarConnection={myCalendarConnection} feedToken={myFeed?.calendarFeedToken ?? null} feedBaseUrl={process.env.NEXTAUTH_URL ?? ""} />
      <CalendarSyncSettings initial={calSyncConfig} />
    </div>
  );

  const disabledNotif = await db.notificationSetting.findMany({ where: { enabled: false }, select: { key: true } });
  const notifSistemaNode = (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Interruptores GLOBALES por tipo de aviso (aplican a todo el equipo). Lo tuyo personal vive en
        «Notificaciones y silencio», arriba en Mi cuenta.
      </p>
      <NotificationSettingsPanel disabledKeys={disabledNotif.map((d) => d.key)} />
    </div>
  );

  const canApi = hasPermission(session, "administrar_integraciones");
  const apiKeyRows = canApi
    ? await db.appKey.findMany({ orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } })
    : [];
  const apiNode = (
    <ApiKeysPanel
      keys={apiKeyRows.map((k) => ({ id: k.id, name: k.name, prefix: k.prefixVisible, scopes: k.scopes, readOnly: k.readOnly, userName: k.user.name, lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revoked: k.revoked }))}
      users={users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }))}
      roles={roleOptions}
      perms={catalog}
    />
  );

  const canAudit = hasPermission(session, "ver_actividad");
  const auditRows = canAudit
    ? await db.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          user: { select: { name: true, initials: true, avatarColor: true } },
          project: { select: { name: true } },
          client: { select: { name: true } },
        },
      })
    : [];
  const auditNode = (
    <AuditLogPanel
      rows={auditRows.map((a) => ({
        id: a.id,
        action: a.action,
        summary: a.summary,
        entityType: a.entityType,
        when: a.createdAt.toISOString(),
        userName: a.user?.name ?? a.actorName ?? null,
        userInitials: a.user?.initials ?? null,
        userColor: a.user?.avatarColor ?? null,
        projectName: a.project?.name ?? null,
        clientName: a.client?.name ?? null,
      }))}
    />
  );

  const brand = await getOrgSettings();
  const brandingNode = <BrandingPanel primaryColor={brand.primaryColor} />;
  const projectStatusesNode = <ProjectStatusesPanel initial={projectStatusesFromJson(brand.projectStatuses)} />;
  const marcebotNode = <MarcebotSettings initial={marcebotConfig} />;

  // Mantenimiento: utilidades de limpieza y el usuario DEMO (antes incrustadas en Usuarios).
  const demoUser = users.find((u) => u.email === "demo@labstream.co");
  const mantenimientoNode = (
    <div className="space-y-4">
      <CleanupNamesButton />
      <DemoPanel exists={!!demoUser} active={demoUser?.active ?? false} />
    </div>
  );

  const sections: AjustesSection[] = [
    ...cuentaSections,
    { key: "usuarios", label: "Usuarios", group: "equipo", icon: <IconUsuarios />, admin: true, node: usuariosNode },
    { key: "roles", label: "Roles y permisos", group: "equipo", icon: <IconRoles />, admin: true, node: rolesNode },
    { key: "labels", label: "Estados y prioridades", group: "equipo", icon: <IconEtiquetas />, admin: true, node: labelsNode },
    { key: "estados-proyecto", label: "Estados de proyecto", group: "equipo", icon: <IconFlujo />, admin: true, node: projectStatusesNode },
    ...(canApi ? [{ key: "marca", label: "Marca", group: "equipo" as const, icon: <IconMarca />, admin: true, node: brandingNode }] : []),
    { key: "integraciones", label: "Integraciones", group: "sistema", icon: <IconIntegraciones />, admin: true, node: integracionesNode },
    ...(canApi ? [{ key: "api", label: "API y agentes", group: "sistema" as const, icon: <IconApi />, admin: true, node: apiNode }] : []),
    { key: "marcebot", label: "Marcebot", group: "sistema", icon: <IconMarcebot />, admin: true, node: marcebotNode },
    { key: "notificaciones-sistema", label: "Notificaciones del sistema", group: "sistema", icon: <IconNotificaciones />, admin: true, node: notifSistemaNode },
    ...(canAudit ? [{ key: "auditoria", label: "Auditoría", group: "sistema" as const, icon: <IconAuditoria />, admin: true, node: auditNode }] : []),
    { key: "mantenimiento", label: "Mantenimiento", group: "sistema", icon: <IconConfiguracion />, admin: true, node: mantenimientoNode },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <Header subtitle={`Tu cuenta, el equipo y el sistema · ${users.length} usuarios, ${roles.length} roles.`} />
      <AjustesShell sections={sections} initial={s} />
    </div>
  );
}

function Header({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted/60"><IconConfiguracion className="size-7" /></span>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ajustes</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
