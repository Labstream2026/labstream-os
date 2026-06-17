import { db } from "@/lib/db";
import type { CostSection } from "@/lib/proposals/budget";

// Catálogo INTERNO de servicios de Labstream (lista de precios estandarizada para sacar
// nuestros costos; NO se muestra al cliente). Aquí viven los tipos de servicio, el
// sembrado inicial de ítems (precios en 0 para que el equipo los complete) y los
// ayudantes para leer/sembrar el catálogo.

export type ServiceType = { key: string; label: string; icon: string };

export const SERVICE_TYPES: ServiceType[] = [
  { key: "streaming", label: "Streaming / transmisión en vivo", icon: "🔴" },
  { key: "video_institucional", label: "Video institucional / corporativo", icon: "🎬" },
  { key: "contenido_empresa", label: "Contenido para empresas / redes", icon: "📱" },
  { key: "contenido_medico", label: "Contenido médico", icon: "🩺" },
  { key: "marca_personal", label: "Marca personal", icon: "👤" },
  { key: "cubrimiento_fotografico", label: "Cubrimiento fotográfico", icon: "📸" },
  { key: "cubrimiento_evento", label: "Cubrimiento de evento", icon: "🎟️" },
  { key: "logistica", label: "Logística y extras (aplica a todo)", icon: "🚚" },
];

export const SERVICE_TYPE_LABEL = new Map(SERVICE_TYPES.map((t) => [t.key, t]));

// Sembrado: tipo → sección → ítems [nombre, unidad]. Precio 0 (lo completa el equipo).
type SeedItem = [name: string, unit: string];
const SEED: Record<string, Record<string, SeedItem[]>> = {
  streaming: {
    "Equipo técnico": [
      ["Mezclador de video (switcher)", "día"], ["Cámara", "unidad/día"], ["Trípode / cabezal", "unidad/día"],
      ["Kit de iluminación", "día"], ["Kit de audio (consola + micrófonos)", "día"], ["Encoder / captura", "día"],
      ["Computador de gráficos", "día"], ["Monitor de referencia", "día"], ["Intercom", "día"], ["Pantalla / proyección", "día"],
    ],
    "Conectividad": [["Internet dedicado / bonding 4G", "evento"], ["Conexión de respaldo", "evento"]],
    "Equipo humano": [
      ["Director de transmisión (TD)", "día"], ["Camarógrafo (por cámara)", "día"], ["Operador de switcher", "día"],
      ["Operador de audio", "día"], ["Generación de gráficos online (operador CG)", "día"], ["Asistente técnico", "día"],
    ],
    "Plataforma": [["Configuración de plataforma (YouTube/Meet/Zoom…)", "evento"], ["Multistreaming", "evento"], ["Página / embed del evento", "evento"]],
    "Postproducción": [["Edición del VOD", "servicio"], ["Clips para redes", "unidad"]],
  },
  video_institucional: {
    "Preproducción": [["Guion", "servicio"], ["Storyboard", "servicio"], ["Scouting de locación", "día"], ["Casting", "servicio"]],
    "Producción": [
      ["Director", "día"], ["Director de fotografía (DOP)", "día"], ["Camarógrafo", "día"], ["Asistente de cámara", "día"],
      ["Sonidista", "día"], ["Iluminador (gaffer)", "día"], ["Dron + piloto", "día"], ["Alquiler de equipo (cámara/ópticas/grip)", "día"],
    ],
    "Talento": [["Presentador / actor", "día"], ["Maquillaje", "día"], ["Locución (voz en off)", "servicio"]],
    "Postproducción": [["Edición", "servicio"], ["Colorización", "servicio"], ["Motion graphics", "servicio"], ["Diseño sonoro / mezcla", "servicio"], ["Musicalización (licencia)", "servicio"], ["Subtítulos", "servicio"]],
  },
  contenido_empresa: {
    "Paquete": [["Paquete mensual de contenido", "mes"], ["Jornada de grabación", "día"]],
    "Producción": [["Fotografía de producto", "día"], ["Guion / community", "servicio"]],
    "Postproducción": [["Edición de reels / cortos", "unidad"], ["Motion graphics", "servicio"]],
  },
  contenido_medico: {
    "Producción": [["Jornada de grabación", "día"], ["Asesoría / validación científica", "servicio"]],
    "Postproducción": [["Edición de reels / cortos", "unidad"], ["Motion graphics médico", "servicio"]],
  },
  marca_personal: {
    "Servicios": [["Sesión de grabación", "día"], ["Edición", "unidad"], ["Estrategia de contenido", "mes"]],
  },
  cubrimiento_fotografico: {
    "Servicios": [["Fotógrafo (jornada)", "día"], ["Fotógrafo (hora)", "hora"], ["Edición / retoque", "unidad"], ["Entrega / galería", "servicio"]],
  },
  cubrimiento_evento: {
    "Servicios": [["Multicámara", "evento"], ["Resumen editado", "servicio"], ["Fotografía", "día"], ["Transmisión", "evento"]],
  },
  logistica: {
    "Logística": [["Alimentación / viáticos", "día"], ["Hospedaje", "noche"], ["Alquiler de locación", "día"], ["Parqueaderos", "día"], ["Transporte (vehículo)", "día"]],
  },
};

