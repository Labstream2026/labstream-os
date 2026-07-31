"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { esCategoriaGasto } from "@/lib/gastos";

// ── Acciones del centro Finanzas: gastos propios y meta mensual ───────────────
// Todo tras la llave `ver_finanzas` (la misma de la página). Los gastos son NUESTROS
// (tabla Gasto); Siigo jamás se toca desde aquí.

type Resultado = { ok: true } | { error: string };

const MONTO_TOPE = 2_000_000_000; // 2.000 M COP: por encima de esto es un dedazo seguro

async function sesionFinanzas() {
  const session = await getSession();
  if (!session || session.role === "demo" || !hasPermission(session, "ver_finanzas")) return null;
  return session;
}

export async function crearGasto(entrada: { fecha: string; concepto: string; categoria: string; monto: number; nota?: string }): Promise<Resultado> {
  const session = await sesionFinanzas();
  if (!session) return { error: "Necesitas el permiso de finanzas." };

  const concepto = (entrada.concepto ?? "").trim().slice(0, 140);
  if (!concepto) return { error: "Escribe el concepto del gasto." };
  if (!esCategoriaGasto(entrada.categoria)) return { error: "Elige una categoría." };
  const monto = Math.round(Number(entrada.monto));
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto tiene que ser mayor que cero." };
  if (monto > MONTO_TOPE) return { error: "Ese monto no parece real: revísalo." };
  // La fecha llega como YYYY-MM-DD del <input type=date>; se ancla a mediodía UTC para que
  // ningún cambio de zona horaria la corra de día.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.fecha)) return { error: "La fecha no es válida." };
  const fecha = new Date(`${entrada.fecha}T12:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return { error: "La fecha no es válida." };

  await db.gasto.create({
    data: {
      fecha,
      concepto,
      categoria: entrada.categoria,
      monto,
      nota: (entrada.nota ?? "").trim().slice(0, 500) || null,
      creadoPorId: session.id,
    },
  });
  revalidatePath("/facturacion");
  return { ok: true };
}

export async function borrarGasto(id: string): Promise<Resultado> {
  const session = await sesionFinanzas();
  if (!session) return { error: "Necesitas el permiso de finanzas." };
  const gasto = await db.gasto.findUnique({ where: { id }, select: { id: true } });
  if (!gasto) return { error: "Ese gasto ya no existe." };
  await db.gasto.delete({ where: { id } });
  revalidatePath("/facturacion");
  return { ok: true };
}

// Meta mensual de facturación (barra de progreso del Resumen). null = quitar la meta.
export async function guardarMetaFacturacion(monto: number | null): Promise<Resultado> {
  const session = await sesionFinanzas();
  if (!session) return { error: "Necesitas el permiso de finanzas." };
  let valor: number | null = null;
  if (monto !== null) {
    valor = Math.round(Number(monto));
    if (!Number.isFinite(valor) || valor <= 0) return { error: "La meta tiene que ser mayor que cero." };
    if (valor > MONTO_TOPE) return { error: "Esa meta no parece real: revísala." };
  }
  await db.orgSettings.upsert({
    where: { id: "default" },
    create: { id: "default", metaFacturacion: valor },
    update: { metaFacturacion: valor },
  });
  revalidatePath("/facturacion");
  return { ok: true };
}
