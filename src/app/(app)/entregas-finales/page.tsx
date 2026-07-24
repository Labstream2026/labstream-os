import { redirect } from "next/navigation";
import { FolderCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { signFileToken } from "@/lib/storage";
import { signReviewToken } from "@/lib/review-token";
import { photoViewSrc, photoDownloadSrc } from "@/lib/deliverable-photo";
import { formatBogotaDate } from "@/lib/bogota-time";
import { DELIVERABLE_TYPE } from "@/lib/ui";
import { ClientPortalNav } from "@/components/client-portal-nav";
import { FinalsGallery, type FinalItem } from "./gallery";

export const dynamic = "force-dynamic";

// ── Entregas finales ──
// La biblioteca de marca del cliente: TODO lo aprobado/entregado de todos sus proyectos en una
// sola grilla, con miniatura, versión final y descarga. Solo versiones con aprobación interna
// (las «finales»); nunca borradores.
export default async function EntregasFinalesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "cliente") redirect("/");

  // Sus proyectos (por membresía) → luego las piezas aprobadas donde está tagueado como revisor.
  const projects = await db.project.findMany({
    where: accessibleProjectWhere(session),
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);

  const deliverables = projectIds.length
    ? await db.deliverable.findMany({
        where: {
          projectId: { in: projectIds },
          status: { in: ["APROBADO", "ENTREGADO"] },
          OR: [{ reviewers: { some: { userId: session.id } } }, { reviewerId: session.id }],
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          type: true,
          updatedAt: true,
          coverFileAssetId: true,
          project: { select: { id: true, name: true, emoji: true } },
          versions: {
            where: { internalApproved: true },
            orderBy: { number: "desc" },
            take: 1,
            select: { number: true, internalApprovedAt: true, fileUrl: true, fileAsset: { select: { id: true, name: true } } },
          },
          decisions: {
            where: { stage: "CLIENTE", result: "APROBADO" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
          renditions: { orderBy: { position: "asc" }, select: { id: true, format: true, label: true, url: true } },
        },
      })
    : [];

  // Portadas del banco: APROBADAS de sus proyectos (para la sección y el botón «Portada»
  // del video vinculado) — el cliente se lleva video + portada desde el mismo lugar.
  const approvedCovers = projectIds.length
    ? await db.projectCover.findMany({
        where: { projectId: { in: projectIds }, decision: "APROBADA" },
        orderBy: { decisionAt: "desc" },
        select: { id: true, name: true, fileAssetId: true, deliverableId: true, project: { select: { name: true } } },
      })
    : [];
  const coverByDeliverable = new Map(approvedCovers.filter((c) => c.deliverableId).map((c) => [c.deliverableId as string, c]));

  // Sets de FOTOS aprobados/entregados: tarjeta con enlace a su galería (ver, calificar, descargar).
  const photoSets = projectIds.length
    ? await db.deliverable.findMany({
        where: { projectId: { in: projectIds }, type: "FOTOGRAFIA", status: { in: ["APROBADO", "ENTREGADO"] } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, project: { select: { name: true } }, photos: { orderBy: { position: "asc" }, select: { fileAssetId: true, url: true, pick: true }, take: 200 } },
      })
    : [];

  const items: FinalItem[] = deliverables.map((d) => {
    const v = d.versions[0] ?? null;
    // Descarga de la versión final: archivo local (con token firmado + descarga directa) o enlace externo.
    const download = v?.fileAsset
      ? { href: `/api/files-asset/${v.fileAsset.id}?t=${signFileToken(v.fileAsset.id)}&download=1`, external: false }
      : v?.fileUrl
        ? { href: v.fileUrl, external: true }
        : null;
    const approvedAt = d.decisions[0]?.createdAt ?? v?.internalApprovedAt ?? d.updatedAt;
    return {
      id: d.id,
      name: d.name,
      typeLabel: DELIVERABLE_TYPE[d.type] ?? d.type,
      projectId: d.project.id,
      projectName: d.project.name,
      cover: d.coverFileAssetId ? photoViewSrc({ fileAssetId: d.coverFileAssetId, url: null }) : null,
      coverDownload: (() => {
        const bank = coverByDeliverable.get(d.id);
        if (bank) return photoDownloadSrc({ fileAssetId: bank.fileAssetId, url: null });
        return d.coverFileAssetId ? photoDownloadSrc({ fileAssetId: d.coverFileAssetId, url: null }) : null;
      })(),
      versionNumber: v?.number ?? null,
      approvedLabel: `Aprobada · ${formatBogotaDate(approvedAt, { day: "numeric", month: "short" })}`,
      download,
      renditions: d.renditions.map((r) => ({ id: r.id, label: r.label || r.format, url: r.url })),
    };
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FolderCheck className="size-6 text-primary" /> Entregas finales
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todo tu material aprobado, en un solo lugar y listo para descargar. Siempre la versión final — cero dudas de cuál usar.
        </p>
      </header>

      <ClientPortalNav active="finales" />

      <FinalsGallery items={items} />

      {/* ── Portadas aprobadas (banco): también las sueltas, entregadas antes que su video ── */}
      {approvedCovers.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-base font-bold tracking-tight">🖼️ Portadas aprobadas</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {approvedCovers.map((c) => (
              <a
                key={c.id}
                href={photoDownloadSrc({ fileAssetId: c.fileAssetId, url: null })}
                download=""
                title={`Descargar ${c.name}`}
                className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoViewSrc({ fileAssetId: c.fileAssetId, url: null }, 600)} alt={c.name} loading="lazy" className="aspect-[9/16] w-full object-cover" />
                <p className="truncate px-2 py-1.5 text-[11px] font-medium" title={c.name}>{c.name}</p>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Sets de fotos aprobados: la galería completa vive en su sala (ver + descargar) ── */}
      {photoSets.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-base font-bold tracking-tight">📷 Sets de fotos</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photoSets.map((s) => {
              const liked = s.photos.filter((p) => p.pick === "ME_GUSTA").length;
              const thumbs = s.photos.slice(0, 3);
              return (
                <a key={s.id} href={`/review/${signReviewToken(s.id)}`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
                  {thumbs.length > 0 ? (
                    <div className="grid grid-cols-3 gap-0.5 bg-muted/40">
                      {thumbs.map((p, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={photoViewSrc(p, 400)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                      ))}
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" title={s.name}>{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.project.name} · {s.photos.length} fotos{liked ? ` · ♥ ${liked} elegidas` : ""}</p>
                    </div>
                    <span className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground">Abrir ↗</span>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
