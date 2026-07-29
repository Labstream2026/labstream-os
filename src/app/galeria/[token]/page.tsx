import type * as React from "react";
import { resolverEntrega, type EntregaEstado } from "@/lib/galeria-entrega";
import { formatBogotaDate } from "@/lib/bogota-time";
import { Logo } from "@/components/brand/logo";
import { SalaCliente } from "./sala-cliente";

// Sala PÚBLICA de la galería de entregas: el cliente abre el enlace que le llegó por WhatsApp
// y ve SU material, sin cuenta, sin barra lateral y sin poder salirse de su carpeta — el token
// dice qué entrega es, el navegador no lo elige. De la ruta interna del NAS aquí no sale nada:
// solo el título que le puso el equipo a la entrega.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mismo tema carbón de /review y /portadas: las tres salas del cliente se sienten una sola casa.
const ROOM_VARS = {
  "--background": "240 6% 7%",
  "--foreground": "0 0% 95%",
  "--card": "240 6% 9%",
  "--card-foreground": "0 0% 95%",
  "--popover": "240 6% 9%",
  "--popover-foreground": "0 0% 95%",
  "--primary": "25 95% 53%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "240 5% 15%",
  "--secondary-foreground": "0 0% 92%",
  "--muted": "240 5% 14%",
  "--muted-foreground": "240 5% 66%",
  "--accent": "240 5% 16%",
  "--accent-foreground": "0 0% 95%",
  "--border": "240 5% 20%",
  "--input": "240 5% 24%",
  "--ring": "25 95% 53%",
} as React.CSSProperties;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark relative min-h-screen overflow-x-clip bg-background text-foreground" style={ROOM_VARS}>
      <div aria-hidden className="pointer-events-none absolute -top-32 right-[-10%] size-96 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-6rem] left-[-8%] size-80 rounded-full bg-primary/10 blur-3xl" />
      {children}
    </div>
  );
}

// Titular por motivo: el mensaje detallado lo pone `resolverEntrega`, aquí solo se le da nombre
// a lo que pasó. Nunca se menciona la carpeta ni por qué falló por dentro.
const TITULO_FALLO: Record<Exclude<EntregaEstado, { ok: true }>["motivo"], string> = {
  invalido: "Este enlace no es válido",
  caducado: "Este enlace ya caducó",
  revocado: "Este enlace se retiró",
  sin_carpeta: "Tu galería todavía no está lista",
};

function NoDisponible({ motivo, mensaje }: { motivo: Exclude<EntregaEstado, { ok: true }>["motivo"]; mensaje: string }) {
  return (
    <Shell>
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.05] p-8 backdrop-blur-xl">
          <Logo className="mx-auto h-6" />
          <h1 className="mt-4 text-xl font-bold">{TITULO_FALLO[motivo]}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{mensaje}</p>
          {motivo !== "sin_carpeta" && (
            <p className="mt-4 text-xs text-muted-foreground/80">Escríbele a tu contacto en Labstream y te comparte uno nuevo.</p>
          )}
        </div>
      </div>
    </Shell>
  );
}

// Hasta cuándo sirve el enlace. La vigencia viaja DENTRO del token (formato de la casa:
// base64url(id).exp.firma), así que se lee de ahí y SOLO para enseñarla: quien decide si el
// enlace vale es `resolverEntrega`, que para cuando llegamos aquí ya dijo que sí. Si el formato
// cambiara, esto devuelve null y la cabecera simplemente calla — mejor callar que prometer una
// fecha inventada.
//
// Se formatea en el SERVIDOR y en hora de Bogotá: si lo hiciera el navegador, el mismo enlace
// diría fechas distintas según el teléfono de quien mira, y saldría un aviso de hidratación.
function vencimientoDelToken(token: string): { largo: string; corto: string } | null {
  const exp = Number(token.split(".")[1]);
  if (!Number.isFinite(exp) || exp <= 0) return null;
  const ms = exp * 1000;
  if (ms < Date.now()) return null;
  return {
    largo: formatBogotaDate(ms, { day: "numeric", month: "long", year: "numeric" }),
    corto: formatBogotaDate(ms, { day: "numeric", month: "short" }),
  };
}

export default async function GaleriaSalaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const estado = await resolverEntrega(token);
  if (!estado.ok) return <NoDisponible motivo={estado.motivo} mensaje={estado.mensaje} />;

  const vence = vencimientoDelToken(token);

  return (
    <Shell>
      <SalaCliente token={token} titulo={estado.titulo} vence={vence?.largo ?? null} venceCorto={vence?.corto ?? null} />
    </Shell>
  );
}
