// ── Siigo, en SOLO LECTURA ─────────────────────────────────────────────────────
// Conector con el software contable de Labstream. La app enseña lo que Siigo dice
// (facturas de venta, recibos de caja, notas crédito) y JAMÁS escribe: aquí no existe
// ni una llamada de escritura — el único POST es el de autenticación, que es como Siigo
// entrega el token de lectura. La fuente de verdad contable sigue siendo Siigo.
//
// Credenciales en el .env del NAS (nunca llegan al navegador):
//   SIIGO_USERNAME    → usuario API (se crea en Siigo Nube: Configuración → Credenciales API)
//   SIIGO_ACCESS_KEY  → su access key
//   SIIGO_PARTNER_ID  → nombre con el que nos presentamos (opcional; por defecto LabstreamOS)
// Si faltan, siigoEnabled() = false y la pestaña ni aparece: nada se rompe.
//
// Siigo cobra las peticiones con cuotas diarias, así que aquí NADIE martilla la API:
// - el token dura 24 h y se cachea en memoria;
// - los datos se cachean 5 minutos (el botón «Actualizar» los invalida a mano);
// - las listas se piden por las ÚLTIMAS páginas (total_results primero) con tope de
//   páginas, en vez de confiar en filtros de fecha cuyo nombre exacto varía por recurso.

const API = "https://api.siigo.com";
const TOPE_MS = 20_000; // una API contable lenta no puede colgar la página de Facturación
const CACHE_DATOS_MS = 5 * 60_000;
const CACHE_CLIENTES_MS = 12 * 60 * 60_000; // el catálogo de clientes casi no cambia

// Ventana de lectura: las últimas N páginas de 100 por recurso. Cubre de sobra un año de
// facturación del estudio; lo más viejo siempre queda a un clic en Siigo.
const PAGINAS_FACTURAS = 8;
const PAGINAS_RECIBOS = 4;
const PAGINAS_NOTAS = 2;
const PAGINAS_COMPRAS = 4;
const PAGINAS_CLIENTES = 10;

export function siigoEnabled(): boolean {
  return Boolean(process.env.SIIGO_USERNAME && process.env.SIIGO_ACCESS_KEY);
}

function partnerId(): string {
  return process.env.SIIGO_PARTNER_ID || "LabstreamOS";
}

// ── Tipos que ve la página (normalizados, sin sorpresas del JSON de Siigo) ────

export type SiigoFactura = {
  id: string;
  nombre: string; // «FV-1-2311»
  fecha: string; // YYYY-MM-DD
  cliente: string;
  total: number; // SIEMPRE en pesos (si la factura es en divisa, convertido con su tasa)
  saldo: number; // en pesos (el libro de cartera de Siigo es COP)
  vence: string | null; // YYYY-MM-DD (del plazo de pago); null = sin plazo anotado
  dian: string | null; // estado del timbre electrónico, tal cual lo dice Siigo
  moneda: string | null; // divisa del documento si NO es COP («EUR», «USD»…)
  totalMoneda: number | null; // el total en esa divisa, para decirlo en la fila
};

export type SiigoMovimiento = {
  tipo: "FV" | "RC" | "NC";
  nombre: string;
  fecha: string;
  cliente: string;
  valor: number; // RC en positivo, NC en negativo, FV el total emitido
};

export type SiigoResumen = {
  pendiente: number;
  nPendientes: number;
  vencido: number;
  nVencidas: number;
  masViejaDias: number | null;
  facturadoMes: number;
  nFacturadoMes: number;
  recaudadoMes: number;
  nRecibosMes: number;
  // Lo que vence en los próximos 7 días (aún no vencido): anticipar, no solo reportar.
  porVencer7: number;
  nPorVencer7: number;
  // Compras (facturas de proveedor) del mes, leídas de Siigo — el gasto contable.
  comprasMes: number;
  nComprasMes: number;
};

// Compras de Siigo (FC): el gasto que SÍ pasó por contabilidad, en solo lectura.
export type SiigoCompra = { nombre: string; fecha: string; proveedor: string; total: number };

