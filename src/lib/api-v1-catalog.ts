// ── Catálogo ÚNICO de la API v1 ──
// Fuente de verdad de la superficie REST: alimenta a la vez el índice legible (`GET /api/v1`) y el
// documento OpenAPI (`GET /api/v1/openapi.json`) para que un agente de IA (o n8n/LangChain) descubra
// solo cada operación, sus parámetros y su autenticación. Mantener sincronizado al añadir endpoints.
// El `permission` es informativo: el alcance REAL lo decide el titular de la credencial ∩ sus scopes.

export type ApiParam = { name: string; in: "query" | "path"; required?: boolean; type?: string; desc?: string };
export type ApiField = { name: string; required?: boolean; type?: string; desc?: string };
export type ApiEndpoint = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string; // con {param} para segmentos dinámicos
  group: string;
  summary: string;
  permission?: string; // permiso del catálogo que espeja (informativo)
  write?: boolean; // requiere credencial que NO sea de solo lectura
  params?: ApiParam[];
  body?: ApiField[];
};

export const API_ENDPOINTS: ApiEndpoint[] = [
  // ── Descubrimiento e identidad ──
  { method: "GET", path: "/api/v1", group: "Descubrimiento", summary: "Catálogo legible de la API." },
  { method: "GET", path: "/api/v1/openapi.json", group: "Descubrimiento", summary: "Especificación OpenAPI 3.1 (para agentes/clientes)." },
  { method: "GET", path: "/api/v1/whoami", group: "Descubrimiento", summary: "Titular de la credencial: usuario, rol y permisos efectivos." },
  { method: "GET", path: "/api/v1/health", group: "Descubrimiento", summary: "Salud de la pasarela del agente (OpenClaw)." },
  { method: "POST", path: "/api/v1/ask", group: "Agente", summary: "Chat con el modelo, sin herramientas (texto).", body: [{ name: "message", required: true, type: "string" }] },
  { method: "POST", path: "/api/v1/agent", group: "Agente", summary: "Bucle agéntico con herramientas (respeta permisos del titular).", body: [{ name: "message", required: true, type: "string" }] },

  // ── Clientes ──
  { method: "GET", path: "/api/v1/clients", group: "Clientes", summary: "Lista de clientes accesibles.", permission: "ver_clientes", params: [{ name: "q", in: "query", desc: "búsqueda por nombre" }] },
  { method: "POST", path: "/api/v1/clients", group: "Clientes", summary: "Crea un cliente.", permission: "crear_clientes", write: true, body: [{ name: "name", required: true, type: "string" }, { name: "company", type: "string" }, { name: "description", type: "string" }, { name: "emoji", type: "string" }, { name: "accentColor", type: "string", desc: "clave de la paleta" }] },
  { method: "GET", path: "/api/v1/clients/{id}", group: "Clientes", summary: "Detalle del cliente (equipo, proyectos, conteos).", permission: "ver_clientes", params: [{ name: "id", in: "path", required: true }] },
  { method: "PATCH", path: "/api/v1/clients/{id}", group: "Clientes", summary: "Edita el cliente (parcial).", permission: "editar_clientes", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "name", type: "string" }, { name: "company", type: "string" }, { name: "description", type: "string" }, { name: "notes", type: "string" }, { name: "emoji", type: "string" }, { name: "accentColor", type: "string" }, { name: "active", type: "boolean" }] },
  { method: "DELETE", path: "/api/v1/clients/{id}", group: "Clientes", summary: "Archiva el cliente (papelera, reversible). Solo admin.", write: true, params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/clients/{id}/restore", group: "Clientes", summary: "Restaura un cliente archivado. Solo admin.", write: true, params: [{ name: "id", in: "path", required: true }] },
  { method: "GET", path: "/api/v1/clients/{id}/members", group: "Clientes", summary: "Equipo con acceso al cliente.", permission: "ver_clientes", params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/clients/{id}/members", group: "Clientes", summary: "Da acceso a un usuario del equipo al cliente.", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "userId", required: true, type: "string" }, { name: "role", type: "string", desc: "RESPONSABLE | MIEMBRO" }] },
  { method: "PATCH", path: "/api/v1/clients/{id}/members/{userId}", group: "Clientes", summary: "Marca/desmarca RESPONSABLE de la cuenta.", write: true, params: [{ name: "id", in: "path", required: true }, { name: "userId", in: "path", required: true }], body: [{ name: "role", required: true, type: "string" }] },
  { method: "DELETE", path: "/api/v1/clients/{id}/members/{userId}", group: "Clientes", summary: "Quita el acceso al cliente.", write: true, params: [{ name: "id", in: "path", required: true }, { name: "userId", in: "path", required: true }] },

  // ── Proyectos ──
  { method: "GET", path: "/api/v1/projects", group: "Proyectos", summary: "Lista de proyectos accesibles.", params: [{ name: "q", in: "query" }] },
  { method: "POST", path: "/api/v1/projects", group: "Proyectos", summary: "Crea un proyecto (opcionalmente desde plantilla).", permission: "crear_proyectos", write: true, body: [{ name: "name", required: true, type: "string" }, { name: "clientId", required: true, type: "string" }, { name: "leadId", type: "string" }, { name: "templateKey", type: "string" }, { name: "brief", type: "string" }] },
  { method: "GET", path: "/api/v1/projects/{id}", group: "Proyectos", summary: "Detalle con pestañas (tareas, entregables, archivos, calendario, actividad).", params: [{ name: "id", in: "path", required: true }] },
  { method: "PATCH", path: "/api/v1/projects/{id}", group: "Proyectos", summary: "Edita el proyecto (parcial).", permission: "editar_proyectos", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "name", type: "string" }, { name: "description", type: "string" }, { name: "status", type: "string" }, { name: "priority", type: "string" }, { name: "startDate", type: "string", desc: "YYYY-MM-DD" }, { name: "dueDate", type: "string" }, { name: "briefScope", type: "string" }, { name: "briefDeliverables", type: "string" }, { name: "leadId", type: "string" }] },
  { method: "DELETE", path: "/api/v1/projects/{id}", group: "Proyectos", summary: "Archiva el proyecto (papelera, reversible).", permission: "eliminar_proyectos", write: true, params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/projects/{id}/restore", group: "Proyectos", summary: "Restaura un proyecto archivado.", permission: "ver_papelera", write: true, params: [{ name: "id", in: "path", required: true }] },
  { method: "GET", path: "/api/v1/projects/{id}/members", group: "Proyectos", summary: "Miembros del proyecto y su líder.", params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/projects/{id}/members", group: "Proyectos", summary: "Añade un miembro.", permission: "gestionar_miembros_proyecto", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "userId", required: true, type: "string" }, { name: "role", type: "string", desc: "OWNER | MEMBER | GUEST" }] },
  { method: "PATCH", path: "/api/v1/projects/{id}/members/{userId}", group: "Proyectos", summary: "Cambia el rol del miembro.", permission: "gestionar_miembros_proyecto", write: true, params: [{ name: "id", in: "path", required: true }, { name: "userId", in: "path", required: true }], body: [{ name: "role", required: true, type: "string" }] },
  { method: "DELETE", path: "/api/v1/projects/{id}/members/{userId}", group: "Proyectos", summary: "Quita al miembro del proyecto.", permission: "gestionar_miembros_proyecto", write: true, params: [{ name: "id", in: "path", required: true }, { name: "userId", in: "path", required: true }] },
  { method: "GET", path: "/api/v1/projects/{id}/folders", group: "Proyectos", summary: "Carpetas del proyecto.", permission: "ver_archivos", params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/projects/{id}/folders", group: "Proyectos", summary: "Crea una carpeta.", permission: "subir_archivos", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "name", required: true, type: "string" }, { name: "icon", type: "string" }, { name: "color", type: "string" }] },
  { method: "PATCH", path: "/api/v1/projects/{id}/folders/{folderId}", group: "Proyectos", summary: "Renombra/reestiliza una carpeta.", permission: "subir_archivos", write: true, params: [{ name: "id", in: "path", required: true }, { name: "folderId", in: "path", required: true }], body: [{ name: "name", type: "string" }, { name: "icon", type: "string" }, { name: "color", type: "string" }] },
  { method: "DELETE", path: "/api/v1/projects/{id}/folders/{folderId}", group: "Proyectos", summary: "Borra una carpeta (sus archivos quedan sin carpeta).", permission: "eliminar_archivos", write: true, params: [{ name: "id", in: "path", required: true }, { name: "folderId", in: "path", required: true }] },

  // ── Tareas ──
  { method: "GET", path: "/api/v1/tasks", group: "Tareas", summary: "Lista global de tareas accesibles.", params: [{ name: "q", in: "query" }, { name: "project", in: "query" }, { name: "assignee", in: "query", desc: "me | userId" }, { name: "scope", in: "query", desc: "open | done" }, { name: "dueBefore", in: "query" }, { name: "take", in: "query" }] },
  { method: "GET", path: "/api/v1/projects/{id}/tasks", group: "Tareas", summary: "Tareas del proyecto.", params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/projects/{id}/tasks", group: "Tareas", summary: "Crea una tarea en el proyecto.", permission: "crear_tareas", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "title", required: true, type: "string" }, { name: "description", type: "string" }, { name: "assigneeId", type: "string" }, { name: "priority", type: "string" }, { name: "stage", type: "string" }, { name: "startDate", type: "string" }, { name: "dueDate", type: "string" }, { name: "dueTime", type: "string", desc: "HH:mm" }] },
  { method: "GET", path: "/api/v1/tasks/{id}", group: "Tareas", summary: "Detalle de la tarea (con checklist).", params: [{ name: "id", in: "path", required: true }] },
  { method: "PATCH", path: "/api/v1/tasks/{id}", group: "Tareas", summary: "Edita la tarea (parcial, gates por campo).", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "title", type: "string" }, { name: "description", type: "string" }, { name: "status", type: "string" }, { name: "stage", type: "string" }, { name: "priority", type: "string" }, { name: "assigneeId", type: "string" }, { name: "startDate", type: "string" }, { name: "dueDate", type: "string" }, { name: "dueTime", type: "string" }, { name: "shootDate", type: "string" }] },
  { method: "DELETE", path: "/api/v1/tasks/{id}", group: "Tareas", summary: "Borra la tarea.", permission: "eliminar_tareas", write: true, params: [{ name: "id", in: "path", required: true }] },
  { method: "GET", path: "/api/v1/tasks/{id}/comments", group: "Tareas", summary: "Notas/comentarios de la tarea.", params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/tasks/{id}/comments", group: "Tareas", summary: "Añade una nota a la tarea.", permission: "comentar", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "body", required: true, type: "string" }] },

  // ── Calendario ──
  { method: "GET", path: "/api/v1/calendar/events", group: "Calendario", summary: "Eventos visibles en un rango.", params: [{ name: "from", in: "query", desc: "YYYY-MM-DD" }, { name: "to", in: "query" }, { name: "project", in: "query" }] },
  { method: "POST", path: "/api/v1/calendar/events", group: "Calendario", summary: "Crea un evento (con asistentes/invitados).", permission: "gestionar_calendario", write: true, body: [{ name: "title", required: true, type: "string" }, { name: "date", required: true, type: "string", desc: "YYYY-MM-DD" }, { name: "time", type: "string" }, { name: "endTime", type: "string" }, { name: "description", type: "string" }, { name: "location", type: "string" }, { name: "attendeeIds", type: "string[]" }, { name: "guestEmails", type: "string[]" }, { name: "projectId", type: "string" }] },
  { method: "GET", path: "/api/v1/calendar/events/{id}", group: "Calendario", summary: "Detalle del evento.", params: [{ name: "id", in: "path", required: true }] },
  { method: "PATCH", path: "/api/v1/calendar/events/{id}", group: "Calendario", summary: "Reprograma/edita el evento (solo el creador).", permission: "gestionar_calendario", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "title", type: "string" }, { name: "date", type: "string" }, { name: "time", type: "string" }, { name: "endTime", type: "string" }, { name: "description", type: "string" }, { name: "location", type: "string" }] },
  { method: "DELETE", path: "/api/v1/calendar/events/{id}", group: "Calendario", summary: "Cancela el evento (solo el creador).", permission: "gestionar_calendario", write: true, params: [{ name: "id", in: "path", required: true }] },

  // ── Entregables ──
  { method: "GET", path: "/api/v1/projects/{id}/deliverables", group: "Entregables", summary: "Entregables del proyecto.", params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/projects/{id}/deliverables", group: "Entregables", summary: "Crea un entregable.", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "name", required: true, type: "string" }, { name: "type", type: "string" }, { name: "dueDate", type: "string" }, { name: "reviewerId", type: "string" }] },

  // ── Archivos ──
  { method: "GET", path: "/api/v1/projects/{id}/files", group: "Archivos", summary: "Enlaces y documentos del proyecto.", permission: "ver_archivos", params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/projects/{id}/files", group: "Archivos", summary: "Registra un enlace (Drive/URL).", permission: "subir_archivos", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "name", required: true, type: "string" }, { name: "url", required: true, type: "string" }, { name: "folderId", type: "string" }] },

  // ── Notas personales ──
  { method: "GET", path: "/api/v1/notes", group: "Notas", summary: "Notas personales.", permission: "ver_notas", params: [{ name: "q", in: "query" }, { name: "projectId", in: "query" }] },
  { method: "POST", path: "/api/v1/notes", group: "Notas", summary: "Crea una nota.", permission: "crear_notas", write: true, body: [{ name: "content", required: true, type: "string" }, { name: "title", type: "string" }, { name: "category", type: "string" }, { name: "projectId", type: "string" }] },
  { method: "GET", path: "/api/v1/notes/{id}", group: "Notas", summary: "Detalle de la nota.", permission: "ver_notas", params: [{ name: "id", in: "path", required: true }] },
  { method: "PATCH", path: "/api/v1/notes/{id}", group: "Notas", summary: "Edita la nota.", permission: "editar_notas", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "title", type: "string" }, { name: "content", type: "string" }, { name: "category", type: "string" }] },
  { method: "DELETE", path: "/api/v1/notes/{id}", group: "Notas", summary: "Borra la nota.", permission: "editar_notas", write: true, params: [{ name: "id", in: "path", required: true }] },

  // ── Comercial ──
  { method: "GET", path: "/api/v1/quotes", group: "Comercial", summary: "Cotizaciones accesibles.", permission: "ver_finanzas", params: [{ name: "status", in: "query" }] },

  // ── Equipo (directorio, solo lectura) ──
  { method: "GET", path: "/api/v1/users", group: "Equipo", summary: "Directorio del equipo (para resolver responsables). Solo lectura, campos seguros.", params: [{ name: "q", in: "query" }, { name: "includeInactive", in: "query" }] },

  // ── Entregables (detalle y ciclo de revisión) ──
  { method: "GET", path: "/api/v1/deliverables/{id}", group: "Entregables", summary: "Detalle: versiones, revisores, decisiones y conteos.", params: [{ name: "id", in: "path", required: true }] },
  { method: "PATCH", path: "/api/v1/deliverables/{id}", group: "Entregables", summary: "Edita nombre/estado/tipo/entrega/copy/hashtags/caducidad (gates por campo).", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "name", type: "string" }, { name: "status", type: "string" }, { name: "type", type: "string" }, { name: "dueDate", type: "string" }, { name: "copy", type: "string" }, { name: "hashtags", type: "string" }, { name: "reviewExpiresAt", type: "string" }] },
  { method: "DELETE", path: "/api/v1/deliverables/{id}", group: "Entregables", summary: "Archiva el entregable (el enlace sigue vivo; reversible).", write: true, params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/deliverables/{id}/restore", group: "Entregables", summary: "Desarchiva el entregable.", write: true, params: [{ name: "id", in: "path", required: true }] },
  { method: "GET", path: "/api/v1/deliverables/{id}/reviewers", group: "Entregables", summary: "Revisores (pre-aprobadores) actuales.", params: [{ name: "id", in: "path", required: true }] },
  { method: "PUT", path: "/api/v1/deliverables/{id}/reviewers", group: "Entregables", summary: "Fija el conjunto de revisores internos (miembros del equipo).", permission: "gestionar el proyecto", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "userIds", required: true, type: "string[]" }] },
  { method: "GET", path: "/api/v1/deliverables/{id}/versions", group: "Entregables", summary: "Versiones del entregable.", params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/deliverables/{id}/versions", group: "Entregables", summary: "Sube una versión por enlace (Drive/URL).", permission: "subir_archivos", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "fileUrl", required: true, type: "string" }, { name: "notes", type: "string" }, { name: "durationSec", type: "number" }] },
  { method: "POST", path: "/api/v1/deliverables/{id}/decision", group: "Entregables", summary: "Pre-aprobación interna: aprobar o solicitar cambios en una versión.", permission: "aprobar_entregables", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "versionNumber", required: true, type: "number" }, { name: "result", required: true, type: "string", desc: "APROBADO | CAMBIOS" }, { name: "note", type: "string" }] },

  // ── Archivos (por id) ──
  { method: "PATCH", path: "/api/v1/files/{id}", group: "Archivos", summary: "Renombra o mueve de carpeta el archivo/enlace.", permission: "subir_archivos", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "name", type: "string" }, { name: "folderId", type: "string" }] },
  { method: "DELETE", path: "/api/v1/files/{id}", group: "Archivos", summary: "Borra el archivo/enlace.", permission: "eliminar_archivos", write: true, params: [{ name: "id", in: "path", required: true }] },

  // ── Calendario (RSVP) ──
  { method: "POST", path: "/api/v1/calendar/events/{id}/rsvp", group: "Calendario", summary: "Responde a una invitación (solo los invitados).", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "status", required: true, type: "string", desc: "ACCEPTED | DECLINED | TENTATIVE" }] },

  // ── Tareas (sub-recursos) ──
  { method: "GET", path: "/api/v1/tasks/{id}/checklist", group: "Tareas", summary: "Ítems del checklist.", params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/tasks/{id}/checklist", group: "Tareas", summary: "Añade un ítem al checklist.", permission: "editar_tareas", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "label", required: true, type: "string" }] },
  { method: "PATCH", path: "/api/v1/tasks/{id}/checklist/{itemId}", group: "Tareas", summary: "Marca/renombra un ítem del checklist.", permission: "editar_tareas", write: true, params: [{ name: "id", in: "path", required: true }, { name: "itemId", in: "path", required: true }], body: [{ name: "done", type: "boolean" }, { name: "label", type: "string" }] },
  { method: "DELETE", path: "/api/v1/tasks/{id}/checklist/{itemId}", group: "Tareas", summary: "Borra un ítem del checklist.", permission: "editar_tareas", write: true, params: [{ name: "id", in: "path", required: true }, { name: "itemId", in: "path", required: true }] },
  { method: "GET", path: "/api/v1/tasks/{id}/time", group: "Tareas", summary: "Partes de horas de la tarea.", params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/tasks/{id}/time", group: "Tareas", summary: "Registra horas.", permission: "registrar_horas", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "minutes", type: "number" }, { name: "hours", type: "number" }, { name: "note", type: "string" }, { name: "spentOn", type: "string" }] },
  { method: "DELETE", path: "/api/v1/tasks/{id}/time/{entryId}", group: "Tareas", summary: "Borra un parte de horas (autor o admin).", write: true, params: [{ name: "id", in: "path", required: true }, { name: "entryId", in: "path", required: true }] },
  { method: "GET", path: "/api/v1/tasks/{id}/tags", group: "Tareas", summary: "Etiquetas de la tarea.", params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/tasks/{id}/tags", group: "Tareas", summary: "Añade una etiqueta.", permission: "editar_tareas", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "label", required: true, type: "string" }, { name: "color", type: "string" }] },
  { method: "DELETE", path: "/api/v1/tasks/{id}/tags/{tagId}", group: "Tareas", summary: "Quita una etiqueta.", permission: "editar_tareas", write: true, params: [{ name: "id", in: "path", required: true }, { name: "tagId", in: "path", required: true }] },
  { method: "GET", path: "/api/v1/tasks/{id}/watchers", group: "Tareas", summary: "Seguidores de la tarea.", params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/tasks/{id}/watchers", group: "Tareas", summary: "Añade un seguidor.", permission: "editar_tareas", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "userId", required: true, type: "string" }] },
  { method: "DELETE", path: "/api/v1/tasks/{id}/watchers/{userId}", group: "Tareas", summary: "Quita un seguidor.", permission: "editar_tareas", write: true, params: [{ name: "id", in: "path", required: true }, { name: "userId", in: "path", required: true }] },

  // ── Comercial (cotizaciones) ──
  { method: "POST", path: "/api/v1/quotes", group: "Comercial", summary: "Crea una cotización (código COT secuencial).", permission: "crear_cotizaciones", write: true, body: [{ name: "clientId", required: true, type: "string" }, { name: "title", type: "string" }, { name: "projectId", type: "string" }, { name: "recipientName", type: "string" }] },
  { method: "GET", path: "/api/v1/quotes/{id}", group: "Comercial", summary: "Detalle con líneas y totales.", permission: "ver_finanzas", params: [{ name: "id", in: "path", required: true }] },
  { method: "PATCH", path: "/api/v1/quotes/{id}", group: "Comercial", summary: "Edita metadatos (no si está APROBADA).", permission: "crear_cotizaciones", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "title", type: "string" }, { name: "taxRate", type: "number" }, { name: "contingencyPct", type: "number" }, { name: "notes", type: "string" }, { name: "recipientName", type: "string" }, { name: "recipientCity", type: "string" }, { name: "intro", type: "string" }, { name: "scope", type: "string" }, { name: "deliverables", type: "string" }, { name: "validUntil", type: "string" }] },
  { method: "POST", path: "/api/v1/quotes/{id}/status", group: "Comercial", summary: "Cambia el estado (BORRADOR/ENVIADA/APROBADA/RECHAZADA).", permission: "enviar/aprobar_cotizaciones", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "status", required: true, type: "string" }] },
  { method: "POST", path: "/api/v1/quotes/{id}/items", group: "Comercial", summary: "Añade una línea.", permission: "crear_cotizaciones", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "description", required: true, type: "string" }, { name: "section", type: "string" }, { name: "unit", type: "string" }, { name: "quantity", type: "number" }, { name: "unitPrice", type: "number" }] },
  { method: "PATCH", path: "/api/v1/quotes/{id}/items/{itemId}", group: "Comercial", summary: "Edita una línea.", permission: "crear_cotizaciones", write: true, params: [{ name: "id", in: "path", required: true }, { name: "itemId", in: "path", required: true }], body: [{ name: "description", type: "string" }, { name: "section", type: "string" }, { name: "unit", type: "string" }, { name: "quantity", type: "number" }, { name: "unitPrice", type: "number" }] },
  { method: "DELETE", path: "/api/v1/quotes/{id}/items/{itemId}", group: "Comercial", summary: "Borra una línea.", permission: "crear_cotizaciones", write: true, params: [{ name: "id", in: "path", required: true }, { name: "itemId", in: "path", required: true }] },

  // ── Comercial (facturación) ──
  { method: "GET", path: "/api/v1/invoices", group: "Comercial", summary: "Facturas de clientes accesibles.", permission: "ver_finanzas", params: [{ name: "status", in: "query" }] },
  { method: "POST", path: "/api/v1/invoices", group: "Comercial", summary: "Genera la factura de una cotización APROBADA.", permission: "crear_cotizaciones", write: true, body: [{ name: "quoteId", required: true, type: "string" }] },
  { method: "GET", path: "/api/v1/invoices/{id}", group: "Comercial", summary: "Detalle de factura con líneas y total.", permission: "ver_finanzas", params: [{ name: "id", in: "path", required: true }] },
  { method: "PATCH", path: "/api/v1/invoices/{id}", group: "Comercial", summary: "Edita fechas/impuesto/notas.", permission: "crear_cotizaciones", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "issueDate", type: "string" }, { name: "dueDate", type: "string" }, { name: "taxRate", type: "number" }, { name: "notes", type: "string" }] },
  { method: "POST", path: "/api/v1/invoices/{id}/status", group: "Comercial", summary: "Cambia el estado (PAGADA fija la fecha de pago).", permission: "aprobar_cotizaciones", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "status", required: true, type: "string" }] },
  { method: "DELETE", path: "/api/v1/invoices/{id}", group: "Comercial", summary: "Borra la factura (solo admin).", write: true, params: [{ name: "id", in: "path", required: true }] },

  // ── Notificaciones ──
  { method: "GET", path: "/api/v1/notifications", group: "Notificaciones", summary: "Notificaciones del titular (+ contador sin leer).", params: [{ name: "unread", in: "query" }, { name: "take", in: "query" }] },
  { method: "PATCH", path: "/api/v1/notifications/{id}", group: "Notificaciones", summary: "Marca una como leída.", write: true, params: [{ name: "id", in: "path", required: true }] },
  { method: "DELETE", path: "/api/v1/notifications/{id}", group: "Notificaciones", summary: "Borra una notificación.", write: true, params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/notifications/read-all", group: "Notificaciones", summary: "Marca todas como leídas.", write: true },

  // ── Actividad / auditoría ──
  { method: "GET", path: "/api/v1/activity", group: "Actividad", summary: "Registro de actividad (auditoría).", permission: "ver_actividad", params: [{ name: "project", in: "query" }, { name: "client", in: "query" }, { name: "take", in: "query" }] },

  // ── Chat ──
  { method: "GET", path: "/api/v1/chat/channels", group: "Chat", summary: "Canales que el titular puede ver.", },
  { method: "GET", path: "/api/v1/chat/channels/{id}/messages", group: "Chat", summary: "Mensajes recientes del canal.", params: [{ name: "id", in: "path", required: true }, { name: "take", in: "query" }] },
  { method: "POST", path: "/api/v1/chat/channels/{id}/messages", group: "Chat", summary: "Envía un mensaje de texto (se publica en vivo).", permission: "comentar", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "body", required: true, type: "string" }, { name: "parentId", type: "string" }] },

  // ── Wiki ──
  { method: "GET", path: "/api/v1/wiki/pages", group: "Wiki", summary: "Páginas de la Wiki (equipo interno con ver_wiki).", permission: "ver_wiki", params: [{ name: "q", in: "query" }, { name: "section", in: "query" }] },
  { method: "POST", path: "/api/v1/wiki/pages", group: "Wiki", summary: "Crea una página.", permission: "editar_wiki", write: true, body: [{ name: "title", type: "string" }, { name: "icon", type: "string" }, { name: "content", type: "string" }, { name: "section", type: "string" }, { name: "tags", type: "string[]" }] },
  { method: "GET", path: "/api/v1/wiki/pages/{id}", group: "Wiki", summary: "Página completa (contenido).", permission: "ver_wiki", params: [{ name: "id", in: "path", required: true }] },
  { method: "PATCH", path: "/api/v1/wiki/pages/{id}", group: "Wiki", summary: "Edita una página.", permission: "editar_wiki", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "title", type: "string" }, { name: "icon", type: "string" }, { name: "content", type: "string" }, { name: "section", type: "string" }, { name: "tags", type: "string[]" }] },
  { method: "DELETE", path: "/api/v1/wiki/pages/{id}", group: "Wiki", summary: "Borra una página.", permission: "editar_wiki", write: true, params: [{ name: "id", in: "path", required: true }] },

  // ── Propuestas ──
  { method: "GET", path: "/api/v1/proposals", group: "Propuestas", summary: "Propuestas de clientes accesibles.", permission: "crear_cotizaciones", params: [{ name: "status", in: "query" }] },
  { method: "GET", path: "/api/v1/proposals/{id}", group: "Propuestas", summary: "Detalle (estado, cliente, bloques, visitas).", permission: "crear_cotizaciones", params: [{ name: "id", in: "path", required: true }] },
  { method: "PATCH", path: "/api/v1/proposals/{id}", group: "Propuestas", summary: "Edita metadatos (título/caducidad/cliente).", permission: "crear_cotizaciones", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "title", type: "string" }, { name: "expiresAt", type: "string" }, { name: "clientId", type: "string" }] },
  { method: "POST", path: "/api/v1/proposals/{id}/status", group: "Propuestas", summary: "Cambia el estado (ACEPTADA exige aprobar_cotizaciones).", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "status", required: true, type: "string" }] },
  { method: "DELETE", path: "/api/v1/proposals/{id}", group: "Propuestas", summary: "Borra la propuesta.", permission: "crear_cotizaciones", write: true, params: [{ name: "id", in: "path", required: true }] },

  // ── Biblioteca ──
  { method: "GET", path: "/api/v1/library", group: "Biblioteca", summary: "Recursos de la biblioteca del equipo.", permission: "ver_biblioteca", params: [{ name: "q", in: "query" }, { name: "category", in: "query" }] },
  { method: "POST", path: "/api/v1/library", group: "Biblioteca", summary: "Añade un recurso (enlace url o ruta de NAS path).", permission: "gestionar_biblioteca", write: true, body: [{ name: "name", required: true, type: "string" }, { name: "url", type: "string" }, { name: "path", type: "string" }, { name: "category", type: "string" }] },
  { method: "DELETE", path: "/api/v1/library/{id}", group: "Biblioteca", summary: "Borra un recurso (gestor o dueño).", write: true, params: [{ name: "id", in: "path", required: true }] },

  // ── Equipos / inventario ──
  { method: "GET", path: "/api/v1/projects/{id}/equipment-plans", group: "Equipos", summary: "Grabaciones (planes de equipos) del proyecto con sus reservas.", params: [{ name: "id", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/projects/{id}/equipment-plans", group: "Equipos", summary: "Crea una grabación.", write: true, params: [{ name: "id", in: "path", required: true }], body: [{ name: "shootDate", required: true, type: "string" }, { name: "title", type: "string" }] },
  { method: "PATCH", path: "/api/v1/equipment-plans/{planId}", group: "Equipos", summary: "Edita la grabación (título/fecha/estado).", write: true, params: [{ name: "planId", in: "path", required: true }], body: [{ name: "title", type: "string" }, { name: "shootDate", type: "string" }, { name: "status", type: "string" }] },
  { method: "DELETE", path: "/api/v1/equipment-plans/{planId}", group: "Equipos", summary: "Borra la grabación.", write: true, params: [{ name: "planId", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/equipment-plans/{planId}/reservations", group: "Equipos", summary: "Reserva un item del inventario.", write: true, params: [{ name: "planId", in: "path", required: true }], body: [{ name: "rowId", required: true, type: "string" }, { name: "quantity", type: "number" }, { name: "note", type: "string" }] },
  { method: "PATCH", path: "/api/v1/equipment-plans/{planId}/reservations/{reservationId}", group: "Equipos", summary: "Edita una reserva (cantidad/empacado/nota).", write: true, params: [{ name: "planId", in: "path", required: true }, { name: "reservationId", in: "path", required: true }], body: [{ name: "quantity", type: "number" }, { name: "packed", type: "boolean" }, { name: "note", type: "string" }] },
  { method: "DELETE", path: "/api/v1/equipment-plans/{planId}/reservations/{reservationId}", group: "Equipos", summary: "Quita una reserva.", write: true, params: [{ name: "planId", in: "path", required: true }, { name: "reservationId", in: "path", required: true }] },
  { method: "POST", path: "/api/v1/equipment-plans/{planId}/apply-kit", group: "Equipos", summary: "Aplica un kit guardado como reservas.", write: true, params: [{ name: "planId", in: "path", required: true }], body: [{ name: "kitId", required: true, type: "string" }] },
  { method: "GET", path: "/api/v1/equipment-kits", group: "Equipos", summary: "Kits de equipos guardados (plantillas).", },
  { method: "GET", path: "/api/v1/inventory", group: "Equipos", summary: "Inventario de equipos (filas + rowId para reservar).", permission: "ver_wiki" },

  // ── Tablas de datos ──
  { method: "GET", path: "/api/v1/tables", group: "Tablas", summary: "Tablas de datos visibles (proyecto/wiki).", },
  { method: "GET", path: "/api/v1/tables/{id}", group: "Tablas", summary: "Detalle: columnas y filas con valores.", params: [{ name: "id", in: "path", required: true }] },
];

// Agrupa el catálogo para el índice legible: { grupo: ["METHOD /path — resumen", ...] }.
export function groupedCatalog(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of API_ENDPOINTS) {
    (out[e.group] ??= []).push(`${e.method} ${e.path} — ${e.summary}`);
  }
  return out;
}

// Construye un documento OpenAPI 3.1 mínimo pero válido desde el catálogo.
export function buildOpenApi(origin: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of API_ENDPOINTS) {
    const item = (paths[e.path] ??= {});
    const parameters = (e.params ?? []).map((p) => ({
      name: p.name,
      in: p.in,
      required: p.in === "path" ? true : !!p.required,
      description: p.desc,
      schema: { type: p.type?.endsWith("[]") ? "array" : "string" },
    }));
    const op: Record<string, unknown> = {
      summary: e.summary,
      tags: [e.group],
      operationId: `${e.method.toLowerCase()}${e.path.replace(/[^a-zA-Z0-9]+/g, "_")}`,
      security: [{ bearerAuth: [] }],
      responses: {
        "200": { description: "OK" },
        "401": { description: "Credencial ausente o inválida" },
        "403": { description: "Sin permiso / solo lectura" },
        "404": { description: "No encontrado" },
      },
    };
    if (parameters.length) op.parameters = parameters;
    if (e.body?.length) {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const f of e.body) {
        properties[f.name] = { type: f.type?.endsWith("[]") ? "array" : f.type === "boolean" ? "boolean" : "string", description: f.desc };
        if (f.required) required.push(f.name);
      }
      op.requestBody = {
        required: required.length > 0,
        content: { "application/json": { schema: { type: "object", properties, ...(required.length ? { required } : {}) } } },
      };
    }
    item[e.method.toLowerCase()] = op;
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Labstream OS API v1",
      version: "1.0.0",
      description:
        "Control total de Labstream OS para agentes e integraciones. Cada credencial (Bearer lsk_…) hereda los permisos de su titular ∩ los scopes de la llave; una llave sin scopes con titular admin tiene control total. No cubre administración de Configuración (usuarios/roles/integraciones).",
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "lsk", description: "Clave de API de Labstream (Authorization: Bearer lsk_…)." },
      },
    },
    security: [{ bearerAuth: [] }],
    paths,
  };
}
