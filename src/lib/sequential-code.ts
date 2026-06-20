import { Prisma } from "@prisma/client";

// Códigos secuenciales legibles (COT-0001, FAC-0001, PROP-0001, LS-0001) a prueba de
// colisiones. El patrón viejo `count()+1` choca cuando dos registros se crean a la vez:
// ambos leen el mismo conteo, calculan el mismo código y el segundo `create` revienta con
// P2002 (índice único). Aquí derivamos el número del código MÁS ALTO existente (no del
// conteo, que además se desincroniza al borrar) y, si aun así choca, reintentamos con el
// siguiente número. Las "lagunas" en la numeración son aceptables; los duplicados no.

// Extrae el número de un código `PREFIJO-0001` (0 si no hay dígitos).
function parseCodeNumber(code: string | null | undefined): number {
  if (!code) return 0;
  const n = parseInt(code.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export async function createWithSequentialCode<T>(opts: {
  prefix: string;
  width?: number;
  // Devuelve el código existente más alto del modelo (o null si no hay ninguno).
  findMaxCode: () => Promise<string | null>;
  // Crea el registro con el código dado. Debe lanzar P2002 si el código ya existe.
  create: (code: string) => Promise<T>;
  retries?: number;
}): Promise<T> {
  const width = opts.width ?? 4;
  // Holgura amplia: cada reintento es una consulta indexada + un insert fallido (barato),
  // y cubre ráfagas de creaciones simultáneas cuyos pares en vuelo aún no son visibles.
  const retries = opts.retries ?? 12;
  let offset = 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const max = await opts.findMaxCode();
    const code = `${opts.prefix}-${String(parseCodeNumber(max) + offset).padStart(width, "0")}`;
    try {
      return await opts.create(code);
    } catch (e) {
      // Solo reintentamos ante colisión del índice único; cualquier otro error sube.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        lastErr = e;
        offset++;
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// Helper para el caso común: el código más alto de un modelo Prisma ordenando por número.
// Ordena trayendo unos pocos códigos y eligiendo el de mayor número (robusto aunque el
// ancho cambie, p. ej. al pasar de 9999 a 10000, donde el orden alfabético fallaría).
export async function maxCodeFrom(
  findMany: (args: { orderBy: { code: "desc" }; take: number; select: { code: true } }) => Promise<{ code: string }[]>,
): Promise<string | null> {
  const rows = await findMany({ orderBy: { code: "desc" }, take: 25, select: { code: true } });
  if (!rows.length) return null;
  return rows.reduce((best, r) => (parseCodeNumber(r.code) > parseCodeNumber(best) ? r.code : best), rows[0].code);
}
