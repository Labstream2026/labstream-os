import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { GROUP_PREFIXES } from "@/app/(app)/configuracion/auditoria-groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Exporta el registro de auditoría a CSV con los MISMOS filtros del panel
// (persona, grupo, rango). Solo con el permiso ver_actividad, por sesión.
// Tope 5000 filas por export (para más, acotar el rango de fechas).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !hasPermission(session, "ver_actividad")) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "";
  const group = url.searchParams.get("group") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;
  if (group && GROUP_PREFIXES[group]) where.OR = GROUP_PREFIXES[group].map((p) => ({ action: { startsWith: p } }));
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lt: new Date(to) } : {}),
    };
  }

  const rows = await db.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: {
      createdAt: true,
      action: true,
      summary: true,
      ip: true,
      actorName: true,
      user: { select: { name: true } },
      project: { select: { name: true } },
      client: { select: { name: true } },
    },
  });

  const fmt = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const esc = (s: string) => `"${s.replaceAll('"', '""')}"`;
  const lines = [
    ["Fecha (Bogotá)", "Usuario", "Acción", "Detalle", "Proyecto", "Cliente", "IP"].map(esc).join(";"),
    ...rows.map((r) =>
      [
        fmt.format(r.createdAt),
        r.user?.name ?? r.actorName ?? "Sistema",
        r.action,
        r.summary,
        r.project?.name ?? "",
        r.client?.name ?? "",
        r.ip ?? "",
      ]
        .map(esc)
        .join(";"),
    ),
  ];

  // BOM para que Excel abra el CSV con acentos correctos; ";" como separador (regional es-CO).
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="auditoria-labstream.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