// Siembra el catálogo la PRIMERA vez (si la tabla está vacía). Idempotente.
export async function ensureServiceCatalog(): Promise<void> {
  const count = await db.serviceItem.count();
  if (count > 0) return;
  const rows: { serviceType: string; section: string; name: string; unit: string; position: number }[] = [];
  for (const type of SERVICE_TYPES) {
    const sections = SEED[type.key];
    if (!sections) continue;
    let pos = 0;
    for (const [section, items] of Object.entries(sections)) {
      for (const [name, unit] of items) rows.push({ serviceType: type.key, section, name, unit, position: pos++ });
    }
  }
  if (rows.length) await db.serviceItem.createMany({ data: rows });
}

// Ajustes (crea la fila única "default" si no existe).
export async function getQuoteSettings() {
  return db.quoteSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}

export type CatalogItem = {
  id: string; serviceType: string; section: string; name: string; detail: string | null;
  unit: string; qty: number; unitPrice: number; position: number;
};
export type CatalogGroup = { key: string; label: string; icon: string; sections: { name: string; items: CatalogItem[] }[] };

// Devuelve el catálogo agrupado por tipo de servicio → sección, para la pestaña interna.
export async function getServiceCatalog(): Promise<CatalogGroup[]> {
  const items = await db.serviceItem.findMany({ where: { active: true }, orderBy: [{ section: "asc" }, { position: "asc" }, { name: "asc" }] });
  const groups: CatalogGroup[] = [];
  for (const t of SERVICE_TYPES) {
    const ofType = items.filter((i) => i.serviceType === t.key);
    if (!ofType.length) continue;
    const sections: { name: string; items: CatalogItem[] }[] = [];
    for (const it of ofType) {
      let sec = sections.find((s) => s.name === it.section);
      if (!sec) { sec = { name: it.section, items: [] }; sections.push(sec); }
      sec.items.push(it);
    }
    groups.push({ key: t.key, label: t.label, icon: t.icon, sections });
  }
  return groups;
}

// Catálogo para el ARMADOR (wizard de propuestas): cada tipo de servicio → CostSection[]
// con ítems activables (on/q/v). Conecta los precios estandarizados de la BD al wizard,
// para que al armar la propuesta salgan los valores internos del catálogo.
export async function getCatalogForWizard(): Promise<Record<string, CostSection[]>> {
  const items = await db.serviceItem.findMany({ where: { active: true }, orderBy: [{ section: "asc" }, { position: "asc" }] });
  const byType: Record<string, CostSection[]> = {};
  for (const it of items) {
    const list = (byType[it.serviceType] ??= []);
    let sec = list.find((s) => s.s === it.section);
    if (!sec) { sec = { s: it.section, items: [] }; list.push(sec); }
    sec.items.push({ t: it.name, d: it.detail ?? "", u: it.unit, q: it.qty, v: it.unitPrice, on: true });
  }
  return byType;
}
