import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { userCanAccessClient } from "@/lib/client-access";
import { logActivity } from "@/lib/activity";
import { readJson, str, isYmd } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/invoices/:id — detalle con líneas y total (ver_finanzas + acceso al cliente).
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  if (!hasPermission(ctx.session, "ver_finanzas")) return apiJson({ ok: false, error: "Sin permiso para ver finanzas (ver_finanzas)." }, 403);
  const inv = await db.invoice.findUnique({
    where: { id },
    select: { id: true, code: true, status: true, currency: true, taxRate: true, notes: true, issueDate: true, dueDate: true, paidAt: true, clientId: true, client: { select: { id: true, name: true } }, project: { select: { id: true, name: true } }, quote: { select: { code: true } }, items: { orderBy: { position: "asc" }, select: { id: true, section: true, description: true, quantity: true, unitPrice: true } } },
  });
  if (!inv) return apiJson({ ok: false, error: "Factura no encontrada." }, 404);
  if (!(await userCanAccessClient(inv.clientId, ctx.session))) return apiJson({ ok: false, error: "Sin acceso a esta factura." }, 403);
  const subtotal = inv.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  return apiJson({
    ok: true,
    invoice: {
      id: inv.id, code: inv.code, status: inv.status, currency: inv.currency, taxRate: inv.taxRate, notes: inv.notes,
      issueDate: inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : null,
      dueDate: inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : null,
      paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
      client: inv.client ? { id: inv.client.id, name: inv.client.name } : null,
      project: inv.project ? { id: inv.project.id, name: inv.project.name } : null,
      fromQuote: inv.quote?.code ?? null,
      items: inv.items,
      totals: { subtotal, tax: Math.round(subtotal * inv.taxRate / 100), total: Math.round(subtotal * (1 + inv.taxRate / 100)) },
    },
  });
});

// PATCH /api/v1/invoices/:id — edita fechas/impuesto/notas (crear_cotizaciones + acceso al cliente).
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  if (!hasPermission(ctx.session, "crear_cotizaciones")) return apiJson({ ok: false, error: "Sin permiso (crear_cotizaciones)." }, 403);
  const inv = await db.invoice.findUnique({ where: { id }, select: { clientId: true } });
  if (!inv) return apiJson({ ok: false, error: "Factura no encontrada." }, 404);
  if (!(await userCanAccessClient(inv.clientId, ctx.session))) return apiJson({ ok: false, error: "Sin acceso a esta factura." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const data: Record<string, unknown> = {};
  for (const [field, key] of [["issueDate", "issueDate"], ["dueDate", "dueDate"]] as const) {
    if (field in body) {
      const v = str(body[field]);
      if (!v) data[key] = field === "issueDate" ? undefined : null;
      else if (isYmd(v)) data[key] = new Date(`${v}T12:00:00.000Z`);
      else return apiJson({ ok: false, error: `${field} debe ser "YYYY-MM-DD".` }, 400);
    }
  }
  if ("taxRate" in body) data.taxRate = Math.max(0, Math.min(100, parseInt(String(body.taxRate), 10) || 0));
  if (typeof body.notes === "string") data.notes = clampText(body.notes.trim()) || null;
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);
  await db.invoice.update({ where: { id }, data });
  return apiJson({ ok: true });
});

// DELETE /api/v1/invoices/:id — borra la factura. Solo administradores (igual que deleteInvoice).
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  if (ctx.session.role !== "admin") return apiJson({ ok: false, error: "Solo un administrador puede borrar facturas." }, 403);
  const inv = await db.invoice.findUnique({ where: { id }, select: { code: true, clientId: true } });
  if (!inv) return apiJson({ ok: true, alreadyGone: true });
  await db.invoice.delete({ where: { id } });
  await logActivity({ action: "invoice.delete", summary: `eliminó la factura ${inv.code} (vía API)`, clientId: inv.clientId, entityType: "invoice" }).catch(() => null);
  return apiJson({ ok: true });
});
