import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity";
import type { ToolDef } from "./client";

// ── El carril de los DESCONOCIDOS ──────────────────────────────────────────────
// Cuando el asistente atiende a un número que no está en ninguna ficha, no se le da una sesión
// recortada: se le da OTRO PROGRAMA. Este archivo es ese programa entero. No importa `session`,
// no importa `hasPermission`, no importa `accessibleProjectWhere` — no porque se confíe en que
// nadie los llame, sino porque no están aquí. La única tabla que este código sabe tocar es Lead.
//
// Por qué así y no con permisos: un rol «lead» dentro del catálogo normal deja 40 herramientas a
// un `if` de distancia de un extraño, y basta un permiso mal puesto —o un rol por defecto que
// alguien toque en Configuración dentro de seis meses— para que se filtre algo. Un ejecutor
// aparte no tiene esa clase de fallo: para filtrar un proyecto habría que escribir aquí el
// código que lo consulta.
//
// Lo que un extraño puede hacer, completo: enterarse de qué hacemos, saber cómo contactarnos y
// dejar sus datos. Nada más.

// Información PÚBLICA de Labstream: lo mismo que cualquiera lee en labstreamsas.com. Vive en
// código y no en la base de datos a propósito — así no hay ninguna consulta que pueda devolver
// de más, y cambiarla es un commit revisable y no un clic.
// OJO al mantenerla: aquí NO van precios, ni tarifas, ni nombres de clientes, ni plazos
// comprometidos. Eso se cotiza persona a persona.
const LINEAS_DE_SERVICIO = [
  { nombre: "Video corporativo e institucional", detalle: "Piezas de marca, videos de compañía, testimoniales y contenido para comunicación interna." },
  { nombre: "Comerciales y publicidad", detalle: "Producción de comerciales para televisión, redes y campañas digitales." },
  { nombre: "Contenido para redes sociales", detalle: "Formatos verticales, reels y series de contenido con producción continua." },
  { nombre: "Cobertura de eventos", detalle: "Registro audiovisual de eventos, congresos y activaciones de marca." },
  { nombre: "Producción con inteligencia artificial", detalle: "Generación y asistencia con IA aplicada a video, imagen y postproducción." },
  { nombre: "Postproducción", detalle: "Edición, color, gráficos animados, sonido y entrega en todos los formatos." },
];

const SOBRE_LABSTREAM = {
  empresa: "Labstream Studio",
  que_hacemos: "Creación de contenido audiovisual e inteligencia artificial.",
  trayectoria: "Más de 10 años de experiencia.",
  pais: "Colombia",
  sitio_web: "https://labstreamsas.com",
  como_cotizamos:
    "Cada proyecto se cotiza a la medida según alcance, duración y formato. Para dar un valor necesitamos hablar contigo: el asistente no maneja tarifas.",
};

// ── Definición de las herramientas que ve un desconocido ───────────────────────
// Son TRES. Corto no es solo prudente: el catálogo viaja en cada mensaje al modelo, así que
// atender a un extraño cuesta una fracción de lo que cuesta atender al equipo.
export const PUBLIC_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "public_services",
      description:
        "Qué hace Labstream Studio y qué tipos de proyecto produce. Úsalo cuando alguien de fuera pregunta a qué nos dedicamos o si hacemos cierto tipo de trabajo. No incluye precios: los proyectos se cotizan a la medida.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "public_contact",
      description:
        "Cómo contactar a Labstream Studio y qué pasa después de dejar los datos. Úsalo cuando alguien de fuera pregunta por horarios, correo, sitio web o cuándo le responderán.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "register_lead",
      description:
        "Guarda los datos de alguien de fuera que quiere que lo contactemos, para que el equipo comercial lo atienda. Llámalo UNA vez cuando ya tengas al menos su nombre y qué necesita. Si vuelve a escribir con más información, llámalo otra vez: se actualiza su ficha, no se duplica.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string", description: "Nombre de la persona (obligatorio; pregúntaselo si no lo ha dicho)." },
          interes: { type: "string", description: "Qué tipo de proyecto o servicio necesita, en sus palabras." },
          empresa: { type: "string", description: "Empresa o marca, si la mencionó (opcional)." },
          email: { type: "string", description: "Correo, si lo dio (opcional)." },
          mensaje: { type: "string", description: "Resumen de lo que contó: qué quiere, para cuándo, contexto (opcional)." },
          presupuesto: { type: "string", description: "Presupuesto o rango que ÉL mencionó, tal cual (opcional). Nunca le propongas tú una cifra." },
        },
        required: ["nombre"],
      },
    },
  },
];

// Alias en español (lo que el modelo ve en tools/list) → nombre interno.
export const PUBLIC_ALIAS_TO_TOOL: Record<string, string> = {
  consultar_servicios_publicos: "public_services",
  consultar_contacto_publico: "public_contact",
  registrar_lead: "register_lead",
};
export const PUBLIC_TOOL_TO_ALIAS: Record<string, string> = {};
for (const [es, en] of Object.entries(PUBLIC_ALIAS_TO_TOOL)) if (!(en in PUBLIC_TOOL_TO_ALIAS)) PUBLIC_TOOL_TO_ALIAS[en] = es;

