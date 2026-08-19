import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Link2, Printer, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageProject, userCanAccessProject, PROJECT_ACCESS_SELECT } from "@/lib/project-access";
import { signLlamadoToken } from "@/lib/llamado-token";
import { cargarSheet, docDeSheet, bloquesDe, textoWhatsappLlamado } from "@/lib/llamado/doc";
import { LlamadoDocument } from "@/components/llamado-document";
import { FitToWidth } from "@/components/fit-to-width";
import { CopyLink } from "@/components/copy-link";
import { LlamadoEditor, type PersonaVM } from "./editor";
import { eliminarLlamado, revocarEnlaceLlamado } from "../actions";

export const dynamic = "force-dynamic";

// ── La hoja de llamado: editor (para quien gestiona) + el documento ─────────
export default async function LlamadoPage({ params }: { params: Promise<{ id: string; sheetId: string }> }) {
  const { id, sheetId } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await userCanAccessProject(id, session))) redirect("/proyectos");

  const sheet = await cargarSheet(sheetId);
  if (!sheet || sheet.projectId !== id) notFound();

  const acceso = await db.project.findUnique({ where: { id }, select: PROJECT_ACCESS_SELECT });
  const gestiona = !!acceso && canManageProject(acceso, session) && session.role !== "demo";

  const doc = await docDeSheet(sheet);
  const fechaTxt = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" }).format(sheet.fecha);
  const base = (process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "");
  const urlPublica = `${base}/llamado/${signLlamadoToken(sheet.id)}`;

  // Equipo del proyecto aún sin citar (para el botón «añadir»).
  const miembros = await db.projectMember.findMany({
    where: { projectId: id },
    select: { userId: true, role: true, user: { select: { name: true, title: true } } },
  });
  const equipoDisponible = miembros.map((m) => ({ id: m.userId, nombre: m.user?.name ?? "—", rol: m.role || m.user?.title || null }));

  const yo = sheet.personas.find((p) => p.userId === session.id);
  const nConf = sheet.personas.filter((p) => p.confirmadoAt).length;

  const personasVM: PersonaVM[] = sheet.personas.map((p) => ({
    id: p.id,
    userId: p.userId,
    nombre: p.user?.name ?? p.nombre ?? "",
    rol: p.rol ?? p.user?.title ?? "",
    telefono: p.telefono ?? "",
    citacion: p.citacion ?? "",
    confirmado: !!p.confirmadoAt,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <Link href={`/proyectos/${id}?tab=calendario`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {sheet.project.name}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${sheet.estado === "ENVIADA" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
              {sheet.estado === "ENVIADA" ? "Enviada" : "Borrador"}
            </span>
            <span className="text-xs text-muted-foreground">
              {nConf} de {sheet.personas.length} confirmaron
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">📋 {sheet.titulo || `Rodaje — ${sheet.project.name}`}</h1>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{fechaTxt}{sheet.citacionGeneral ? ` · citación ${sheet.citacionGeneral}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/proyectos/${id}/llamado/${sheet.id}/imprimir`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">
            <Printer className="size-4" /> Imprimir / PDF
          </Link>
          {gestiona ? (
            <>
              {sheet.publicRevokedAt ? (
                <form action={revocarEnlaceLlamado.bind(null, sheet.id, false)}>
                  <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent" title="El enlace público está apagado; volver a encenderlo">
                    <Link2 className="size-4" /> Reactivar enlace
                  </button>
                </form>
              ) : (
                <CopyLink url={urlPublica} label="Enlace para externos" />
              )}
              <form action={eliminarLlamado.bind(null, sheet.id)}>
                <button className="rounded-md border border-border p-2 text-muted-foreground hover:bg-accent hover:text-destructive" title="Eliminar esta hoja">
                  <Trash2 className="size-4" />
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <LlamadoEditor
          sheetId={sheet.id}
          gestiona={gestiona}
          soyCitadoSinConfirmar={!!yo && !yo.confirmadoAt}
          inicial={{
            titulo: sheet.titulo ?? "",
            citacionGeneral: sheet.citacionGeneral ?? "",
            locacion: sheet.locacion ?? "",
            direccion: sheet.direccion ?? "",
            indicaciones: sheet.indicaciones ?? "",
            clienteEnSet: sheet.clienteEnSet ?? "",
            notas: sheet.notas ?? "",
            personas: personasVM,
            bloques: bloquesDe(sheet.bloques),
          }}
          equipoDisponible={equipoDisponible}
          textoWhatsapp={textoWhatsappLlamado(doc, urlPublica)}
          estado={sheet.estado}
          avisadosTxt={sheet.sentAt ? `enviada por última vez el ${new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(sheet.sentAt)}` : null}
        />
      </div>

      {/* El documento tal como se imprime y como lo ve el enlace público. */}
      <div className="mt-8 overflow-x-auto rounded-xl bg-neutral-200/60 p-3 dark:bg-neutral-800/40 sm:p-6">
        <FitToWidth>
          <LlamadoDocument doc={doc} />
        </FitToWidth>
      </div>
    </div>
  );
}
