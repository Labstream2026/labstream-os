"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { headers, cookies } from "next/headers";
import { verifyProposalToken, signProposalUnlock } from "@/lib/proposals/token";
import { verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { notifyAndEmail } from "@/lib/notify";
import { sendEmail, emailButton } from "@/lib/email";

// Nombre de la cookie de desbloqueo POR propuesta: así desbloquear una no pisa el acceso a otra.
const unlockCookie = (id: string) => `proposal-unlock-${id}`;

const APP_URL = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
// Escapa texto del cliente antes de meterlo en el HTML del correo (evita inyección/XSS).
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// IP del cliente (último salto de X-Forwarded-For = el que ve el proxy de confianza; el primero lo
// pone el cliente y es falsificable). Solo para dejar constancia, no para autorizar.
async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    return (xff ? xff.split(",").pop()?.trim() : h.get("x-real-ip")) || null;
  } catch {
    return null;
  }
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Clave de rate-limit a partir del token (autorización del portal) y, si está disponible,
// la IP. Evita que un token filtrado se use para inundar la BD.
async function rlKey(token: string): Promise<string> {
  let ip = "";
  try {
    const h = await headers();
    // ÚLTIMO salto de X-Forwarded-For = la IP que vio el proxy de confianza (DSM). El primer
    // segmento lo pone el CLIENTE y es falsificable (rotarlo evadía el límite). Mismo criterio que
    // el login. Si no hay XFF, se usa x-real-ip.
    const xff = h.get("x-forwarded-for");
    ip = xff ? (xff.split(",").pop()?.trim() ?? "") : (h.get("x-real-ip") ?? "");
  } catch {
    /* headers() no disponible */
  }
  return `${token}:${ip}`;
}

// Acción PÚBLICA (sin sesión): el cliente acepta la propuesta desde su enlace. Autorización = token
// firmado. Captura nombre y correo del cliente para dejar CONSTANCIA de quién y cuándo aceptó, avisa
// al equipo (in-app + correo) y le manda al cliente un correo de confirmación a su propio buzón. El
// registro se guarda SIEMPRE; los correos son best-effort (si el correo no está configurado, no
// rompen la aceptación). Devuelve {ok,error} para pintar el error en el formulario.
export async function acceptProposal(token: string, name: string, email: string): Promise<{ ok: boolean; error?: string; emailed?: boolean }> {
  if (!rateLimit(`accept-proposal:${await rlKey(token)}`, 20, 60_000)) {
    return { ok: false, error: "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo." };
  }
  const nm = (typeof name === "string" ? name : "").trim().slice(0, 120);
  const em = (typeof email === "string" ? email : "").trim().slice(0, 160);
  if (nm.length < 2) return { ok: false, error: "Escribe tu nombre." };
  if (!EMAIL_RE.test(em)) return { ok: false, error: "Escribe un correo válido." };

  const id = verifyProposalToken(token);
  if (!id) return { ok: false, error: "Enlace inválido o vencido." };
  const p = await db.proposal.findUnique({
    where: { id },
    select: { status: true, expiresAt: true, title: true, code: true, createdById: true, brand: true },
  });
  if (!p) return { ok: false, error: "Propuesta no disponible." };
  if (p.status === "ACEPTADA") return { ok: true }; // ya aceptada: idempotente, sin re-avisar
  if (p.expiresAt && new Date(p.expiresAt).getTime() < Date.now()) return { ok: false, error: "Esta propuesta venció." };

  const ip = await clientIp();
  // Atómico: solo pasa a ACEPTADA si aún no lo está (evita la carrera de doble clic / doble pestaña).
  // updateMany devuelve el número de filas tocadas: 0 = otro ya la aceptó → no re-avisamos.
  const res = await db.proposal.updateMany({
    where: { id, status: { not: "ACEPTADA" } },
    data: { status: "ACEPTADA", acceptedAt: new Date(), acceptedByName: nm, acceptedByEmail: em, acceptedByIp: ip },
  });
  revalidatePath(`/p/${token}`);
  if (res.count === 0) return { ok: true }; // ganó otra petición concurrente; ya quedó aceptada

  const brand = (p.brand ?? {}) as { company?: string; email?: string };
  const company = brand.company || "Labstream";
  const nombrePieza = p.title || p.code;

  // Aviso al EQUIPO (autor de la propuesta): notificación in-app + correo si está configurado.
  await notifyAndEmail(p.createdById, {
    type: "proposal",
    title: `Propuesta aceptada: ${nombrePieza}`,
    body: `${nm} (${em}) aceptó la propuesta «${nombrePieza}».`,
    link: `/cotizaciones/propuestas/${id}`,
  }).catch(() => {});

  // Correo de CONFIRMACIÓN al cliente, a su propio buzón: su copia de la aceptación (constancia por
  // su lado). Best-effort: si el correo no está configurado, sendEmail devuelve {ok:false} sin lanzar,
  // y `emailed` queda en false para que el portal NO afirme que se envió un correo que no salió.
  // Nota: el destinatario es el correo que TECLEA quien tenga el enlace; con el enlace filtrado se
  // podría mandar UN comprobante a una dirección ajena (acotado a 1 por propuesta, y el enlace ya
  // daba acceso a ver/aceptar). Es el compromiso inherente de una aceptación sin sesión.
  const verUrl = `${APP_URL}/p/${token}`;
  let emailed = false;
  try {
    const r = await sendEmail({
      to: em,
      subject: `Confirmación: aceptaste la propuesta «${nombrePieza}»`,
      text: `Hola ${nm},\n\nRecibimos tu aceptación de la propuesta «${nombrePieza}» de ${company}. Nos pondremos en contacto para coordinar los siguientes pasos.\n\nVer la propuesta: ${verUrl}`,
      html: `<p style="margin:0 0 6px;color:#6b6b6b;font-size:14px">Hola ${esc(nm)},</p>
        <h1 style="margin:0 0 12px;font-size:19px;font-weight:700;color:#111;line-height:1.35">Recibimos tu aceptación</h1>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.65">Confirmamos que aceptaste la propuesta <strong>«${esc(nombrePieza)}»</strong> de ${esc(company)}. Nos pondremos en contacto para coordinar los siguientes pasos. Este correo es tu comprobante.</p>
        ${emailButton("Ver la propuesta  →", verUrl)}`,
      replyTo: brand.email || undefined,
    });
    emailed = r.ok;
  } catch {
    emailed = false;
  }

  return { ok: true, emailed };
}

