"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { leerEstadoDemo, guardarEstadoDemo, DEMO_VACIO, type DemoArtefacto, type DemoEstado } from "@/lib/demo-mode";

// ── Encender / apagar el MODO DEMO ──
// Encender: crea un cliente y un proyecto de muestra con todo lo que la app sabe hacer.
// Apagar: borra EXACTAMENTE lo creado (se guarda la lista de ids al sembrar) y nada más.
// Facturación y propuestas quedan fuera a propósito: el modo demo no las toca.

export type DemoModoResult = { ok: boolean; error?: string; creados?: number; borrados?: number };

const MARCA = "(demo)"; // sufijo visible para que nadie confunda la muestra con trabajo real

// Solo un admin puede encender o apagar la muestra: crea y borra datos del equipo.
async function soloAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

// Fecha a las HH:mm de hoy + `dias`, en "hora de pared UTC" (la convención del calendario:
// los campos UTC del Date SON la hora local de Bogotá).
function enDias(dias: number, hora = 9, minutos = 0): Date {
  const h = new Date();
  return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate() + dias, hora, minutos, 0, 0));
}

export async function activarModoDemo(): Promise<DemoModoResult> {
  const session = await soloAdmin();
  if (!session) return { ok: false, error: "Solo un administrador puede encender el modo demo." };

  const previo = await leerEstadoDemo();
  if (previo.activo) return { ok: false, error: "El modo demo ya está encendido." };

  const yo = session.id;
  const arte: DemoArtefacto[] = [];
  const anotar = (t: DemoArtefacto["t"], id: string) => arte.push({ t, id });

  try {
    // ── Cliente ─────────────────────────────────────────────────────────────
    const cliente = await db.client.create({
      data: {
        name: `Café Aurora ${MARCA}`,
        emoji: "☕",
        company: "Café Aurora S.A.S.",
        description: "Cadena de cafeterías de especialidad. Cuenta de MUESTRA.",
        phone: "+57 300 000 0000",
        notes: "Cliente de MUESTRA creado por el modo demo. Se borra al apagarlo.",
      },
      select: { id: true },
    });
    anotar("client", cliente.id);
    await db.clientMember.create({ data: { clientId: cliente.id, userId: yo, role: "OWNER" } }).catch(() => null);

    // ── Proyecto ────────────────────────────────────────────────────────────
    const proyecto = await db.project.create({
      data: {
        code: "DEMO-01",
        name: `Comercial de lanzamiento ${MARCA}`,
        description:
          "Proyecto de MUESTRA. Recorre las pestañas (Resumen, Tareas, Calendario, Entregables, Archivos) para ver cómo trabaja la app. Se borra al apagar el modo demo.",
        type: "PUBLICIDAD",
        status: "EN_PRODUCCION",
        priority: "ALTA",
        progress: 45,
        emoji: "☕",
        clientId: cliente.id,
        leadId: yo,
        startDate: enDias(-10, 12),
        dueDate: enDias(12, 12),
        briefScope: "Un comercial de 30 s para redes y una versión corta de 15 s.",
        briefDeliverables: "Comercial 30 s (16:9) · Corte 15 s (9:16) · 5 fotos de producto",
      },
      select: { id: true },
    });
    anotar("project", proyecto.id);
    await db.projectMember.create({ data: { projectId: proyecto.id, userId: yo, role: "OWNER" } }).catch(() => null);

    // ── Tareas: una vencida, una de hoy, una futura y una hecha ─────────────
    const mkTask = async (data: Record<string, unknown>) => {
      const t = await db.task.create({ data: { projectId: proyecto.id, ...data } as never, select: { id: true } });
      anotar("task", t.id);
      return t.id;
    };

    const tVencida = await mkTask({
      title: "Enviar propuesta de música al cliente",
      description: "Ejemplo de tarea VENCIDA: mira cómo se marca en rojo en Mis tareas y en el calendario.",
      status: "PENDIENTE",
      priority: "ALTA",
      dueDate: enDias(-2, 12),
      dueTime: "10:00",
      assigneeId: yo,
      ownerId: yo,
      estimatedMinutes: 45,
    });
    const tHoy = await mkTask({
      title: "Rodaje en la tienda de Café Aurora",
      description: "Ejemplo de tarea con RODAJE: aparece en el calendario como jornada de grabación.",
      status: "EN_PROCESO",
      priority: "ALTA",
      dueDate: enDias(0, 12),
      shootDate: enDias(1, 12),
      assigneeId: yo,
      ownerId: yo,
      estimatedMinutes: 480,
    });
    await mkTask({
      title: "Primer corte para revisión interna",
      description: "Ejemplo de tarea futura con estimación de horas.",
      status: "PENDIENTE",
      priority: "MEDIA",
      dueDate: enDias(4, 12),
      dueTime: "16:00",
      assigneeId: yo,
      ownerId: yo,
      estimatedMinutes: 240,
      isDeliverableWork: true,
    });
    const tHecha = await mkTask({
      title: "Guion y storyboard aprobados",
      description: "Ejemplo de tarea COMPLETADA.",
      status: "COMPLETADA",
      priority: "MEDIA",
      dueDate: enDias(-6, 12),
      completedAt: enDias(-6, 17),
      assigneeId: yo,
      ownerId: yo,
      estimatedMinutes: 120,
    });

    // Detalle de una tarea: checklist, etiqueta y horas (para que Reportes tenga qué mostrar).
    await db.checklistItem
      .createMany({
        data: [
          { taskId: tHoy, label: "Confirmar permisos del local", done: true },
          { taskId: tHoy, label: "Llevar el kit de luces", done: false },
          { taskId: tHoy, label: "Grabar plano del barista", done: false },
        ],
      })
      .catch(() => null);
    await db.taskTag.createMany({ data: [{ taskId: tHoy, label: "rodaje" }, { taskId: tVencida, label: "cliente" }] }).catch(() => null);
    await db.timeEntry
      .create({ data: { taskId: tHecha, userId: yo, minutes: 150, spentOn: enDias(-6, 12), note: "Guion y ajustes con el cliente" } })
      .catch(() => null);
    await db.myDayItem.create({ data: { userId: yo, taskId: tHoy, position: 0 } }).catch(() => null);

    // ── Entregable (alimenta Revisiones) ───────────────────────────────────
    const entregable = await db.deliverable.create({
      data: {
        name: "Comercial 30 s — corte 1",
        projectId: proyecto.id,
        type: "VIDEO_LARGO",
        status: "REVISION_INTERNA",
        number: 1,
        dueDate: enDias(5, 18),
        ownerId: yo,
      },
      select: { id: true },
    });
    anotar("deliverable", entregable.id);

    // ── Calendario: una reunión con hora y un rodaje de todo el día ─────────
    const cita = await db.calendarEvent.create({
      data: {
        title: "Reunión de arranque con Café Aurora",
        description: "Ejemplo de CITA con invitados. Arrástrala en la vista Semana para reprogramarla.",
        start: enDias(2, 10),
        end: enDias(2, 11),
        allDay: false,
        location: "Sala de juntas · Labstream",
        createdById: yo,
        projectId: proyecto.id,
      },
      select: { id: true },
    });
    anotar("calendarEvent", cita.id);
    await db.calendarAttendee.create({ data: { eventId: cita.id, userId: yo } }).catch(() => null);

    const rodaje = await db.calendarEvent.create({
      data: {
        title: "Rodaje — Café Aurora",
        description: "Ejemplo de jornada de RODAJE (todo el día).",
        start: enDias(1, 8),
        allDay: true,
        location: "Tienda Café Aurora · Chapinero",
        createdById: yo,
        projectId: proyecto.id,
      },
      select: { id: true },
    });
    anotar("calendarEvent", rodaje.id);

    // ── Nota ────────────────────────────────────────────────────────────────
    const nota = await db.note.create({
      data: {
        title: `Ideas para el comercial ${MARCA}`,
        content:
          "Ejemplo de NOTA compartida.\n\n· Abrir con el vapor de la máquina en cámara lenta.\n· Voz en off corta, máximo 2 frases.\n· Cerrar con el logo sobre la taza.\n\nDesde una línea de una nota se puede crear una tarea.",
        createdById: yo,
        projectId: proyecto.id,
        clientId: cliente.id,
        pinned: true,
        visibility: "team",
      },
      select: { id: true },
    });
    anotar("note", nota.id);

    // ── Recordatorio ───────────────────────────────────────────────────────
    const recordatorio = await db.reminder.create({
      data: {
        title: "Revisar el corte antes de enviarlo al cliente",
        notes: "Ejemplo de RECORDATORIO. Puede repetirse y avisar X minutos antes de una cita o tarea.",
        forUserId: yo,
        createdById: yo,
        frequency: "UNA_VEZ",
        timeOfDay: "09:00",
        nextFireAt: enDias(4, 9),
      },
      select: { id: true },
    });
    anotar("reminder", recordatorio.id);

    // ── Chat del proyecto ──────────────────────────────────────────────────
    const canal = await db.chatChannel.create({
      data: { name: `Comercial de lanzamiento ${MARCA}`, type: "PROJECT", projectId: proyecto.id, isPublic: true },
      select: { id: true },
    });
    anotar("chatChannel", canal.id);
    await db.channelMember.create({ data: { channelId: canal.id, userId: yo, role: "ADMIN" } }).catch(() => null);
    await db.chatMessage
      .createMany({
        data: [
          { channelId: canal.id, authorId: yo, body: "Ejemplo de canal de proyecto: aquí vive la conversación de este trabajo." },
          { channelId: canal.id, authorId: yo, body: "Se pueden adjuntar archivos, abrir hilos, reaccionar y lanzar encuestas." },
          { channelId: canal.id, authorId: yo, body: "El cliente NO ve este canal: para él hay uno aparte." },
        ],
      })
      .catch(() => null);

    // ── Wiki ────────────────────────────────────────────────────────────────
    const wiki = await db.wikiPage.create({
      data: {
        title: `Cómo trabajamos en Labstream ${MARCA}`,
        icon: "📚",
        section: "General",
        ownerId: yo,
        content:
          "# Cómo trabajamos\n\nPágina de MUESTRA de la wiki.\n\n## Flujo de un proyecto\n1. Brief y guion.\n2. Preproducción y plan de rodaje.\n3. Rodaje.\n4. Edición y revisión interna.\n5. Revisión del cliente.\n6. Entrega final.\n\n## Dónde va cada cosa\n- El material pesado, en **Operaciones** (el NAS).\n- Lo reutilizable, en **Biblioteca**.\n- Los equipos y su ubicación, en **Inventario**.",
      },
      select: { id: true },
    });
    anotar("wikiPage", wiki.id);

    // ── Biblioteca ─────────────────────────────────────────────────────────
    const activo = await db.libraryAsset.create({
      data: {
        name: `Pack de música — cafeterías ${MARCA}`,
        kind: "LINK",
        category: "Música",
        url: "https://os.labstreamsas.com/biblioteca",
        uploadedById: yo,
        clientId: cliente.id,
      },
      select: { id: true },
    });
    anotar("libraryAsset", activo.id);

    const estado: DemoEstado = {
      activo: true,
      activadoEn: new Date().toISOString(),
      activadoPor: session.name ?? session.email,
      artefactos: arte,
      clienteId: cliente.id,
      proyectoId: proyecto.id,
    };
    await guardarEstadoDemo(estado);
    await logActivity({ action: "demo.on", summary: `encendió el modo demo (${arte.length} elementos de muestra)`, silent: true });
    revalidateTodo();
    return { ok: true, creados: arte.length };
  } catch (e) {
    // Si algo falla a mitad, se limpia lo ya creado para no dejar basura suelta.
    await borrarArtefactos(arte);
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo preparar la muestra." };
  }
}

