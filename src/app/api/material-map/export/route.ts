import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { materialHealth, ROLE_LABEL } from "@/lib/material-health";
import { formatBogota } from "@/lib/bogota-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Exporta el MAPA DEL MATERIAL a CSV: una fila por ubicación (proyecto × rol × disco),
// con la salud 3-2-1 del proyecto en cada fila. Para el archivo del estudio o el seguro.
// Mismo trato que el export de auditoría: BOM para Excel y «;» (regional es-CO).
export async function GET() {
  const session = await getSession();
  if (!session || !hasPermission(session, "ver_biblioteca")) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const projects = await db.project.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      name: true,
      finishedAt: true,
      client: { select: { name: true } },
      materialLocations: {
        orderBy: { createdAt: "asc" },
        include: { disk: { select: { id: true, name: true, kind: true, offsite: true, location: true } } },
      },
    },
  });

  const esc = (v: string | null | undefined) => {
    const s = String(v ?? "");
    return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };

  const lines = [
    ["Proyecto", "Cliente", "Estado", "Salud", "Rol", "Disco", "Tipo de disco", "Dónde está el disco", "Ruta", "Verificado"].map(esc).join(";"),
  ];
  for (const p of projects) {
    const health = materialHealth(
      p.materialLocations.map((l) => ({ role: l.role, diskId: l.diskId, diskKind: l.disk.kind, offsite: l.disk.offsite }))
    );
    const estado = p.finishedAt ? "Terminado" : "Activo";
    if (p.materialLocations.length === 0) {
      lines.push([p.name, p.client?.name ?? "", estado, health.label, "", "", "", "", "", ""].map(esc).join(";"));
      continue;
    }
    for (const l of p.materialLocations) {
      lines.push(
        [
          p.name,
          p.client?.name ?? "",
          estado,
          health.label,
          ROLE_LABEL[l.role] ?? l.role,
          l.disk.name,
          l.disk.kind,
          l.disk.location ?? "",
          l.path ?? "",
          l.verifiedAt ? (formatBogota(l.verifiedAt) ?? "") : "Sin verificar",
        ].map(esc).join(";")
      );
    }
  }

  // BOM para que Excel abra el CSV con acentos correctos.
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mapa-del-material.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