// Cartera por edades: cuánta plata pendiente hay en cada tramo de vejez.
export type SiigoEdades = { alDia: number; d1a30: number; d31a60: number; d61a90: number; mas90: number };

export type SiigoMes = { mes: string; facturado: number; recaudado: number }; // mes = YYYY-MM

export type SiigoDeudor = { cliente: string; saldo: number; n: number };

export type SiigoDatos = {
  facturas: SiigoFactura[];
  movimientos: SiigoMovimiento[];
  compras: SiigoCompra[];
  edades: SiigoEdades;
  serieMeses: SiigoMes[];
  topSaldos: SiigoDeudor[];
  resumen: SiigoResumen;
  actualizadoMs: number;
};

// `minDesdeLectura` viaja ya calculado porque la regla de pureza de React no deja mirar
// el reloj dentro de un componente — aquí, en una función corriente, sí se puede.
export type SiigoResultado = { ok: true; datos: SiigoDatos; minDesdeLectura: number; aviso?: string } | { ok: false; error: string };

// ── Lectura defensiva del JSON ajeno ───────────────────────────────────────────

type J = Record<string, unknown>;

function obj(v: unknown): J {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {};
}
function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// ── Autenticación (token de 24 h, cacheado) ────────────────────────────────────

let tokenCache: { valor: string; vence: number } | null = null;

async function autenticar(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.vence) return tokenCache.valor;
  const res = await fetch(`${API}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Partner-Id": partnerId() },
    body: JSON.stringify({ username: process.env.SIIGO_USERNAME, access_key: process.env.SIIGO_ACCESS_KEY }),
    cache: "no-store",
    signal: AbortSignal.timeout(TOPE_MS),
  });
  if (!res.ok) {
    tokenCache = null;
    if (res.status === 401 || res.status === 403) {
      throw new Error("Siigo rechazó las credenciales: revisa SIIGO_USERNAME y SIIGO_ACCESS_KEY en el .env del NAS.");
    }
    throw new Error(`Siigo no contestó a la autenticación (HTTP ${res.status}).`);
  }
  const j = obj(await res.json());
  const token = texto(j.access_token);
  if (!token) throw new Error("Siigo contestó sin token.");
  // 5 min de colchón para no usar un token a punto de vencer a mitad de una lista.
  const duraMs = (num(j.expires_in) || 86_400) * 1000 - 5 * 60_000;
  tokenCache = { valor: token, vence: Date.now() + Math.max(duraMs, 60_000) };
  return token;
}

// El ÚNICO camino hacia Siigo: GET. Que no exista otro es la garantía de solo-lectura.
async function siigoGet(ruta: string, reintento = true): Promise<J> {
  const token = await autenticar();
  const res = await fetch(`${API}${ruta}`, {
    headers: { Authorization: `Bearer ${token}`, "Partner-Id": partnerId() },
    cache: "no-store",
    signal: AbortSignal.timeout(TOPE_MS),
  });
  if (res.status === 401 && reintento) {
    tokenCache = null; // token vencido o revocado: una sola renovación y reintento
    return siigoGet(ruta, false);
  }
  if (res.status === 429) throw new Error("Siigo puso el freno (cuota de peticiones): espera unos minutos y actualiza.");
  if (!res.ok) throw new Error(`Siigo contestó HTTP ${res.status} en ${ruta.split("?")[0]}.`);
  return obj(await res.json());
}

// Las ÚLTIMAS `paginas` páginas de un recurso: primero se pregunta el total y de ahí se
// piden solo las páginas del final (los consecutivos nuevos viven ahí). Así no dependemos
// de filtros de fecha ni del orden que a Siigo le dé por usar.
async function ultimasPaginas(recurso: string, paginas: number): Promise<unknown[]> {
  const primera = await siigoGet(`${recurso}?page=1&page_size=100`);
  const total = num(obj(primera.pagination).total_results);
  const totalPaginas = Math.max(1, Math.ceil(total / 100));
  const desde = Math.max(1, totalPaginas - paginas + 1);
  const filas: unknown[] = [];
  if (desde === 1) filas.push(...lista(primera.results));
  for (let p = Math.max(desde, 2); p <= totalPaginas; p++) {
    const r = await siigoGet(`${recurso}?page=${p}&page_size=100`);
    filas.push(...lista(r.results));
  }
  return filas;
}

// ── Catálogo de clientes (id → nombre), con su propia caché larga ─────────────

let clientesCache: { mapa: Map<string, string>; vence: number } | null = null;

function nombreCliente(c: J): string {
  const partes = lista(c.name).map(texto).filter(Boolean);
  const junto = partes.join(" ").trim();
  if (junto) return junto;
  const comercial = texto(c.commercial_name).trim();
  if (comercial && comercial.toLowerCase() !== "no aplica") return comercial;
  return texto(c.identification) || "Cliente sin nombre";
}

async function mapaClientes(): Promise<Map<string, string>> {
  if (clientesCache && Date.now() < clientesCache.vence) return clientesCache.mapa;
  const filas = await ultimasPaginas("/v1/customers", PAGINAS_CLIENTES);
  const mapa = new Map<string, string>();
  for (const f of filas) {
    const c = obj(f);
    const id = texto(c.id);
    if (id) mapa.set(id, nombreCliente(c));
  }
  clientesCache = { mapa, vence: Date.now() + CACHE_CLIENTES_MS };
  return mapa;
}

// ── Fechas en el reloj del estudio (Bogotá) ────────────────────────────────────

const DIA_BOGOTA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });

function hoyBogota(): string {
  return DIA_BOGOTA.format(new Date()); // YYYY-MM-DD (en-CA da ese orden)
}

function sumarDias(iso: string, dias: number): string {
  const t = Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

// Los últimos n meses (incluido el actual) como YYYY-MM, en el reloj de Bogotá.
function ultimosMeses(n: number): string[] {
  const hoy = hoyBogota();
  let anio = Number(hoy.slice(0, 4));
  let mes = Number(hoy.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${anio}-${String(mes).padStart(2, "0")}`);
    mes--;
    if (mes === 0) {
      mes = 12;
      anio--;
    }
  }
  return out;
}

