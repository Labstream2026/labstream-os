import type { Prisma } from "@prisma/client";

// ── Usuarios de SERVICIO ───────────────────────────────────────────────────────
// Cuentas que existen solo para ser el titular de una credencial (el techo de permisos de una
// llave `lsk_`). No inician sesión, no leen correo y no hay nadie detrás. Se reconocen por el
// dominio sintético de su email, que es la única marca que las distingue: `isSystemBot` está
// reservado para los bots del chat (Marcebot), que sí publican mensajes.
//
// Importa distinguirlas cuando se avisa a PERSONAS: un aviso que le llega a una cuenta de
// servicio no lo lee nadie, y encima ensucia la cuenta de no leídos de una bandeja fantasma.
export const SERVICE_EMAIL_DOMAIN = "servicio.labstream";

// Email sintético y único para una cuenta de servicio nueva.
export function serviceUserEmail(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 32) || "servicio";
  return `svc-${slug}-${Date.now().toString(36)}@${SERVICE_EMAIL_DOMAIN}`;
}

// Fragmento de `where` para dejar fuera a las cuentas de servicio al buscar PERSONAS.
export const NOT_SERVICE_USER: Prisma.UserWhereInput = {
  email: { not: { endsWith: `@${SERVICE_EMAIL_DOMAIN}` } },
};
