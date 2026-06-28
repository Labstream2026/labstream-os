import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { UserAvatar } from "@/components/user-avatar";
import { isEmailEnabled } from "@/lib/email";
import { caldavEnabled } from "@/lib/caldav";
import { aiEnabled } from "@/lib/ai";
import { getOnlyOfficeConfig } from "@/lib/onlyoffice";
import { UserControls } from "./user-controls";
import { CleanupNamesButton } from "./cleanup-names-button";
import { RolesManager } from "./roles-manager";
import { UserPermissions } from "./user-permissions";
import { IntegrationsPanel } from "./integrations-panel";
import { ensurePermissionsCatalog, ensureBuiltinRolesFlag, ensureRoleDefaults, ensureWriteGateDefaults, ensureAsistenteDefault, ensureCumplimientoDefault, ensureFinanzasDefault, PERMISSION_CATALOG, PERMISSION_CATEGORIES } from "@/lib/permissions";
import { LabelsManager } from "./labels-manager";
import { MarcebotSettings } from "./marcebot-settings";
import { NotificationSettingsPanel } from "./notification-settings-panel";
import { ApiKeysPanel } from "./api-keys-panel";
import { AuditLogPanel } from "./audit-log-panel";
import { BrandingPanel } from "./branding-panel";
import { getOrgSettings } from "@/lib/org-settings";
import { getMarcebotConfig } from "@/lib/marcebot/config";
import { CalendarSyncSettings } from "./calendar-sync-settings";
import { getCalendarSyncConfig } from "@/lib/calendar-sync-config";
import { ViewTabs } from "@/app/(app)/proyectos/[id]/view-tabs";
import { ProfileForm } from "@/app/(app)/perfil/profile-form";
import { CalendarConnect } from "@/app/(app)/perfil/calendar-connect";
import { Mail } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const isAdmin = hasPermission(session, "administrar_usuarios");

  // Colaboradores NO admin: solo ven lo que pueden gestionar ellos mismos — conectar su
  // calendario de Synology. Las secciones sensibles (usuarios, roles, correo) son solo admin.
  if (!isAdmin) {
    const myCalRow = await db.calendarConnection.findUnique({
      where: { userId: session.id },
      select: { serverUrl: true, username: true, calendarUrl: true, calendarName: true, lastSyncAt: true, lastError: true },
    });
    const myCal = myCalRow ? { ...myCalRow, lastSyncAt: myCalRow.lastSyncAt ? myCalRow.lastSyncAt.toISOString() : null } : null;
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight">Integraciones</h1>
        <p className="mt-1 text-sm text-muted-foreground">Conecta tu calendario de Synology para sincronizar tus citas en ambos sentidos.</p>
        <CalendarConnect email={session.email ?? ""} connection={myCal} />
      </div>
    );
  }

  // Sincroniza el catálogo de permisos y marca los roles del sistema (idempotente):
  // así producción recibe los permisos nuevos sin necesidad de reseed.
  await ensurePermissionsCatalog();
  await ensureBuiltinRolesFlag();
  await ensureRoleDefaults();
  await ensureWriteGateDefaults();
  await ensureAsistenteDefault();
  await ensureCumplimientoDefault();
  await ensureFinanzasDefault();

  const [roles, users, me] = await Promise.all([
    db.role.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    }),
    db.user.findMany({
      where: { isSystemBot: false }, // oculta a Marcebot (usuario de sistema)
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { role: { select: { key: true, name: true } } },
    }),
    getCurrentUser(),
  ]);

  // Catálogo de permisos (fuente de verdad en código), agrupado por categoría.
  const catalog = PERMISSION_CATALOG.map((p) => ({ key: p.key, label: p.label, category: p.category }));
  const categories = [...PERMISSION_CATEGORIES];

  const marcebotConfig = await getMarcebotConfig();
  const calSyncConfig = await getCalendarSyncConfig();
  // Config SMTP guardada (sin exponer la contraseña al cliente: solo si está puesta).
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
  // Conexión con el agente OpenClaw (sin exponer el token al cliente: solo si está puesto).
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

  // ── Sección Usuarios ──
  const usuariosNode = (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Los miembros del equipo entran con Authentik y se crean automáticamente. Aquí ajustas su rol,
        das/quitas acceso a la Wiki, desactivas cuentas (no pueden iniciar sesión) o las eliminas.
      </p>
      <CleanupNamesButton />
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

  // ── Sección Estados y prioridades ──
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

  // ── Sección Roles y permisos ──
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

  // ── Sección Integraciones ──
  const emailOn = await isEmailEnabled();
  // Estado de las conexiones de calendario del equipo (para el panel de Integraciones).
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
  // Conexión de calendario del PROPIO admin, para poder conectarla/gestionarla aquí mismo
  // (además de Mi perfil, que sigue siendo el autoservicio para todo el equipo).
  const myCalRow = await db.calendarConnection.findUnique({
    where: { userId: session!.id },
    select: { serverUrl: true, username: true, calendarUrl: true, calendarName: true, lastSyncAt: true, lastError: true },
  });
  const myCalendarConnection = myCalRow
    ? { ...myCalRow, lastSyncAt: myCalRow.lastSyncAt ? myCalRow.lastSyncAt.toISOString() : null }
    : null;
  const ooCfg = await getOnlyOfficeConfig();
  const integracionesNode = (
    <div className="space-y-4">
      <IntegrationsPanel email={emailOn} caldav={caldavEnabled} ai={aiEnabled} onlyoffice={ooCfg.enabled} onlyofficeSettings={{ docsUrl: ooCfg.docsUrl, callbackBase: ooCfg.callbackBase, internalUrl: ooCfg.internalUrl, hasSecret: !!ooCfg.jwtSecret }} mailSettings={mailSettings} openclawOn={openClawSettings.enabled} openclawSettings={openClawSettings} calendarTeam={calendarTeam} calendarTotal={calTotal} myEmail={session!.email ?? ""} myCalendarConnection={myCalendarConnection} />
      <CalendarSyncSettings initial={calSyncConfig} />
    </div>
  );

  // ── Sección Notificaciones (admin: activar/desactivar tipos para todo el equipo) ──
  const disabledNotif = await db.notificationSetting.findMany({ where: { enabled: false }, select: { key: true } });
  const notificacionesNode = <NotificationSettingsPanel disabledKeys={disabledNotif.map((d) => d.key)} />;

  // ── Sección API (credenciales para servicios externos: gateway OpenClaw, etc.) ──
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

  // ── Sección Auditoría (registro global de actividad; gate ver_actividad) ──
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

  // ── Sección Marca (color de la organización; admin con administrar_integraciones) ──
  const brand = await getOrgSettings();
  const brandingNode = <BrandingPanel primaryColor={brand.primaryColor} />;

  // ── Sección Marcebot ──
  const marcebotNode = <MarcebotSettings initial={marcebotConfig} />;

  // ── Sección Personalización (perfil propio) ──
  const personalizacionNode = me ? (
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
      <ProfileForm name={me.name} email={me.email} title={me.title} initials={me.initials} color={me.avatarColor} avatarUrl={me.avatarUrl} />
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">No se pudo cargar tu perfil.</p>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Equipo y permisos · {users.length} usuarios, {roles.length} roles.
      </p>

      <ViewTabs
        storageKey="config-view"
        views={[
          { key: "usuarios", label: "Usuarios", icon: "👥", node: usuariosNode },
          { key: "labels", label: "Estados y prioridades", icon: "🏷️", node: labelsNode },
          { key: "roles", label: "Roles y permisos", icon: "🔐", node: rolesNode },
          { key: "notificaciones", label: "Notificaciones", icon: "🔔", node: notificacionesNode },
          ...(canAudit ? [{ key: "auditoria", label: "Auditoría", icon: "📋", node: auditNode }] : []),
          { key: "marcebot", label: "Marcebot", icon: "🤖", node: marcebotNode },
          { key: "integraciones", label: "Integraciones", icon: "🔌", node: integracionesNode },
          ...(canApi ? [{ key: "api", label: "API", icon: "🔑", node: apiNode }] : []),
          ...(canApi ? [{ key: "marca", label: "Marca", icon: "🖌️", node: brandingNode }] : []),
          { key: "personalizacion", label: "Mi personalización", icon: "🎨", node: personalizacionNode },
        ]}
      />
    </div>
  );
}
