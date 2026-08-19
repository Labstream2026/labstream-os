import { db } from "@/lib/db";
import { aplicarPlantillaFirma, bloqueFirma, sanearSaliente, type ParteInline } from "./redactar";

// ── LA firma de una cuenta, lista para el correo ────────────────────────────
// Un solo compositor para el envío (acciones del correo y de revisiones) y para la vista
// previa del redactor — la previa enseña EXACTAMENTE lo que va a salir, no una aproximación.
//
// Precedencia: plantilla del estudio (la corporativa, con {{nombre}}/{{cargo}} de la
// persona) > firma personalizada (HTML propio + imagen propia) > la institucional básica
// (nombre + cargo de la ficha).

export type FirmaCompuesta = {
  html: string;
  /** Partes CID a adjuntar al enviar (vacío en modo vista previa). */
  inlines: ParteInline[];
};

const CID_FIRMA = "firma@labstream";

export async function firmaDeCuenta(
  accountId: string,
  opts?: {
    /** Vista previa: la imagen se referencia por URL de la app en vez de CID (y sin partes). */
    paraVistaPrevia?: boolean;
  },
): Promise<FirmaCompuesta> {
  const cuenta = await db.mailAccount.findUnique({
    where: { id: accountId },
    select: {
      signatureHtml: true,
      signatureImage: true,
      signatureImageMime: true,
      signatureName: true,
      signatureRole: true,
      signatureTemplate: { select: { id: true, html: true, imageBytes: true, imageMime: true } },
      user: { select: { name: true, title: true } },
    },
  });
  if (!cuenta) return { html: "", inlines: [] };

  const nombre = cuenta.signatureName?.trim() || cuenta.user.name;
  const cargo = cuenta.signatureRole?.trim() || cuenta.user.title;
  const previa = opts?.paraVistaPrevia === true;

  // 1) Plantilla del estudio: la corporativa manda.
  const t = cuenta.signatureTemplate;
  if (t) {
    const cuerpo = aplicarPlantillaFirma(sanearSaliente(t.html), { nombre, cargo });
    const conImagen = !!t.imageBytes;
    const srcImagen = previa ? `/api/correo/firma-plantilla/${t.id}` : `cid:${CID_FIRMA}`;
    const img = conImagen ? `<p style="margin:8px 0 0"><img src="${srcImagen}" alt="" style="max-width:260px"></p>` : "";
    return {
      html: `<div style="margin-top:16px">${cuerpo}${img}</div>`,
      inlines:
        !previa && conImagen && t.imageBytes
          ? [{ cid: CID_FIRMA, nombre: "firma.png", mime: t.imageMime ?? "image/png", contenido: Buffer.from(t.imageBytes) }]
          : [],
    };
  }

  // 2) Personalizada / 3) institucional básica (bloqueFirma resuelve ambas).
  const firma = bloqueFirma({
    nombre,
    cargo,
    firmaHtml: cuenta.signatureHtml,
    tieneImagen: !!cuenta.signatureImage,
  });
  const html = previa ? firma.html.replace(/cid:firma@labstream/g, "/api/correo/firma-imagen") : firma.html;
  return {
    html,
    inlines:
      !previa && firma.cidImagen && cuenta.signatureImage
        ? [{ cid: firma.cidImagen, nombre: "firma.png", mime: cuenta.signatureImageMime ?? "image/png", contenido: Buffer.from(cuenta.signatureImage) }]
        : [],
  };
}