// ── Armar los datos ────────────────────────────────────────────────────────────

// Documentos en OTRA moneda: Siigo manda el total en la divisa del documento y el balance
// en pesos (el libro de cartera es COP) — sin convertir, una factura de 5.643 EUR salía
// con «saldo mayor que el total». Todo a COP con la tasa del propio documento.
function monedaDe(v: J): { codigo: string | null; tasa: number } {
  const d = obj(v.currency);
  const codigo = texto(d.code);
  return { codigo: codigo && codigo !== "COP" ? codigo : null, tasa: num(d.exchange_rate) };
}

function parseFactura(f: J, clientes: Map<string, string>): SiigoFactura | null {
  const id = texto(f.id);
  const fecha = texto(f.date).slice(0, 10);
  if (!id || !fecha) return null;
  const cli = obj(f.customer);
  const { codigo: moneda, tasa } = monedaDe(f);
  const totalDoc = num(f.total);
  const pagos = lista(f.payments).map(obj);
  // El plazo: la fecha de vencimiento más lejana de sus formas de pago (crédito a 30, etc.).
  const vence = pagos
    .map((p) => texto(p.due_date).slice(0, 10))
    .filter(Boolean)
    .sort()
    .pop() ?? null;
  // Siigo deja residuos de CENTAVOS en el balance (0,0x) de facturas ya pagadas: sin este
  // redondeo salían «Vencida · $0» en la lista de pendientes y hasta mandaban la fecha de
  // «la más vieja». Menos de un peso NO es deuda.
  const saldoCrudo = num(f.balance);
  return {
    id,
    nombre: texto(f.name) || `FV ${texto(f.number) || id.slice(0, 6)}`,
    fecha,
    cliente: clientes.get(texto(cli.id)) || texto(cli.identification) || "—",
    total: moneda && tasa > 0 ? totalDoc * tasa : totalDoc,
    saldo: saldoCrudo < 1 ? 0 : saldoCrudo,
    vence,
    dian: texto(obj(f.stamp).status) || null,
    moneda,
    totalMoneda: moneda ? totalDoc : null,
  };
}

