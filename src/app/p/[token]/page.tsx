import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { verifyProposalToken, verifyProposalUnlock } from "@/lib/proposals/token";
import { PublicLinkInvalid } from "@/components/public-link-invalid";
import { ProposalGate } from "./gate";
import { Logo } from "@/components/brand/logo";
import { effectiveStatus, BRAND_DEFAULT, type Block, type Brand, type ProposalStatus } from "@/lib/proposals/types";
import { ProposalRenderer } from "@/app/(app)/cotizaciones/propuestas/proposal-renderer";
import { sanitizeBlockBodies } from "@/lib/proposals/html-sanitize";
import { PrintButton } from "@/components/print-button";
import { AcceptProposal } from "./accept";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Enhebra el token de la propuesta en las URLs internas de imagen (/api/proposal-img/…) para que el
// portal público (sin sesión) las cargue tras gatear esa ruta. Las URLs externas no se tocan. Solo
// hay imágenes en el fondo del hero (bg) y en los slides del carrusel (items[].img).
function withImgToken(blocks: Block[], token: string): Block[] {
  // Cubre las dos familias de medios internos: los de UNA propuesta (/api/proposal-img/) y los
  // de la BIBLIOTECA compartida (/api/proposal-asset/ — videos de fondo y logos reutilizables).
  const tok = (u: unknown) =>
    typeof u === "string" && (u.startsWith("/api/proposal-img/") || u.startsWith("/api/proposal-asset/"))
      ? `${u}${u.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}`
      : u;
  return blocks.map((b) => {
    const rec = { ...(b as unknown as Record<string, unknown>) };
    // El fondo (imagen y video) vale para CUALQUIER bloque en el tema cine, no solo el hero.
    rec.bg = tok(rec.bg);
    rec.bgVideo = tok(rec.bgVideo);
    if (rec.type === "carousel" && Array.isArray(rec.items)) {
      rec.items = (rec.items as Record<string, unknown>[]).map((it) => ({ ...it, img: tok(it.img) }));
    } else if (rec.type === "logos" && Array.isArray(rec.items)) {
      // Los logos aceptan texto suelto (formato viejo) u objeto {name, logo}.
      rec.items = (rec.items as unknown[]).map((it) =>
        it && typeof it === "object" ? { ...(it as Record<string, unknown>), logo: tok((it as Record<string, unknown>).logo) } : it,
      );
    } else if ((rec.type === "video" || rec.type === "fullvideo") && typeof rec.url === "string") {
      rec.url = tok(rec.url);
    }
    return rec as unknown as Block;
  });
}

export default async function PropuestaPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = verifyProposalToken(token);
  if (!id) return <PublicLinkInvalid />;

  const p = await db.proposal.findUnique({
    where: { id },
    include: { attachments: { orderBy: { createdAt: "asc" }, select: { id: true, name: true } } },
  });
  if (!p) return <PublicLinkInvalid />;

  const brand = { ...BRAND_DEFAULT, ...((p.brand as unknown as Brand) ?? {}) };

  // Reja de contraseña: si la propuesta está protegida y no hay cookie de desbloqueo válida para
  // ESTA propuesta, se muestra la reja en vez del contenido (y no se cuenta la visita).
  if (p.accessPasswordHash) {
    const store = await cookies();
    const ck = store.get(`proposal-unlock-${id}`)?.value;
    // Ligado al hash vigente: si el equipo cambió la contraseña, la cookie vieja ya no vale.
    const unlocked = ck ? verifyProposalUnlock(ck, p.accessPasswordHash) === id : false;
    if (!unlocked) {
      return <ProposalGate token={token} company={brand.company} tagline={brand.tagline} accent={brand.accent} dark={brand.theme === "presentacion"} />;
    }
  }

  // Cuenta una visita del cliente (solo cuando de verdad ve el contenido; no bloquea el render
  // si falla). lastOpenedAt le dice al comercial CUÁNDO fue la última — «la abrió ayer y no
  // responde» pide teléfono, no otro correo.
  await db.proposal.update({ where: { id }, data: { views: { increment: 1 }, lastOpenedAt: new Date() } }).catch(() => {});
  // Saneo servidor del HTML de los bloques antes del render público (cubre propuestas guardadas
  // antes del saneo al escribir) y enhebrado del token en las imágenes internas. El editor
  // (cliente) NO pasa por aquí: usa su propio renderer y su sesión.
  const blocks = withImgToken(
    sanitizeBlockBodies((Array.isArray(p.blocks) ? p.blocks : []) as unknown as Block[]),
    token,
  );
  const status = effectiveStatus({ status: p.status as ProposalStatus, expiresAt: p.expiresAt });
  const accepted = status === "ACEPTADA";
  const rejected = status === "RECHAZADA";
  const expired = status === "VENCIDA";
  // Decidida = el cliente ya respondió (sí o no): no se le vuelve a pedir que decida.
  const decided = accepted || rejected;

  // Un solo diseño: el documento editorial premium (se retiraron los temas "cine" y
  // "presentación"). La propuesta se muestra como una "hoja" centrada; el renderer pinta su
  // propio fondo crema y las secciones —incluidos los fondos de video/imagen— llenan la hoja.
  return (
    <div className="min-h-screen py-8 print:bg-white print:py-0" style={{ background: "#eceae4" }}>
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <div>
          <p className="text-sm font-semibold text-neutral-800">{brand.company}</p>
          <p className="text-xs text-neutral-500">{brand.tagline}</p>
        </div>
        <PrintButton label="Descargar PDF" />
      </div>

      {accepted ? (
        <div className="mx-auto mb-4 max-w-3xl rounded-md bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 print:hidden">
          ✅ Aceptaste esta propuesta. ¡Gracias! Nos pondremos en contacto.
        </div>
      ) : rejected ? (
        <div className="mx-auto mb-4 max-w-3xl rounded-md bg-neutral-100 px-4 py-3 text-sm font-medium text-neutral-600 print:hidden">
          Registramos tu respuesta. Gracias por contarnos el motivo.
        </div>
      ) : expired ? (
        <div className="mx-auto mb-4 max-w-3xl rounded-md bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 print:hidden">
          Esta propuesta venció. Escríbenos para actualizarla.
        </div>
      ) : null}

      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl shadow-sm print:rounded-none print:shadow-none">
        <ProposalRenderer blocks={blocks} brand={brand} />
      </div>

      {/* Documentos adjuntos: viajan con la propuesta (portafolio, casos, contrato…). El token
          firmado autoriza la descarga sin sesión. Se ocultan al imprimir. */}
      {p.attachments.length ? (
        <div className="mx-auto mt-4 max-w-3xl px-4 print:hidden">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Documentos adjuntos</p>
            <ul className="space-y-1.5">
              {p.attachments.map((a) => (
                <li key={a.id}>
                  <a
                    href={`/api/proposal-attachment/${a.id}?t=${encodeURIComponent(token)}`}
                    className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                  >
                    <span aria-hidden>📎</span>
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <span className="shrink-0 text-xs text-neutral-400">Descargar</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {!decided && !expired ? (
        <div className="mx-auto mt-6 max-w-3xl px-4 print:hidden">
          <AcceptProposal token={token} accent={brand.accent} />
        </div>
      ) : null}

      {/* Pie discreto de marca: "Hecho con Labstream". */}
      <div className="mx-auto mt-8 flex max-w-3xl items-center justify-center gap-1.5 px-4 text-xs text-neutral-400 print:hidden">
        <span>Hecho con</span>
        <Logo className="h-3.5 opacity-70" alt="Labstream Studio" />
      </div>
    </div>
  );
}
