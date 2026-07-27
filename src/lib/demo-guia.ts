// ── GUÍA DE LA APP ──
// Qué es cada sección, para qué sirve y qué probar. Es DATO puro (sin JSX) para poder
// importarlo desde servidor y desde cliente. Lo usa /guia y el panel de Modo demo.
//
// Deliberadamente NO se documentan Facturación ni Propuestas (decisión del usuario).

export type Funcion = {
  ruta: string;
  emoji: string;
  nombre: string;
  // Una frase: qué es.
  que: string;
  // Para qué sirve en el día a día del estudio.
  para: string;
  // Qué mirar/probar con los datos de muestra.
  probar: string;
  // Solo la ve el rol cliente (portal), no el equipo.
  portal?: boolean;
};

export type Bloque = { titulo: string; descripcion: string; funciones: Funcion[] };

export const GUIA: Bloque[] = [
  {
    titulo: "El día a día",
    descripcion: "Por dónde se empieza cada mañana y dónde vive lo que tienes que hacer.",
    funciones: [
      {
        ruta: "/",
        emoji: "🏠",
        nombre: "Inicio",
        que: "El panel de arranque del equipo.",
        para: "Ver de un vistazo qué pasó desde ayer, qué proyectos están vivos, qué tareas te tocan y qué está bloqueado, sin abrir nada más.",
        probar: "Mira la carga del equipo y la actividad reciente: ahí aparece el proyecto de muestra recién creado.",
      },
      {
        ruta: "/mis-tareas",
        emoji: "✅",
        nombre: "Mis tareas",
        que: "Todo lo tuyo, de todos los proyectos, en un solo sitio.",
        para: "Trabajar sin ir proyecto por proyecto: se agrupa en Vencidas, Hoy, Esta semana y Más adelante, y puedes arrancar el cronómetro de una tarea.",
        probar: "Verás una tarea VENCIDA y otra para hoy. Abre una y mira el detalle: checklist, estimación y comentarios.",
      },
      {
        ruta: "/recordatorios",
        emoji: "⏰",
        nombre: "Recordatorios",
        que: "Avisos puntuales o repetidos, para ti o para alguien del equipo.",
        para: "Que no se te pase algo que no es una tarea («avisar al cliente el viernes») y avisar X minutos antes de una cita o una entrega.",
        probar: "Hay un recordatorio de muestra atado a la revisión del corte.",
      },
      {
        ruta: "/notas",
        emoji: "📝",
        nombre: "Notas",
        que: "Apuntes rápidos, propios o compartidos con el equipo.",
        para: "Guardar ideas, referencias y minutas sin montar un documento. Se pueden fijar, colgar de un proyecto y convertir líneas en tareas.",
        probar: "Abre la nota de muestra con las ideas del comercial.",
      },
    ],
  },
  {
    titulo: "Clientes y proyectos",
    descripcion: "El corazón del estudio: para quién trabajas y en qué.",
    funciones: [
      {
        ruta: "/clientes",
        emoji: "👤",
        nombre: "Clientes",
        que: "Las cuentas del estudio con toda su historia.",
        para: "Tener en un sitio los proyectos de cada cliente, su material, sus citas y su gente. Se archivan sin borrarse.",
        probar: "Entra al cliente de muestra: en su ficha están los proyectos, el calendario y el material de la cuenta.",
      },
      {
        ruta: "/proyectos",
        emoji: "🎬",
        nombre: "Proyectos",
        que: "Toda la producción del estudio en un tablero.",
        para: "Ver en qué punto está cada trabajo y moverlo de estado arrastrando (de preproducción a rodaje, a edición, a revisión…).",
        probar: "El proyecto de muestra está EN PRODUCCIÓN. Arrástralo a otra columna para ver cómo cambia.",
      },
      {
        ruta: "/proyectos",
        emoji: "🗂️",
        nombre: "Ficha del proyecto",
        que: "El espacio de trabajo de un proyecto concreto.",
        para: "Es donde vive el trabajo: Resumen, Tareas, Calendario, Cronograma, Entregables, Archivos, Equipos y Actividad, cada uno en su pestaña.",
        probar: "Abre el proyecto de muestra y recorre las pestañas: verás tareas, una cita, un entregable y el chat del proyecto.",
      },
      {
        ruta: "/plantillas",
        emoji: "🗂️",
        nombre: "Plantillas",
        que: "Flujos y documentos reutilizables.",
        para: "No empezar de cero: al crear un proyecto puedes aplicar una plantilla con sus tareas y checklists ya montados.",
        probar: "Mira cómo está armada una plantilla y aplícala al crear un proyecto nuevo.",
      },
      {
        ruta: "/papelera",
        emoji: "🗑️",
        nombre: "Papelera",
        que: "Borrado suave de proyectos y clientes.",
        para: "Sacar algo de en medio sin perderlo: queda archivado con su antigüedad y se puede restaurar.",
        probar: "Archiva el cliente de muestra y restáuralo desde aquí.",
      },
    ],
  },
  {
    titulo: "Producción y entregas",
    descripcion: "Del rodaje al visto bueno del cliente.",
    funciones: [
      {
        ruta: "/calendario",
        emoji: "📅",
        nombre: "Calendario",
        que: "Citas, rodajes, entregas e hitos de todo el estudio.",
        para: "Saber qué pasa esta semana y quién está ocupado. Se puede crear tocando una franja, arrastrar para reprogramar y suscribirlo en Google, Apple o el móvil.",
        probar: "Hay una reunión de arranque y un rodaje de muestra. Cambia entre Día, Semana, Mes y Agenda.",
      },
      {
        ruta: "/revisiones",
        emoji: "🎞️",
        nombre: "Revisiones",
        que: "La bandeja de lo que espera visto bueno.",
        para: "Aprobar o pedir cambios sobre el propio video, con comentarios anclados al segundo exacto y dibujo sobre el fotograma.",
        probar: "El entregable de muestra está en revisión interna: ábrelo y deja un comentario con marca de tiempo.",
      },
      {
        ruta: "/operaciones",
        emoji: "🗄️",
        nombre: "Operaciones",
        que: "El disco del NAS (Operaciones_LAB) dentro de la app.",
        para: "Trabajar con el material pesado donde ya vive: explorar carpetas, subir, renombrar y mover sin salir de la herramienta ni pasar por el Finder.",
        probar: "Navega las carpetas del NAS y fíjate en que lo que cambias aquí cambia en el disco de verdad.",
      },
      {
        ruta: "/biblioteca",
        emoji: "📚",
        nombre: "Biblioteca",
        que: "El material reutilizable del estudio.",
        para: "Tener a mano música, logos, plantillas y stock que se usan una y otra vez, en vez de buscarlos en discos sueltos.",
        probar: "Hay un pack de música de muestra en la biblioteca.",
      },
    ],
  },
  {
    titulo: "Comunicación",
    descripcion: "Hablar de trabajo sin perder el hilo ni salir de la app.",
    funciones: [
      {
        ruta: "/chat",
        emoji: "💬",
        nombre: "Chats",
        que: "La mensajería del estudio: canales, directos y canales de cliente.",
        para: "Que cada conversación viva junto a su proyecto, con adjuntos, hilos, reacciones y encuestas — y que no se pierda en WhatsApp.",
        probar: "El proyecto de muestra trae su canal con mensajes de ejemplo.",
      },
      {
        ruta: "/estados",
        emoji: "💬",
        nombre: "Chat del día",
        que: "El canal fijo del día a día.",
        para: "Lo de siempre: «hoy grabamos a las 2», «salgo tarde», el pulso del equipo.",
        probar: "Escribe algo y mira cómo aparece al instante para todos.",
      },
      {
        ruta: "/asistente",
        emoji: "🤖",
        nombre: "Marcebot",
        que: "El asistente con IA del estudio.",
        para: "Preguntar por el estado de las cosas y pedirle que cree o mueva trabajo («crea una tarea para el rodaje del martes»).",
        probar: "Pregúntale por el proyecto de muestra.",
      },
    ],
  },
  {
    titulo: "Conocimiento y control",
    descripcion: "Lo que el estudio sabe y cómo se mide.",
    funciones: [
      {
        ruta: "/wiki",
        emoji: "📚",
        nombre: "Wiki del equipo",
        que: "La documentación interna: cómo se hacen las cosas.",
        para: "Que el conocimiento no viva en la cabeza de una persona. Incluye Inventario (los equipos), Ubicación del material y las contraseñas compartidas (cifradas).",
        probar: "Abre la página de muestra «Cómo trabajamos».",
      },
      {
        ruta: "/reportes",
        emoji: "📊",
        nombre: "Reportes",
        que: "Las métricas de producción y del equipo.",
        para: "Ver cuánto se entrega, en qué se van las horas y si los plazos se cumplen.",
        probar: "Hay horas registradas en una tarea de muestra: aparecerán aquí.",
      },
      {
        ruta: "/ajustes",
        emoji: "⚙️",
        nombre: "Ajustes",
        que: "Tu cuenta y la configuración del sistema.",
        para: "Perfil y preferencias, usuarios y permisos, marca del estudio, integraciones, avisos y el registro de auditoría (quién hizo qué).",
        probar: "En Sistema → Modo demo puedes encender y apagar todo esto.",
      },
    ],
  },
  {
    titulo: "Lo que ve el cliente",
    descripcion: "El portal con el que entra un cliente. Ve solo lo suyo y nunca el trabajo interno.",
    funciones: [
      {
        ruta: "/inicio",
        emoji: "🏠",
        nombre: "Inicio del cliente",
        que: "Su respuesta a «¿cómo va mi proyecto?».",
        para: "Que el cliente vea la fase en la que está, qué le toca a él y las novedades, sin tener que preguntar.",
        probar: "Entra con un usuario de rol cliente para verlo.",
        portal: true,
      },
      {
        ruta: "/mis-entregas",
        emoji: "📦",
        nombre: "Mis entregas",
        que: "La sala privada de cada campaña.",
        para: "Enseñarle las piezas ya enviadas y recoger su opinión con una encuesta corta.",
        probar: "Se llena con los entregables aprobados del proyecto.",
        portal: true,
      },
      {
        ruta: "/entregas-finales",
        emoji: "🏁",
        nombre: "Entregas finales",
        que: "Su biblioteca de marca.",
        para: "Que el cliente descargue lo aprobado cuando quiera, con miniatura y en el formato que necesite.",
        probar: "Aparece todo lo que se marque como final.",
        portal: true,
      },
      {
        ruta: "/solicitudes",
        emoji: "📨",
        nombre: "Solicitudes",
        que: "El canal para pedir cosas sin chat.",
        para: "Cada petición del cliente entra como tarea del equipo y él ve su estado (Recibida → En curso → Resuelta).",
        probar: "Crea una solicitud desde el portal y mira cómo nace la tarea.",
        portal: true,
      },
    ],
  },
];

// Total de funciones documentadas (lo usa el panel para el resumen).
export const GUIA_TOTAL = GUIA.reduce((n, b) => n + b.funciones.length, 0);
