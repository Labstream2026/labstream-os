import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { verifyProposalToken, verifyProposalUnlock } from "@/lib/proposals/token";
import { PublicLinkInvalid } from "@/components/public-link-invalid";
import { ProposalGate } from "./gate";
import { Logo } from "@/components/brand/logo";
import { effectiveStatus, BRAND_DEFAULT, type Block, type Brand, type ProposalStatus } from "@/lib/proposals/types";
import { ProposalRenderer } from "@/app/(app)/cotizaciones/propuestas/proposal-renderer";
import { ProposalPresentation } from "@/app/(app)/cotizaciones/propuestas/proposal-presentation";
import { sanitizeBlockBodies } from "@/lib/proposals/html-sanitize";
import { PrintButton } from "@/components/print-button";
import { AcceptProposal } from "./accept";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Enhebra el token de la propuesta en las URLs internas de imagen (/api/proposal-img/…) para que el
// portal público (sin sesión) las cargue tras gatear esa ruta. Las URLs externas no se tocan. Solo
// hay imágenes en el fondo del hero (bg) y en los slides del carrusel (items[].img).
function withImgToken(blocks: Block[], token: string): Block[] {
  const tok = (u: unknown) =>
    typeof u === "string" && u.startsWith("/api/proposal-img/")
      ? `${u}${u.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}`
      : u;
  return blocks.map((b) => {
    const rec = { ...(b as unknown as Record<string, unknown>) };
    if (rec.type === "hero") rec.bg = tok(rec.bg);
    else if (rec.type === "carousel" && Array.isArray(rec.items)) {
      rec.items = (rec.items as Record<string, unknown>[]).map((it) => ({ ...it, img: tok(it.img) }));
    }
    return rec as unknown as Block;
  });
}

export default async function PropuestaPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = verifyProposalToken(token);
  if (!id) return <PublicLinkInvalid />;

  const p = await db.proposal.findUnique({ where: { id } });
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

  // Cuenta una visita del cliente (solo cuando de verdad ve el contenido; no bloquea el render si falla).
  await db.proposal.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => {});
  // Saneo servidor del HTML de los bloques antes del render público (cubre propuestas guardadas
  // antes del saneo al escribir) y enhebrado del token en las imágenes internas. El editor
  // (cliente) NO pasa por aquí: usa su propio renderer y su sesión.
  const blocks = withImgToken(
    sanitizeBlockBodies((Array.isArray(p.blocks) ? p.blocks : []) as unknown as Block[]),
    token,
  );
  const status = effectiveStatus({ status: p.status as ProposalStatus, expiresAt: p.expiresAt });
  const accepted = status === "ACEPTADA";
  const expired = status === "VENCIDA";

  // Tema "presentacion": experiencia inmersiva oscura a pantalla completa (misma propuesta, otro
  // envoltorio). El documento clásico sigue igual para las propuestas en tema "documento".
  if (brand.theme === "presentacion") {
    return (
      <div className="min-h-screen text-white" style={{ background: "#0d1017" }}>
        <div
          className="sticky top-0 z-20 flex items-center justify-between gap-3 px-5 py-3"
          style={{ background: "rgba(13,16,23,0.82)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div>
            <p className="text-sm font-semibold">{brand.company}</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{brand.tagline}</p>
          </div>
        </div>

        <ProposalPresentation blocks={blocks} brand={brand} variant="full" />

        <section className="px-6 py-20" style={{ background: "#0d1017" }}>
          <div className="mx-auto max-w-xl">
            {accepted ? (
              <div className="rounded-2xl px-5 py-4 text-center text-sm font-medium" style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#6ee7b7" }}>
                ✅ Aceptaste esta propuesta. ¡Gracias! Nos pondremos en contacto.
              </div>
            ) : expired ? (
              <div className="rounded-2xl px-5 py-4 text-center text-sm font-medium" style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.3)", color: "#fda4af" }}>
                Esta propuesta venció. Escríbenos para actualizarla.
              </div>
            ) : (
              <AcceptProposal token={token} accent={brand.accent} dark />
            )}
          </div>
        </section>

        <div className="flex items-center justify-center gap-1.5 py-8 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
          <span>Hecho con</span>
          <Logo className="h-3.5 opacity-60" alt="Labstream Studio" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
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
      ) : expired ? (
        <div className="mx-auto mb-4 max-w-3xl rounded-md bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 print:hidden">
          Esta propuesta venció. Escríbenos para actualizarla.
        </div>
      ) : null}

      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-4 shadow-sm print:rounded-none print:p-0 print:shadow-none sm:p-8">
        <ProposalRenderer blocks={blocks} brand={brand} />
      </div>

      {!accepted && !expired ? (
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
