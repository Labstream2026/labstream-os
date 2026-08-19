import { verifyLlamadoToken } from "@/lib/llamado-token";
import { cargarSheet, docDeSheet } from "@/lib/llamado/doc";
import { LlamadoDocument } from "@/components/llamado-document";
import { FitToWidth } from "@/components/fit-to-width";
import { PrintButton } from "@/components/print-button";
import { PublicLinkInvalid } from "@/components/public-link-invalid";
import { Logo } from "@/components/brand/logo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── La hoja de llamado PÚBLICA (freelancers y externos, sin cuenta) ─────────
// Enlace firmado con caducidad + revocación desde la hoja. Solo lectura: la confirmación de
// asistencia es de quien tiene cuenta (identidad); a los externos se les confirma por chat.
export default async function LlamadoPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sheetId = verifyLlamadoToken(token);
  const sheet = sheetId ? await cargarSheet(sheetId) : null;

  if (!sheet || sheet.publicRevokedAt) {
    return <PublicLinkInvalid message="Este enlace de hoja de llamado ya no está disponible. Pide uno nuevo a producción." />;
  }

  const doc = await docDeSheet(sheet);

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4 print:hidden">
        <Logo className="h-6" />
        <PrintButton />
      </div>
      <div className="mx-auto w-full max-w-[820px] px-2 sm:px-4 print:max-w-none print:px-0">
        <FitToWidth>
          {/* Sin la columna de confirmación: el externo no puede confirmar aquí y una columna
              medio vacía leería como que nadie va. */}
          <LlamadoDocument doc={doc} mostrarConfirmacion={false} />
        </FitToWidth>
      </div>
    </div>
  );
}