// Acción PÚBLICA: el cliente dice que NO, con motivo.
//
// Hasta ahora el portal solo permitía aceptar: una propuesta perdida se quedaba «Enviada» para
// siempre y nadie sabía por qué. El MOTIVO es lo valioso — precio, tiempos, se fue con otro—,
// así que es obligatorio, pero se pide en una frase, no en un formulario.
//
// Simétrica a acceptProposal: mismo rate-limit, misma validación y el mismo cambio ATÓMICO
// (updateMany con guarda) para que dos clics no avisen dos veces. Una propuesta ya ACEPTADA no
// se puede rechazar por aquí: ese cambio de opinión lo maneja el equipo.
export async function rejectProposal(
  token: string,
  name: string,
  email: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!rateLimit(`reject-proposal:${await rlKey(token)}`, 20, 60_000)) {
    return { ok: false, error: "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo." };
  }
  const nm = (typeof name === "string" ? name : "").trim().slice(0, 120);
  const em = (typeof email === "string" ? email : "").trim().slice(0, 160);
  const why = (typeof reason === "string" ? reason : "").trim().slice(0, 500);
  if (nm.length < 2) return { ok: false, error: "Escribe tu nombre." };
  if (!EMAIL_RE.test(em)) return { ok: false, error: "Escribe un correo válido." };
  if (why.length < 3) return { ok: false, error: "Cuéntanos brevemente el motivo: nos ayuda a mejorar la próxima." };

  const id = verifyProposalToken(token);
  if (!id) return { ok: false, error: "Enlace inválido o vencido." };
  const p = await db.proposal.findUnique({
    where: { id },
    select: { status: true, title: true, code: true, createdById: true },
  });
  if (!p) return { ok: false, error: "Propuesta no disponible." };
  if (p.status === "ACEPTADA") return { ok: false, error: "Esta propuesta ya fue aceptada. Escríbenos y lo revisamos contigo." };
  if (p.status === "RECHAZADA") return { ok: true }; // idempotente: ya estaba, sin re-avisar

  const res = await db.proposal.updateMany({
    where: { id, status: { notIn: ["ACEPTADA", "RECHAZADA"] } },
    data: { status: "RECHAZADA", rejectedAt: new Date(), rejectedByName: nm, rejectedByEmail: em, rejectReason: why },
  });
  revalidatePath(`/p/${token}`);
  if (res.count === 0) return { ok: true }; // ganó otra petición concurrente

  const nombrePieza = p.title || p.code;
  await notifyAndEmail(p.createdById, {
    type: "proposal",
    title: `Propuesta no aprobada: ${nombrePieza}`,
    body: `${nm} (${em}) no aprobó la propuesta «${nombrePieza}». Motivo: ${why}`,
    link: `/cotizaciones/propuestas/${id}`,
  }).catch(() => {});

  return { ok: true };
}

// Acción PÚBLICA (sin sesión): el cliente escribe la contraseña de la reja para desbloquear la
// propuesta. Si acierta, se deja una cookie httpOnly firmada (30 días) para no volver a pedirla.
// Rate-limit estricto para frenar el adivinado por fuerza bruta. Devuelve {ok,error} (no lanza) para
// pintar el error en la reja.
export async function unlockProposal(token: string, password: string): Promise<{ ok: boolean; error?: string }> {
  // Tope GLOBAL por propuesta (independiente de la IP): aunque el atacante rote la IP falsificando
  // X-Forwarded-For, no puede exceder este número de intentos por minuto contra la MISMA propuesta.
  // Es la defensa real de fuerza bruta; el límite por-IP de abajo es una capa extra.
  if (!rateLimit(`unlock-proposal-all:${token}`, 15, 60_000)) {
    return { ok: false, error: "Demasiados intentos. Espera un minuto e inténtalo de nuevo." };
  }
  if (!rateLimit(`unlock-proposal:${await rlKey(token)}`, 8, 60_000)) {
    return { ok: false, error: "Demasiados intentos. Espera un minuto e inténtalo de nuevo." };
  }
  const id = verifyProposalToken(token);
  if (!id) return { ok: false, error: "Enlace inválido o vencido." };
  const p = await db.proposal.findUnique({ where: { id }, select: { accessPasswordHash: true } });
  if (!p) return { ok: false, error: "Propuesta no disponible." };
  // Sin reja: nada que desbloquear (no revela si existe o no; simplemente ya es accesible).
  if (!p.accessPasswordHash) return { ok: true };
  const pass = typeof password === "string" ? password : "";
  if (!pass || !(await verifyPassword(pass, p.accessPasswordHash))) {
    return { ok: false, error: "Contraseña incorrecta." };
  }
  const store = await cookies();
  // La cookie se firma ligada al hash vigente: cambiar/quitar la clave invalida los accesos previos.
  store.set(unlockCookie(id), signProposalUnlock(id, p.accessPasswordHash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/p",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath(`/p/${token}`);
  return { ok: true };
}
