// ── Navegación: qué páginas se frecuentan en el navegador, y cuándo ──
//
// NO captura nada nuevo: el sensor siempre ha subido el título de la ventana activa (es lo
// que permite atribuir horas a clientes), y en un navegador ese título trae el nombre de la
// página. Aquí solo se CLASIFICA lo ya guardado, en el servidor.
//
// Reglas deliberadas:
//  · Solo se reconocen sitios de un CATÁLOGO conocido; lo demás cae en «Otros sitios», sin
//    enseñar títulos crudos — el panel habla de sitios, no del contenido de cada pestaña.
//    (Además el título viaja truncado a 140 y a veces pierde el sufijo del navegador: un
//    título partido produciría etiquetas basura si se intentara adivinar.)
//  · «ocio» es una CATEGORÍA del sitio, no un juicio del rato: un bloque de YouTube puede ser
//    un tutorial de DaVinci. El panel enseña dónde y cuándo; el contexto lo pone quien mira.

// «mensajeria» existe porque en esta operación WhatsApp es el canal de CLIENTES (todo el
// ecosistema de Evolution API existe por eso): aparece en el top de páginas pero NO suma al
// ocio — meterlo ahí habría acusado de ociosa a la persona que coordina entregas todo el día.
export type CategoriaSitio = "ocio" | "trabajo" | "mensajeria";
export type Sitio = { nombre: string; cat: CategoriaSitio };

// Navegadores que reconocemos por el nombre de la app del bloque. OJO: se compara con
// `contains`, así que nada de claves cortas que vivan dentro de otras palabras — «arc» quedó
// fuera a propósito porque casa con «Search» (el buscador de Windows contaría como navegador).
// Esta lista la consume TAMBIÉN la consulta SQL de datos.ts (exportada abajo): una sola verdad.
export const NAVEGADORES = ["chrome", "edge", "firefox", "brave", "opera", "vivaldi", "safari"];

export function esNavegador(app: string): boolean {
  const a = app.toLowerCase();
  // Los hosts WebView2 («Microsoft Edge WebView2», msedgewebview2) son apps de escritorio
  // con motor de Edge embebido — widgets, instaladores, paneles — no navegación de nadie.
  if (a.includes("webview")) return false;
  return NAVEGADORES.some((n) => a.includes(n));
}

// El catálogo: [palabra clave en el título (minúsculas), nombre visible, categoría].
// Dos reglas anti-mentira, ambas cobradas en revisión:
//  · Las claves cortas van RODEADAS de espacios y se comparan contra el título con relleno:
//    «shein» a secas casa con «Sheinbaum», «temu» con «Temuco», «canva» con «canvas» y
//    «claude» con «Claudia» — un titular de prensa contaba como compras de ocio.
//  · NO gana el primero del catálogo: gana la coincidencia MÁS TARDÍA en el título (ver
//    sitioDe). El sufijo real del sitio va al final («Guion reel Instagram - Documentos de
//    Google»): con «primero gana», el guion de un reel para Instagram contaba como ocio en
//    Instagram — el caso COMÚN de una productora de contenido, no el raro.
const CATALOGO: [string, string, CategoriaSitio][] = [
  // Ocio / redes
  ["youtube", "YouTube", "ocio"],
  ["instagram", "Instagram", "ocio"],
  ["facebook", "Facebook", "ocio"],
  ["tiktok", "TikTok", "ocio"],
  ["netflix", "Netflix", "ocio"],
  ["twitch", "Twitch", "ocio"],
  ["reddit", "Reddit", "ocio"],
  ["pinterest", "Pinterest", "ocio"],
  ["spotify", "Spotify", "ocio"],
  ["disney+", "Disney+", "ocio"],
  ["prime video", "Prime Video", "ocio"],
  ["mercado libre", "Mercado Libre", "ocio"],
  ["mercadolibre", "Mercado Libre", "ocio"],
  [" amazon ", "Amazon", "ocio"], // con bordes: «Amazonas» no es ir de compras
  [" temu ", "Temu", "ocio"], // con bordes: Temuco
  [" shein ", "Shein", "ocio"], // con bordes: Sheinbaum
  [" / x ", "X (Twitter)", "ocio"], // los títulos de X terminan en «/ X»; con bordes: «3 / xx» no casa
  ["twitter", "X (Twitter)", "ocio"],
  // Mensajería: cuenta como página frecuente pero NO como ocio (canal de clientes aquí).
  ["whatsapp", "WhatsApp", "mensajeria"],
  [" telegram ", "Telegram", "mensajeria"], // con bordes: «telegrama»
  // Trabajo
  ["labstream", "Labstream OS", "trabajo"],
  ["frame.io", "Frame.io", "trabajo"],
  ["documentos de google", "Google Docs", "trabajo"],
  ["google docs", "Google Docs", "trabajo"],
  ["hojas de cálculo", "Google Sheets", "trabajo"],
  ["google sheets", "Google Sheets", "trabajo"],
  ["google drive", "Google Drive", "trabajo"],
  ["gmail", "Gmail", "trabajo"],
  ["google calendar", "Google Calendar", "trabajo"],
  [" notion ", "Notion", "trabajo"], // con bordes: emotion/promotion
  [" canva ", "Canva", "trabajo"], // con bordes: canvas
  ["chatgpt", "ChatGPT", "trabajo"],
  [" claude ", "Claude", "trabajo"], // con bordes: Claudia
  ["gemini", "Gemini", "trabajo"],
  ["wetransfer", "WeTransfer", "trabajo"],
  ["dropbox", "Dropbox", "trabajo"],
  ["vimeo", "Vimeo", "trabajo"],
  ["github", "GitHub", "trabajo"],
  ["envato", "Envato", "trabajo"],
  ["artlist", "Artlist", "trabajo"],
  ["epidemic sound", "Epidemic Sound", "trabajo"],
  ["freepik", "Freepik", "trabajo"],
];

// Clasifica el título de una ventana de navegador. null = sitio no reconocido («Otros»).
// Gana la coincidencia MÁS TARDÍA: el nombre del documento va al principio del título y el
// sitio real al final, así que «lo de más a la derecha» es el sitio de verdad. Si el título
// llegó truncado sin sufijo, degrada al comportamiento simple — aceptable.
export function sitioDe(titulo: string): Sitio | null {
  const t = ` ${titulo.toLowerCase()} `;
  let mejor: { pos: number; sitio: Sitio } | null = null;
  for (const [clave, nombre, cat] of CATALOGO) {
    const pos = t.lastIndexOf(clave);
    if (pos < 0) continue;
    if (!mejor || pos > mejor.pos) mejor = { pos, sitio: { nombre, cat } };
  }
  return mejor ? mejor.sitio : null;
}

// Franja del día en Bogotá (UTC-5 fijo, sin horario de verano) para «en qué horarios».
export const FRANJAS = ["Madrugada (12–6 a. m.)", "Mañana (6–12)", "Tarde (12–6 p. m.)", "Noche (6–12 p. m.)"] as const;

export function franjaDe(startedAt: Date): number {
  const horaBogota = (startedAt.getUTCHours() + 24 - 5) % 24;
  if (horaBogota < 6) return 0;
  if (horaBogota < 12) return 1;
  if (horaBogota < 18) return 2;
  return 3;
}
