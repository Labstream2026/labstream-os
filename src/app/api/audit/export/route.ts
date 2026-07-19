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
  // Valida las fechas del querystring: un valor no parseable da Invalid Date y Prisma LANZA
  // (un 500). Este endpoint es alcanzable por URL, así que un rango a mano no debe tumbarlo.
  if (from || to) {
    const parse = (v: string) => {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const gte = from ? parse(from) : undefined;
    const lt = to ? parse(to) : undefined;
    const range: Record<string, Date> = {};
    if (gte) range.gte = gte;
    if (lt) range.lt = lt;
    if (Object.keys(range).length) where.createdAt = range;
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
  // Escapa para CSV y NEUTRALIZA inyección de fórmulas: una celda que empieza por = + - @
  // (o tab/CR) se ejecutaría como fórmula en Excel/Sheets. Algunos campos (actorName) vienen
  // del portal público de revisión —texto no confiable— así que se antepone una comilla.
  const esc = (s: string) => {
    const v = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${v.replaceAll('"', '""')}"`;
  };
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
