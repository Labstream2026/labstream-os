import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { verifyProposalToken, verifyProposalUnlock } from "@/lib/proposals/token";
import { PublicLinkInvalid } from "@/components/public-link-invalid";
import { ProposalGate } from "./gate";
import { effectiveStatus, BRAND_DEFAULT, type Block, type Brand, type ProposalStatus } from "@/lib/proposals/types";
import { DeckView } from "@/components/proposals/deck-view";
import { sanitizeBlockBodies } from "@/lib/proposals/html-sanitize";
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

  // El cliente ve la propuesta como un DECK a pantalla completa (idéntico a /contenido/): la
  // decisión (aceptar/rechazar), los adjuntos y el pie van DESPUÉS del deck, como zona final —
  // se llega deslizando tras la última diapositiva. Estilos en línea para no chocar con el CSS
  // del deck (que redefine clases genéricas como .grid/.card).
  const decision = (
    <div style={{ background: "#121110", color: "#F0ECE5", padding: "clamp(40px,7vw,72px) 20px 72px", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
        {accepted ? (
          <p style={{ background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.3)", color: "#6ee7b7", borderRadius: 14, padding: "16px 20px", fontWeight: 500 }}>
            ✅ Aceptaste esta propuesta. ¡Gracias! Nos pondremos en contacto.
          </p>
        ) : rejected ? (
          <p style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", color: "rgba(240,236,229,.78)", borderRadius: 14, padding: "16px 20px", fontWeight: 500 }}>
            Registramos tu respuesta. Gracias por contarnos el motivo.
          </p>
        ) : expired ? (
          <p style={{ background: "rgba(244,63,94,.12)", border: "1px solid rgba(244,63,94,.3)", color: "#fda4af", borderRadius: 14, padding: "16px 20px", fontWeight: 500 }}>
            Esta propuesta venció. Escríbenos para actualizarla.
          </p>
        ) : (
          <AcceptProposal token={token} accent={brand.accent} dark />
        )}

        {p.attachments.length ? (
          <div style={{ marginTop: 32, textAlign: "left" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(240,236,229,.5)", marginBottom: 10 }}>Documentos adjuntos</p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {p.attachments.map((a) => (
                <li key={a.id}>
                  <a
                    href={`/api/proposal-attachment/${a.id}?t=${encodeURIComponent(token)}`}
                    style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(255,255,255,.16)", borderRadius: 12, padding: "10px 14px", color: "#F0ECE5", textDecoration: "none", fontSize: 14 }}
                  >
                    <span aria-hidden>📎</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                    <span style={{ flexShrink: 0, fontSize: 12, opacity: 0.55 }}>Descargar</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div style={{ marginTop: 32, fontSize: 12, opacity: 0.45 }}>Hecho con {brand.company}</div>
      </div>
    </div>
  );

  return <DeckView blocks={blocks} brand={brand} footer={decision} />;
}
