import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { accessibleClientWhere, userCanAccessClient } from "@/lib/client-access";
import { clientLineValue } from "@/lib/quote-compose";
import { createWithSequentialCode, maxCodeFrom } from "@/lib/sequential-code";
import { logActivity } from "@/lib/activity";
import { readJson, str } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const invoiceTotal = (items: { quantity: number; unitPrice: number }[], taxRate: number) => {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  return Math.round(subtotal * (1 + taxRate / 100));
};

// GET /api/v1/invoices?status= — facturas de clientes accesibles (ver_finanzas).
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (!hasPermission(ctx.session, "ver_finanzas")) return apiJson({ ok: false, error: "Sin permiso para ver finanzas (ver_finanzas)." }, 403);
  const status = new URL(req.url).searchParams.get("status")?.toUpperCase();
  const filters: Record<string, unknown>[] = [{ client: accessibleClientWhere(ctx.session) }];
  if (status && ["BORRADOR", "ENVIADA", "PAGADA", "VENCIDA", "ANULADA"].includes(status)) filters.push({ status });
  const rows = await db.invoice.findMany({
    where: { AND: filters }, take: 50, orderBy: { issueDate: "desc" },
    select: { id: true, code: true, status: true, currency: true, taxRate: true, issueDate: true, dueDate: true, client: { select: { name: true } }, items: { select: { quantity: true, unitPrice: true } } },
  });
  return apiJson({ ok: true, invoices: rows.map((inv) => ({ id: inv.id, code: inv.code, client: inv.client?.name ?? null, status: inv.status, currency: inv.currency, total: invoiceTotal(inv.items, inv.taxRate), issueDate: inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : null, dueDate: inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : null })) });
});

// POST /api/v1/invoices  body { quoteId } — genera la factura de una cotización APROBADA. Espejo de
// createInvoiceFromQuote: crear_cotizaciones + acceso al cliente; evita duplicados.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (!hasPermission(ctx.session, "crear_cotizaciones")) return apiJson({ ok: false, error: "Sin permiso (crear_cotizaciones)." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const quoteId = str(body.quoteId);
  if (!quoteId) return apiJson({ ok: false, error: "quoteId es obligatorio." }, 400);
  const quote = await db.quote.findUnique({ where: { id: quoteId }, include: { items: { orderBy: { position: "asc" } } } });
  if (!quote) return apiJson({ ok: false, error: "Cotización no encontrada." }, 404);
  if (!(await userCanAccessClient(quote.clientId, ctx.session))) return apiJson({ ok: false, error: "Sin acceso a esta cotización." }, 403);
  if (quote.status !== "APROBADA") return apiJson({ ok: false, error: "Solo se puede facturar una cotización aprobada." }, 409);
  const existing = await db.invoice.findFirst({ where: { quoteId: quote.id }, select: { id: true, code: true } });
  if (existing) return apiJson({ ok: true, invoice: { id: existing.id, code: existing.code }, alreadyExisted: true });

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const invoice = await createWithSequentialCode({
    prefix: "FAC",
    findMaxCode: () => maxCodeFrom((args) => db.invoice.findMany(args)),
    create: (code) => db.invoice.create({
      data: {
        code, status: "BORRADOR", currency: quote.currency, taxRate: quote.taxRate, notes: quote.notes, dueDate,
        clientId: quote.clientId, projectId: quote.projectId, quoteId: quote.id, createdById: ctx.session.id,
        items: { create: quote.items.map((i) => {
          const value = clientLineValue({ quantity: i.quantity, unitPrice: i.unitPrice }, quote.contingencyPct);
          const qtyNote = i.quantity !== 1 ? ` (×${i.quantity}${i.unit ? ` ${i.unit}` : ""})` : "";
          return { section: i.section, description: `${i.description}${qtyNote}`, quantity: 1, unitPrice: value, position: i.position };
        }) },
      },
      select: { id: true, code: true, status: true },
    }),
  });
  await logActivity({ action: "invoice.create", summary: `generó la factura ${invoice.code} desde ${quote.code} (vía API)`, clientId: quote.clientId, entityType: "invoice", entityId: invoice.id }).catch(() => null);
  return apiJson({ ok: true, invoice: { id: invoice.id, code: invoice.code, status: invoice.status } }, 201);
});
