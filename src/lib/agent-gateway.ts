import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { buildAgentSession } from "@/lib/openclaw/tools";
import { normalizePhone } from "@/lib/whatsapp/config";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import type { ApiKeyContext } from "@/lib/api-key-auth";
import type { SessionUser } from "@/lib/session";

// ── Pasarela de agente: una llave, muchas personas ────────────────────────────
// Una llave lsk_ normal habla SIEMPRE como su titular. Eso sirve para una integración, pero no
// para un bot que atiende a TODO el equipo por WhatsApp: si el bot usa la llave de una persona,
// todos ven lo de esa persona. Aquí el agente dice a quién está atendiendo (su número de WhatsApp,
// que él ya verificó) y el servidor rehace la sesión con los permisos REALES de esa persona.
//
// Tres cierres, en este orden:
//   1. La cabecera solo se mira si la llave está marcada `gateway`. Una llave normal no suplanta.
//   2. Solo se puede ser alguien que YA tiene ese número en su ficha y está activo. No se puede
//      pedir un id de usuario: el agente no elige a quién ser, solo repite un número, y el
//      servidor decide si ese número es de alguien. Un número desconocido NO cae al titular de la
//      llave (eso sería enseñarle los datos del titular a un desconocido): se rechaza.
//   3. Escribir exige, ADEMÁS, `User.agentWrite` en esa persona. Por defecto nadie lo tiene, así
//      que el equipo consulta y solo quien esté habilitado modifica.
//
// Lo que esto NO es: una prueba de identidad. Quien tenga el secreto de una llave de pasarela
// puede afirmar cualquier número registrado. La llave es la credencial de verdad; la cabecera solo
// escoge entre las personas ya autorizadas. Por eso el freno de escritura vive en el servidor y no
// en el agente, y por eso los permisos siguen siendo los del rol de cada quien.

// Cabecera con el remitente VERIFICADO por el agente (número en cualquier formato: se normaliza).
export const GATEWAY_SENDER_HEADER = "x-labstream-whatsapp";

// Segundo canal para decir lo mismo, dentro de los argumentos de la herramienta. Existe porque no
// todo cliente MCP puede poner una cabecera POR PETICIÓN: varios (el de Hermes entre ellos) las
// fijan al ABRIR la conexión y las repiten igual toda la sesión, que es justo lo que no sirve
// cuando un mismo bot atiende a gente distinta. El servidor lo lee, lo usa para identificar y lo
// BORRA de los argumentos antes de ejecutar nada.
// No es una puerta trasera: pasa por la misma resolución (número registrado o 403) y por el mismo
// freno de escritura. Y aunque el modelo lo escribiera él mismo, el agente lo sobrescribe: el
// valor bueno se pone después de que el modelo arma la llamada.
export const GATEWAY_SENDER_ARG = "_remitente_whatsapp";

// Identidad DECLARADA, no verificada: la usan los canales donde no hay forma de saber quién es
// quien pregunta — el panel del asistente y la app de escritorio, que comparten UNA contraseña
// entre todo el equipo. Ahí la persona dice quién es y el agente lo repite; nadie lo comprueba.
// Por eso vale MENOS: sirve para ACOTAR la vista a esa persona, nunca para modificar.
// Y no concede nada nuevo: sin declarar nada, esos canales ya ven la organización entera en solo
// lectura. Declarar solo estrecha lo que se ve. Si además hay remitente VERIFICADO, este se
// ignora — si no, cualquiera por WhatsApp podría "declararse" otro y leer lo ajeno.
export const GATEWAY_DECLARED_ARG = "_remitente_declarado";

const SCOPED_ROLE = "_apikey";

export type GatewayActor = {
  id: string;
  name: string;
  phone: string;
  // false = la persona DIJO quién es y nadie lo comprobó (panel / app de escritorio). Se le acota
  // la vista a lo suyo, pero no se le deja modificar por mucho que esté habilitada.
  verificado: boolean;
};

export type GatewayOutcome =
  | { ok: true; ctx: ApiKeyContext; actor: GatewayActor | null }
  | { ok: false; status: number; error: string };

// Rehace el contexto de la llave para que hable como la persona que le escribió al agente.
// Si no hay nada que hacer (llave sin pasarela, o petición sin cabecera) devuelve el contexto tal
// cual: la Fase 1 —el bot consultando con la identidad de su llave— sigue funcionando igual.
export async function applyAgentGateway(req: NextRequest, ctx: ApiKeyContext): Promise<GatewayOutcome> {
  return resolveGatewayActor(ctx, req.headers.get(GATEWAY_SENDER_HEADER));
}

// El mismo trabajo a partir de un número suelto, venga de donde venga (cabecera o argumento).
// `verificado=false` (identidad declarada, sin comprobar) acota la vista igual, pero deja SIEMPRE
// en solo lectura: quien no puede demostrar quién es, no modifica.
export async function resolveGatewayActor(
  ctx: ApiKeyContext,
  rawPhone: string | null,
  verificado = true,
): Promise<GatewayOutcome> {
  if (!ctx.key.gateway) return { ok: true, ctx, actor: null };

  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: true, ctx, actor: null };

  // Se comparan los números YA normalizados (sin +, sin espacios, sin sufijo @s.whatsapp.net):
  // en la ficha pueden estar guardados de cualquier forma y el agente los manda como los ve.
  const candidates = await db.user.findMany({
    where: { active: true, whatsappPhone: { not: null } },
    select: { id: true, name: true, whatsappPhone: true, agentWrite: true },
  });
  const match = candidates.find((u) => normalizePhone(u.whatsappPhone) === phone);
  if (!match) {
    return {
      ok: false,
      status: 403,
      error:
        "Ese número no está vinculado a ningún miembro activo. Pide que lo agreguen a su ficha en Configuración → Equipo (campo de WhatsApp) para que el asistente pueda atenderle.",
    };
  }

  const session = await buildAgentSession(match.id);
  if (!session) return { ok: false, status: 403, error: "La persona de ese número ya no está activa." };

  // Permisos efectivos = intersección(permisos REALES de esa persona, scopes de la llave). Misma
  // regla que resolveApiKey, aplicada ahora al suplantado: la llave nunca amplía lo que esa
  // persona puede ver, y el rol se degrada SOLO para el admin (el único con bypass incondicional).
  const userPerms = session.role === "admin" ? ALL_PERMISSION_KEYS : session.perms;
  let effective: SessionUser = session;
  if (ctx.key.scopes.length > 0) {
    effective = {
      ...session,
      role: session.role === "admin" ? SCOPED_ROLE : session.role,
      perms: ctx.key.scopes.filter((s) => userPerms.includes(s)),
    };
  }

  // Escribir exige TRES puertas: que la llave no sea de solo lectura, que esa persona esté
  // habilitada para modificar por agente, y que sepamos de verdad que es ella. Basta con que
  // falle una para quedar en solo lectura.
  const readOnly = ctx.readOnly || !match.agentWrite || !verificado;

  return {
    ok: true,
    ctx: { session: effective, key: ctx.key, readOnly },
    actor: { id: match.id, name: match.name, phone, verificado },
  };
}