function diasEntre(desdeISO: string, hastaISO: string): number {
  const a = Date.parse(`${desdeISO}T12:00:00Z`);
  const b = Date.parse(`${hastaISO}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : 0;
}

let datosCache: { datos: SiigoDatos; vence: number } | null = null;
let ultimoBueno: SiigoDatos | null = null; // si un refresco falla, se enseña esto con aviso
let enVuelo: Promise<SiigoResultado> | null = null; // dos pestañas a la vez = UNA lectura

export function siigoInvalidar(): void {
  datosCache = null;
}

function minutosDesde(ms: number): number {
  return Math.max(0, Math.round((Date.now() - ms) / 60_000));
}

export async function datosSiigo(): Promise<SiigoResultado> {
  if (!siigoEnabled()) return { ok: false, error: "Siigo no está conectado: faltan las credenciales en el .env." };
  if (datosCache && Date.now() < datosCache.vence) {
    return { ok: true, datos: datosCache.datos, minDesdeLectura: minutosDesde(datosCache.datos.actualizadoMs) };
  }
  if (enVuelo) return enVuelo;
  enVuelo = (async (): Promise<SiigoResultado> => {
    try {
      const clientes = await mapaClientes();
      const [crudasFacturas, crudosRecibos, crudasNotas, crudasCompras] = await Promise.all([
        ultimasPaginas("/v1/invoices", PAGINAS_FACTURAS),
        ultimasPaginas("/v1/vouchers", PAGINAS_RECIBOS).catch(() => [] as unknown[]),
        ultimasPaginas("/v1/credit-notes", PAGINAS_NOTAS).catch(() => [] as unknown[]),
        ultimasPaginas("/v1/purchases", PAGINAS_COMPRAS).catch(() => [] as unknown[]),
      ]);

      const facturas = crudasFacturas
        .map((f) => parseFactura(obj(f), clientes))
        .filter((f): f is SiigoFactura => f !== null)
        .sort((a, b) => (a.fecha === b.fecha ? b.nombre.localeCompare(a.nombre) : b.fecha.localeCompare(a.fecha)));

      // Recibos de caja: la plata que ENTRÓ. El valor puede venir en payment o en items,
      // y si el documento es en divisa, a COP con su tasa (misma regla que las facturas).
      const recibos = crudosRecibos.map((r) => {
        const v = obj(r);
        const items = lista(v.items).map(obj);
        const { codigo, tasa } = monedaDe(v);
        const valorDoc = num(obj(v.payment).value) || items.reduce((n, i) => n + num(i.value), 0) || num(v.total);
        return {
          nombre: texto(v.name) || "RC",
          fecha: texto(v.date).slice(0, 10),
          cliente: clientes.get(texto(obj(v.customer).id)) || texto(obj(v.customer).identification) || "—",
          valor: codigo && tasa > 0 ? valorDoc * tasa : valorDoc,
        };
      }).filter((r) => r.fecha);

      const notas = crudasNotas.map((n) => {
        const v = obj(n);
        const { codigo, tasa } = monedaDe(v);
        const valorDoc = num(v.total);
        return {
          nombre: texto(v.name) || "NC",
          fecha: texto(v.date).slice(0, 10),
          cliente: clientes.get(texto(obj(v.customer).id)) || texto(obj(v.customer).identification) || "—",
          valor: codigo && tasa > 0 ? valorDoc * tasa : valorDoc,
        };
      }).filter((n) => n.fecha);

      // Compras (FC): el proveedor no viene con nombre embebido — se intenta el catálogo de
      // terceros y, si no está, queda su identificación (mejor un NIT honesto que un «—»).
      const compras: SiigoCompra[] = crudasCompras
        .map((c) => {
          const v = obj(c);
          const { codigo, tasa } = monedaDe(v);
          const totalDoc = num(v.total);
          const tercero = obj(v.supplier ?? v.provider ?? v.customer);
          return {
            nombre: texto(v.name) || "FC",
            fecha: texto(v.date).slice(0, 10),
            proveedor: clientes.get(texto(tercero.id)) || texto(tercero.identification) || "—",
            total: codigo && tasa > 0 ? totalDoc * tasa : totalDoc,
          };
        })
        .filter((c) => c.fecha)
        .sort((a, b) => (a.fecha === b.fecha ? b.nombre.localeCompare(a.nombre) : b.fecha.localeCompare(a.fecha)));

      const hoy = hoyBogota();
      const mes = hoy.slice(0, 7);
      const hoyMas7 = sumarDias(hoy, 7);

      const conSaldo = facturas.filter((f) => f.saldo > 0);
      const vencidas = conSaldo.filter((f) => f.vence !== null && f.vence < hoy);
      const porVencer = conSaldo.filter((f) => f.vence !== null && f.vence >= hoy && f.vence <= hoyMas7);
      const delMes = facturas.filter((f) => f.fecha.slice(0, 7) === mes);
      const recibosMes = recibos.filter((r) => r.fecha.slice(0, 7) === mes);
      const comprasMes = compras.filter((c) => c.fecha.slice(0, 7) === mes);
      const masVieja = vencidas.map((f) => f.vence as string).sort()[0];

      // Cartera por edades: al día (con saldo pero sin vencer) y tramos por días de vencida.
      const edades: SiigoEdades = { alDia: 0, d1a30: 0, d31a60: 0, d61a90: 0, mas90: 0 };
      for (const f of conSaldo) {
        if (f.vence === null || f.vence >= hoy) {
          edades.alDia += f.saldo;
          continue;
        }
        const d = diasEntre(f.vence, hoy);
        if (d <= 30) edades.d1a30 += f.saldo;
        else if (d <= 60) edades.d31a60 += f.saldo;
        else if (d <= 90) edades.d61a90 += f.saldo;
        else edades.mas90 += f.saldo;
      }

      // Facturado vs recaudado, últimos 6 meses (con la ventana de lectura alcanza de sobra).
      const meses = ultimosMeses(6);
      const serieMeses: SiigoMes[] = meses.map((m) => ({
        mes: m,
        facturado: facturas.filter((f) => f.fecha.slice(0, 7) === m).reduce((n, f) => n + f.total, 0),
        recaudado: recibos.filter((r) => r.fecha.slice(0, 7) === m).reduce((n, r) => n + r.valor, 0),
      }));

      // Quién debe más: saldo agrupado por cliente, los 5 primeros.
      const porCliente = new Map<string, { saldo: number; n: number }>();
      for (const f of conSaldo) {
        const previo = porCliente.get(f.cliente) ?? { saldo: 0, n: 0 };
        porCliente.set(f.cliente, { saldo: previo.saldo + f.saldo, n: previo.n + 1 });
      }
      const topSaldos: SiigoDeudor[] = Array.from(porCliente.entries())
        .map(([cliente, v]) => ({ cliente, saldo: v.saldo, n: v.n }))
        .sort((a, b) => b.saldo - a.saldo)
        .slice(0, 5);

      const resumen: SiigoResumen = {
        pendiente: conSaldo.reduce((n, f) => n + f.saldo, 0),
        nPendientes: conSaldo.length,
        vencido: vencidas.reduce((n, f) => n + f.saldo, 0),
        nVencidas: vencidas.length,
        masViejaDias: masVieja ? diasEntre(masVieja, hoy) : null,
        facturadoMes: delMes.reduce((n, f) => n + f.total, 0),
        nFacturadoMes: delMes.length,
        recaudadoMes: recibosMes.reduce((n, r) => n + r.valor, 0),
        nRecibosMes: recibosMes.length,
        porVencer7: porVencer.reduce((n, f) => n + f.saldo, 0),
        nPorVencer7: porVencer.length,
        comprasMes: comprasMes.reduce((n, c) => n + c.total, 0),
        nComprasMes: comprasMes.length,
      };

      const movimientos: SiigoMovimiento[] = [
        ...facturas.map((f) => ({ tipo: "FV" as const, nombre: f.nombre, fecha: f.fecha, cliente: f.cliente, valor: f.total })),
        ...recibos.map((r) => ({ tipo: "RC" as const, nombre: r.nombre, fecha: r.fecha, cliente: r.cliente, valor: r.valor })),
        ...notas.map((n) => ({ tipo: "NC" as const, nombre: n.nombre, fecha: n.fecha, cliente: n.cliente, valor: -n.valor })),
      ]
        .sort((a, b) => (a.fecha === b.fecha ? b.nombre.localeCompare(a.nombre) : b.fecha.localeCompare(a.fecha)))
        .slice(0, 40);

      const datos: SiigoDatos = { facturas, movimientos, compras, edades, serieMeses, topSaldos, resumen, actualizadoMs: Date.now() };
      datosCache = { datos, vence: Date.now() + CACHE_DATOS_MS };
      ultimoBueno = datos;
      return { ok: true, datos, minDesdeLectura: 0 };
    } catch (e) {
      const error = e instanceof Error ? e.message : "No se pudo leer Siigo.";
      // Con un último estado bueno a mano, un tropiezo puntual no deja la pantalla vacía.
      if (ultimoBueno) return { ok: true, datos: ultimoBueno, minDesdeLectura: minutosDesde(ultimoBueno.actualizadoMs), aviso: error };
      return { ok: false, error };
    } finally {
      enVuelo = null;
    }
  })();
  return enVuelo;
}

// ── Detalle de UNA factura (ítems y pagos) ─────────────────────────────────────
// Para el panel que se abre al hacer clic en la fila. Lectura puntual con su propia caché
// corta: mirar tres veces la misma factura no debe costar tres peticiones.

export type SiigoFacturaDetalle = SiigoFactura & {
  items: { descripcion: string; cantidad: number; precio: number; total: number }[];
  pagos: { nombre: string; valor: number; vence: string | null }[];
  observaciones: string | null;
};

const detalleCache = new Map<string, { d: SiigoFacturaDetalle; vence: number }>();
const DETALLE_TTL_MS = 10 * 60_000;
const DETALLE_TOPE = 60;

export async function facturaDetalleSiigo(id: string): Promise<SiigoFacturaDetalle | null> {
  // El id viaja por URL desde el navegador: solo se acepta un identificador con pinta de tal.
  if (!siigoEnabled() || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const hit = detalleCache.get(id);
  if (hit && Date.now() < hit.vence) return hit.d;
  try {
    const f = await siigoGet(`/v1/invoices/${id}`);
    const clientes = await mapaClientes();
    const base = parseFactura(f, clientes);
    if (!base) return null;
    const { codigo, tasa } = monedaDe(f);
    const aCOP = (v: number) => (codigo && tasa > 0 ? v * tasa : v);
    const items = lista(f.items)
      .map(obj)
      .map((i) => ({
        descripcion: texto(i.description) || texto(i.code) || "—",
        cantidad: num(i.quantity),
        precio: aCOP(num(i.price)),
        total: aCOP(num(i.total)),
      }));
    const pagos = lista(f.payments)
      .map(obj)
      .map((p) => ({ nombre: texto(p.name) || "Pago", valor: aCOP(num(p.value)), vence: texto(p.due_date).slice(0, 10) || null }));
    const d: SiigoFacturaDetalle = { ...base, items, pagos, observaciones: texto(f.observations) || null };
    detalleCache.set(id, { d, vence: Date.now() + DETALLE_TTL_MS });
    if (detalleCache.size > DETALLE_TOPE) {
      const primero = detalleCache.keys().next().value;
      if (primero) detalleCache.delete(primero);
    }
    return d;
  } catch {
    return null;
  }
}