export async function desactivarModoDemo(): Promise<DemoModoResult> {
  const session = await soloAdmin();
  if (!session) return { ok: false, error: "Solo un administrador puede apagar el modo demo." };

  const estado = await leerEstadoDemo();
  if (!estado.activo && estado.artefactos.length === 0) {
    return { ok: false, error: "El modo demo no está encendido." };
  }
  const borrados = await borrarArtefactos(estado.artefactos);
  await guardarEstadoDemo(DEMO_VACIO);
  await logActivity({ action: "demo.off", summary: `apagó el modo demo (${borrados} elementos borrados)`, silent: true });
  revalidateTodo();
  return { ok: true, borrados };
}

// Borra en orden INVERSO al de creación. Cada borrado va con su try: si el usuario ya borró
// algo a mano, se sigue con el resto en vez de dejar el apagado a medias.
async function borrarArtefactos(arte: DemoArtefacto[]): Promise<number> {
  let n = 0;
  for (const a of [...arte].reverse()) {
    try {
      switch (a.t) {
        case "client": await db.client.delete({ where: { id: a.id } }); break;
        case "project": await db.project.delete({ where: { id: a.id } }); break;
        case "task": await db.task.delete({ where: { id: a.id } }); break;
        case "deliverable": await db.deliverable.delete({ where: { id: a.id } }); break;
        case "calendarEvent": await db.calendarEvent.delete({ where: { id: a.id } }); break;
        case "note": await db.note.delete({ where: { id: a.id } }); break;
        case "reminder": await db.reminder.delete({ where: { id: a.id } }); break;
        case "chatChannel": await db.chatChannel.delete({ where: { id: a.id } }); break;
        case "wikiPage": await db.wikiPage.delete({ where: { id: a.id } }); break;
        case "libraryAsset": await db.libraryAsset.delete({ where: { id: a.id } }); break;
      }
      n++;
    } catch {
      // ya no existía (borrado a mano o arrastrado por una cascada): no es un fallo
    }
  }
  return n;
}

function revalidateTodo() {
  for (const r of ["/", "/ajustes", "/guia", "/clientes", "/proyectos", "/calendario", "/mis-tareas", "/notas", "/recordatorios", "/chat", "/wiki", "/biblioteca", "/revisiones"]) {
    revalidatePath(r);
  }
}