// Recorta y limpia lo que escribe un desconocido antes de guardarlo. Un extraño puede mandar lo
// que quiera y su texto acaba en una pantalla del equipo, así que se acota el tamaño y se quitan
// los caracteres de control.
function campo(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  // Los caracteres de control se filtran por CODIGO y no con una expresion regular: un rango
  // de control dentro de una regex es justo lo que prohibe `no-control-regex`, y ademas asi se
  // lee lo que hace.
  let limpio = "";
  for (const ch of v) {
    const c = ch.codePointAt(0) ?? 0;
    limpio += c < 32 || c === 127 ? " " : ch;
  }
  limpio = limpio.replace(/\s+/g, " ").trim();
  if (!limpio) return null;
  return limpio.slice(0, max);
}

// Contexto de quien escribe: su número (ya normalizado por la pasarela) y por dónde entró.
export type PublicContext = { phone: string; canal?: string; ip?: string | null };

// Ejecuta una herramienta del carril público. Devuelve texto, igual que executeAgentTool, para
// que la capa MCP no tenga que distinguirlas.
export async function executePublicTool(name: string, args: Record<string, unknown>, pub: PublicContext): Promise<string> {
  switch (name) {
    case "public_services":
      return JSON.stringify({ ...SOBRE_LABSTREAM, lineas_de_servicio: LINEAS_DE_SERVICIO });

    case "public_contact":
      return JSON.stringify({
        sitio_web: SOBRE_LABSTREAM.sitio_web,
        por_este_medio: "Puedes dejar aquí mismo tu nombre y qué necesitas; el equipo comercial te escribe.",
        horario_de_atencion: "Lunes a viernes, horario de oficina (Colombia, GMT-5). Fuera de ese horario el mensaje queda registrado igual.",
        tiempo_de_respuesta: "Normalmente el mismo día hábil.",
        nota: "El asistente no cotiza ni compromete precios ni fechas: eso lo confirma una persona del equipo.",
      });

    case "register_lead": {
      const nombre = campo(args.nombre, 120);
      if (!nombre) return "Falta el nombre de la persona. Pregúntaselo antes de registrar.";
      // Freno por número: un extraño no debe poder llenar la tabla a fuerza de mensajes.
      if (!rateLimit(`lead:${pub.phone}`, 6, 60 * 60_000)) {
        return "Ya registramos tus datos hace un momento. El equipo te va a contactar; no hace falta enviarlos de nuevo.";
      }
      const interes = campo(args.interes, 300);
      const empresa = campo(args.empresa, 160);
      const email = campo(args.email, 160);
      const mensaje = campo(args.mensaje, 2000);
      const presupuesto = campo(args.presupuesto, 160);

      // Si ya escribió antes y su caso sigue vivo, se ACTUALIZA su ficha. Sin esto, alguien que
      // escribe tres días seguidos aparecería como tres prospectos distintos y el equipo llamaría
      // tres veces. Los cerrados (GANADO/PERDIDO) no se reabren: una consulta nueva es un caso nuevo.
      const previo = await db.lead.findFirst({
        where: { telefono: pub.phone, estado: { notIn: ["GANADO", "PERDIDO"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, mensaje: true },
      });

      if (previo) {
        // El relato se acumula (lo nuevo debajo), acotado para que no crezca sin fin.
        const acumulado = mensaje && mensaje !== previo.mensaje ? `${previo.mensaje ? `${previo.mensaje}\n— — —\n` : ""}${mensaje}`.slice(-4000) : previo.mensaje;
        await db.lead.update({
          where: { id: previo.id },
          data: {
            nombre,
            ...(interes ? { interes } : {}),
            ...(empresa ? { empresa } : {}),
            ...(email ? { email } : {}),
            ...(presupuesto ? { presupuesto } : {}),
            mensaje: acumulado,
          },
        });
        await logActivity({
          action: "lead.update",
          summary: `${nombre} amplió su solicitud por el asistente de WhatsApp`,
          actorName: nombre,
          userId: null,
          entityType: "lead",
          entityId: previo.id,
          ip: pub.ip ?? null,
          meta: { telefono: pub.phone, canal: pub.canal ?? "whatsapp", via: "mcp-publico" },
          silent: true,
        }).catch(() => null);
        return JSON.stringify({ ok: true, mensaje: `Actualicé los datos de ${nombre}. El equipo comercial ya los tiene.` });
      }

      const lead = await db.lead.create({
        data: { nombre, telefono: pub.phone, email, empresa, interes, mensaje, presupuesto, canal: pub.canal ?? "whatsapp", estado: "NUEVO" },
        select: { id: true },
      });
      // Este SÍ hace ruido (sin `silent`): un prospecto nuevo es justo lo que el equipo quiere ver.
      await logActivity({
        action: "lead.create",
        summary: `Nuevo prospecto: ${nombre}${empresa ? ` (${empresa})` : ""}${interes ? ` — ${interes}` : ""}, por el asistente de WhatsApp`,
        actorName: nombre,
        userId: null,
        entityType: "lead",
        entityId: lead.id,
        ip: pub.ip ?? null,
        meta: { telefono: pub.phone, canal: pub.canal ?? "whatsapp", via: "mcp-publico" },
      }).catch(() => null);
      return JSON.stringify({ ok: true, mensaje: `Listo, ${nombre}: registré tus datos y el equipo comercial te va a contactar.` });
    }

    default:
      // Cualquier otro nombre —incluido el de una herramienta interna real— muere aquí.
      return "Esa herramienta no existe en este canal. Desde aquí solo puedo contarte qué hacemos, cómo contactarnos y tomar tus datos.";
  }
}
