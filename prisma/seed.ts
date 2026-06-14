import {
  PrismaClient,
  ProjectStatus,
  ProjectType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { TEMPLATES } from "../src/lib/templates";
import { createFolders } from "../src/lib/provisioning";

const prisma = new PrismaClient();

// Contraseña de desarrollo para TODO el equipo seed. Cambiar en producción.
const DEV_PASSWORD = "Labstream2026!";
const PWD_HASH = bcrypt.hashSync(DEV_PASSWORD, 10);

// ── Permisos por módulo (spec sección 3) ──
const PERMISSIONS: { key: string; description: string }[] = [
  { key: "ver_proyectos", description: "Ver proyectos" },
  { key: "crear_proyectos", description: "Crear proyectos" },
  { key: "editar_proyectos", description: "Editar proyectos" },
  { key: "ver_cotizaciones", description: "Ver cotizaciones" },
  { key: "crear_cotizaciones", description: "Crear cotizaciones" },
  { key: "aprobar_cotizaciones", description: "Aprobar cotizaciones" },
  { key: "ver_archivos", description: "Ver archivos" },
  { key: "subir_archivos", description: "Subir archivos" },
  { key: "comentar", description: "Comentar" },
  { key: "aprobar_entregables", description: "Aprobar entregables" },
  { key: "administrar_usuarios", description: "Administrar usuarios" },
  { key: "ver_reportes", description: "Ver reportes" },
];

const ALL = PERMISSIONS.map((p) => p.key);
const VER_BASICO = ["ver_proyectos", "ver_archivos", "comentar"];
const EQUIPO_PROD = [
  "ver_proyectos",
  "ver_archivos",
  "subir_archivos",
  "comentar",
];

// ── Roles (spec sección 3) y sus permisos ──
const ROLES: { key: string; name: string; description: string; perms: string[] }[] =
  [
    { key: "admin", name: "Administrador", description: "Acceso total", perms: ALL },
    {
      key: "gerente",
      name: "Gerente",
      description: "Visión comercial y general",
      perms: [
        "ver_proyectos",
        "crear_proyectos",
        "editar_proyectos",
        "ver_cotizaciones",
        "crear_cotizaciones",
        "aprobar_cotizaciones",
        "ver_archivos",
        "comentar",
        "aprobar_entregables",
        "ver_reportes",
      ],
    },
    {
      key: "ventas",
      name: "Ventas",
      description: "Cotizaciones y clientes",
      perms: ["ver_proyectos", "ver_cotizaciones", "crear_cotizaciones", "comentar", "ver_reportes"],
    },
    {
      key: "productor",
      name: "Productor",
      description: "Coordina la producción",
      perms: [...EQUIPO_PROD, "crear_proyectos", "editar_proyectos", "aprobar_entregables"],
    },
    {
      key: "director",
      name: "Director",
      description: "Dirección creativa",
      perms: [...EQUIPO_PROD, "editar_proyectos", "aprobar_entregables"],
    },
    { key: "editor", name: "Editor", description: "Edición y postproducción", perms: EQUIPO_PROD },
    { key: "camarografo", name: "Camarógrafo", description: "Captura en set", perms: EQUIPO_PROD },
    { key: "disenador", name: "Diseñador", description: "Diseño gráfico", perms: EQUIPO_PROD },
    { key: "community", name: "Community Manager", description: "Redes y contenido", perms: EQUIPO_PROD },
    { key: "freelancer", name: "Freelancer", description: "Colaborador externo", perms: VER_BASICO },
    { key: "cliente", name: "Cliente", description: "Acceso muy limitado", perms: ["comentar"] },
  ];

// ── Equipo (calcado de los mockups) ──
const USERS: {
  email: string;
  name: string;
  title: string;
  roleKey: string;
  initials: string;
  color: string;
}[] = [
  { email: "hola@labstream.co", name: "Jonathan Flórez", title: "Dirección", roleKey: "admin", initials: "JF", color: "indigo" },
  { email: "mateo@labstream.co", name: "Mateo Ríos", title: "Productora", roleKey: "admin", initials: "MR", color: "indigo" },
  { email: "lucia@labstream.co", name: "Lucía Fernández", title: "Editora", roleKey: "editor", initials: "LF", color: "emerald" },
  { email: "sara@labstream.co", name: "Sara Martín", title: "Diseñadora", roleKey: "disenador", initials: "SM", color: "violet" },
  { email: "nora@labstream.co", name: "Nora Beltrán", title: "Productora", roleKey: "productor", initials: "NB", color: "cyan" },
  { email: "diego@labstream.co", name: "Diego Pérez", title: "Director", roleKey: "director", initials: "DP", color: "amber" },
  { email: "ivan@labstream.co", name: "Iván Torres", title: "Camarógrafo", roleKey: "camarografo", initials: "IT", color: "rose" },
];

// ── Clientes (mockups) ──
const CLIENTS: { name: string; description: string; emoji: string; accentColor: string }[] = [
  { name: "Acme Studios", description: "Productora audiovisual", emoji: "🎬", accentColor: "indigo" },
  { name: "Nova Films", description: "Producción de cine", emoji: "🎞️", accentColor: "violet" },
  { name: "Brightside", description: "Agencia de marca", emoji: "☀️", accentColor: "amber" },
  { name: "Horizon Media", description: "Medios y streaming", emoji: "🟠", accentColor: "orange" },
];

// ── Proyectos (mockups: "6 proyectos activos · 1 bloqueado") ──
const PROJECTS: {
  code: string;
  name: string;
  clientName: string;
  type: ProjectType;
  status: ProjectStatus;
  priority: string;
  progress: number;
  emoji: string;
  leadEmail: string;
  dueDate: Date;
}[] = [
  { code: "LS-0001", name: "Campaña de lanzamiento", clientName: "Acme Studios", type: ProjectType.PUBLICIDAD, status: ProjectStatus.EN_PRODUCCION, priority: "ALTA", progress: 62, emoji: "🚀", leadEmail: "mateo@labstream.co", dueDate: new Date("2026-06-14") },
  { code: "LS-0002", name: "Sitio web corporativo", clientName: "Acme Studios", type: ProjectType.CORPORATIVO, status: ProjectStatus.REVISION_INTERNA, priority: "MEDIA", progress: 80, emoji: "🌐", leadEmail: "mateo@labstream.co", dueDate: new Date("2026-06-19") },
  { code: "LS-0003", name: "Documental Nova", clientName: "Nova Films", type: ProjectType.DOCUMENTAL, status: ProjectStatus.EN_EDICION, priority: "ALTA", progress: 45, emoji: "🎥", leadEmail: "diego@labstream.co", dueDate: new Date("2026-06-27") },
  { code: "LS-0004", name: "Promo Nova", clientName: "Nova Films", type: ProjectType.REEL, status: ProjectStatus.EN_PREPRODUCCION, priority: "MEDIA", progress: 20, emoji: "🎬", leadEmail: "nora@labstream.co", dueDate: new Date("2026-07-02") },
  { code: "LS-0005", name: "Reel mensual Brightside", clientName: "Brightside", type: ProjectType.CAMPANA_MENSUAL, status: ProjectStatus.EN_PRODUCCION, priority: "MEDIA", progress: 35, emoji: "✨", leadEmail: "nora@labstream.co", dueDate: new Date("2026-06-30") },
  { code: "LS-0006", name: "Streaming Horizon", clientName: "Horizon Media", type: ProjectType.STREAMING, status: ProjectStatus.PAUSADO, priority: "ALTA", progress: 10, emoji: "📡", leadEmail: "diego@labstream.co", dueDate: new Date("2026-07-10") },
];

async function main() {
  // limpieza idempotente (orden seguro con FKs)
  await prisma.chatMessage.deleteMany();
  await prisma.chatChannel.deleteMany();
  await prisma.projectTemplate.deleteMany();
  await prisma.project.deleteMany(); // cascada a tareas, entregables, carpetas, archivos y canal
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();

  // permisos
  for (const p of PERMISSIONS) {
    await prisma.permission.create({ data: p });
  }
  const permByKey = Object.fromEntries(
    (await prisma.permission.findMany()).map((p) => [p.key, p.id]),
  );

  // roles + relación
  const roleByKey: Record<string, string> = {};
  for (const r of ROLES) {
    const role = await prisma.role.create({
      data: { key: r.key, name: r.name, description: r.description },
    });
    roleByKey[r.key] = role.id;
    await prisma.rolePermission.createMany({
      data: r.perms.map((pk) => ({ roleId: role.id, permissionId: permByKey[pk] })),
    });
  }

  // usuarios
  const userByEmail: Record<string, string> = {};
  for (const u of USERS) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        title: u.title,
        initials: u.initials,
        avatarColor: u.color,
        passwordHash: PWD_HASH,
        roleId: roleByKey[u.roleKey],
      },
    });
    userByEmail[u.email] = user.id;
  }

  // clientes
  const clientByName: Record<string, string> = {};
  for (const c of CLIENTS) {
    const client = await prisma.client.create({ data: c });
    clientByName[c.name] = client.id;
  }

  // proyectos
  const projectIds: { id: string; leadId: string; name: string }[] = [];
  for (const p of PROJECTS) {
    const leadId = userByEmail[p.leadEmail];
    const project = await prisma.project.create({
      data: {
        code: p.code,
        name: p.name,
        type: p.type,
        status: p.status,
        priority: p.priority,
        progress: p.progress,
        emoji: p.emoji,
        dueDate: p.dueDate,
        clientId: clientByName[p.clientName],
        leadId,
      },
    });
    projectIds.push({ id: project.id, leadId, name: p.name });
  }

  // plantillas de proyecto
  for (const t of TEMPLATES) {
    await prisma.projectTemplate.create({
      data: {
        key: t.key,
        name: t.name,
        emoji: t.emoji,
        description: t.description,
        type: t.type,
        content: JSON.parse(JSON.stringify(t.content)),
      },
    });
  }

  // poblar cada proyecto con carpetas, tareas, entregables y archivos demo
  const TASKS = [
    { title: "Brief y objetivos", status: "COMPLETADA", stage: "Preproducción" },
    { title: "Guion / escaleta", status: "COMPLETADA", stage: "Preproducción" },
    { title: "Grabación", status: "EN_PROCESO", stage: "Producción" },
    { title: "Edición V1", status: "EN_PROCESO", stage: "Postproducción" },
    { title: "Revisión interna", status: "EN_REVISION", stage: "Revisión cliente" },
    { title: "Entrega final", status: "PENDIENTE", stage: "Entregado" },
  ];

  for (const { id: projectId, leadId, name } of projectIds) {
    await createFolders(prisma, projectId);
    const channel = await prisma.chatChannel.create({
      data: { type: "PROJECT", name, projectId },
    });
    await prisma.chatMessage.createMany({
      data: [
        { channelId: channel.id, authorId: leadId, body: "Abro el canal del proyecto 🎬 Aquí coordinamos todo." },
        { channelId: channel.id, authorId: userByEmail["lucia@labstream.co"], body: "¡Listo! Subo el primer corte esta tarde." },
      ],
    });

    for (let i = 0; i < TASKS.length; i++) {
      const t = TASKS[i];
      const task = await prisma.task.create({
        data: {
          projectId,
          title: t.title,
          status: t.status as never,
          stage: t.stage,
          position: i,
          assigneeId: leadId,
        },
      });
      if (t.title === "Edición V1") {
        await prisma.checklistItem.createMany({
          data: [
            { taskId: task.id, label: "Corte inicial", done: true, position: 0 },
            { taskId: task.id, label: "Corrección de color", done: false, position: 1 },
            { taskId: task.id, label: "Audio y música", done: false, position: 2 },
          ],
        });
      }
    }

    const master = await prisma.deliverable.create({
      data: { projectId, name: "Video master", type: "VIDEO_LARGO", status: "EN_EDICION", ownerId: leadId },
    });
    await prisma.deliverableVersion.createMany({
      data: [
        { deliverableId: master.id, number: 1, notes: "Primer corte", uploadedById: leadId },
        { deliverableId: master.id, number: 2, notes: "Ajustes de ritmo y color", uploadedById: leadId },
      ],
    });
    await prisma.deliverable.create({
      data: { projectId, name: "Versión para redes (60s)", type: "SHORT", status: "PENDIENTE", ownerId: leadId },
    });

    const folders = await prisma.projectFolder.findMany({ where: { projectId } });
    const folderByName = Object.fromEntries(folders.map((f) => [f.name, f.id]));
    await prisma.fileAsset.createMany({
      data: [
        {
          projectId,
          name: "Material bruto (Drive)",
          kind: "DRIVE",
          url: "https://drive.google.com/drive/folders/EJEMPLO",
          folderId: folderByName["04 Material bruto"],
          uploadedById: leadId,
        },
        {
          projectId,
          name: "Brief del cliente.pdf",
          kind: "LINK",
          url: "https://example.com/brief.pdf",
          folderId: folderByName["01 Brief"],
          uploadedById: leadId,
        },
      ],
    });
  }

  // canales generales del equipo
  const general = await prisma.chatChannel.create({
    data: { type: "GENERAL", name: "general", slug: "general" },
  });
  await prisma.chatMessage.createMany({
    data: [
      { channelId: general.id, authorId: userByEmail["mateo@labstream.co"], body: "Buenos días equipo ☕ Recordatorio: daily a las 12:00." },
      { channelId: general.id, authorId: userByEmail["nora@labstream.co"], body: "Llego tarde al daily, estoy en una llamada con Horizon." },
      { channelId: general.id, authorId: userByEmail["ivan@labstream.co"], body: "Subo el storyboard de la promo de Nova 🎬" },
    ],
  });
  const estados = await prisma.chatChannel.create({
    data: { type: "GENERAL", name: "estados-equipo", slug: "estados-equipo" },
  });
  await prisma.chatMessage.create({
    data: { channelId: estados.id, authorId: userByEmail["lucia@labstream.co"], body: "Avanzando con la API de integración — el webhook ya recibe eventos correctamente 🎉" },
  });

  console.log(
    `Seed listo: ${PERMISSIONS.length} permisos, ${ROLES.length} roles, ${USERS.length} usuarios, ${CLIENTS.length} clientes, ${PROJECTS.length} proyectos, ${TEMPLATES.length} plantillas, canales de chat (+ tareas, entregables, carpetas y archivos demo).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
