import { type NextRequest } from "next/server";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1 — catálogo de la API (autenticado, para no exponer la superficie sin credencial).
// Referencia rápida de endpoints; el alcance real de cada uno depende de los permisos del titular
// de la credencial (y de los scopes de la propia credencial).
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext) => {
  return apiJson({
    ok: true,
    name: "Labstream OS API v1",
    auth: "Authorization: Bearer <lsk_…> — la credencial hereda los permisos de su titular (∩ scopes).",
    readOnly: ctx.readOnly,
    endpoints: {
      identidad: ["GET /api/v1/whoami"],
      proyectos: [
        "GET /api/v1/projects?q=",
        "POST /api/v1/projects {name, clientId, leadId?, templateKey?, brief?}",
        "GET /api/v1/projects/:id (detalle + pestañas: tareas, entregables, archivos, calendario, actividad)",
        "PATCH /api/v1/projects/:id {name?, description?, status?, priority?, startDate?, dueDate?, briefScope?, briefDeliverables?, leadId?}",
      ],
      tareas: [
        "GET /api/v1/tasks?q=&project=&assignee=me|id&scope=open|done&dueBefore=&take=",
        "GET /api/v1/projects/:id/tasks",
        "POST /api/v1/projects/:id/tasks {title, description?, assigneeId?, priority?, stage?, startDate?, dueDate?, dueTime?}",
        "GET /api/v1/tasks/:id",
        "PATCH /api/v1/tasks/:id {title?, description?, status?, stage?, priority?, assigneeId?, startDate?, dueDate?, dueTime?, shootDate?}",
        "DELETE /api/v1/tasks/:id",
        "GET|POST /api/v1/tasks/:id/comments",
      ],
      calendario: [
        "GET /api/v1/calendar/events?from=&to=&project= (sin project = calendario de la app)",
        "POST /api/v1/calendar/events {title, date, time?, endTime?, description?, location?, attendeeIds?, guestEmails?, projectId?}",
        "GET /api/v1/calendar/events/:id",
        "PATCH /api/v1/calendar/events/:id {title?, date?, time?, endTime?, description?, location?}",
        "DELETE /api/v1/calendar/events/:id",
      ],
      entregables: [
        "GET /api/v1/projects/:id/deliverables",
        "POST /api/v1/projects/:id/deliverables {name, type?, dueDate?, reviewerId?}",
      ],
      archivos: [
        "GET /api/v1/projects/:id/files",
        "POST /api/v1/projects/:id/files {name, url, folderId?} (enlace Drive/URL)",
      ],
      otros: ["GET /api/v1/clients?q=", "GET|POST /api/v1/notes", "GET|PUT|DELETE /api/v1/notes/:id", "GET|POST|PUT /api/v1/quotes", "POST /api/v1/ask", "POST /api/v1/agent", "GET /api/v1/health"],
    },
  });
});
