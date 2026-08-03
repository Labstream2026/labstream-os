import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { AppKey } from "@prisma/client";
import type { ApiKeyContext } from "@/lib/api-key-auth";

// La pasarela es una frontera de seguridad: decide EN NOMBRE DE QUIÉN habla el agente y si puede
// escribir. Se prueba con la BD y la sesión simuladas, porque lo que importa aquí es la regla, no
// el acceso a datos.

const equipo = [
  { id: "u-jonathan", name: "Jonathan", whatsappPhone: "573017548378", agentWrite: true },
  { id: "u-editor", name: "Duvan", whatsappPhone: "57 311 885 9744", agentWrite: false },
];

vi.mock("@/lib/db", () => ({
  db: { user: { findMany: vi.fn(async () => equipo) } },
}));

vi.mock("@/lib/openclaw/tools", () => ({
  buildAgentSession: vi.fn(async (id: string) => {
    const u = equipo.find((e) => e.id === id);
    if (!u) return null;
    return { id: u.id, name: u.name, email: `${u.id}@x`, role: u.id === "u-jonathan" ? "admin" : "editor", perms: ["ver_proyectos", "editar_proyectos"] };
  }),
}));

const { applyAgentGateway, GATEWAY_SENDER_HEADER } = await import("./agent-gateway");

function req(sender?: string): NextRequest {
  return { headers: { get: (h: string) => (h === GATEWAY_SENDER_HEADER && sender ? sender : null) } } as unknown as NextRequest;
}

function ctx(over: Partial<AppKey> & { readOnly?: boolean } = {}): ApiKeyContext {
  const { readOnly = false, ...key } = over;
  return {
    session: { id: "u-titular", name: "Titular", email: "t@x", role: "admin", perms: [] } as never,
    key: { id: "k1", name: "Hermes", scopes: [], readOnly, gateway: true, userId: "u-titular", ...key } as AppKey,
    readOnly,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("pasarela de agente", () => {
  it("una llave SIN pasarela ignora la cabecera y sigue hablando como su titular", async () => {
    const r = await applyAgentGateway(req("573017548378"), ctx({ gateway: false }));
    expect(r.ok && r.actor).toBeNull();
    expect(r.ok && r.ctx.session.id).toBe("u-titular");
  });

  it("sin cabecera se comporta como siempre (la Fase 1 no se rompe)", async () => {
    const r = await applyAgentGateway(req(), ctx());
    expect(r.ok && r.actor).toBeNull();
    expect(r.ok && r.ctx.session.id).toBe("u-titular");
  });

  it("con el número de alguien del equipo, habla como esa persona", async () => {
    const r = await applyAgentGateway(req("573118859744"), ctx());
    expect(r.ok && r.ctx.session.id).toBe("u-editor");
    expect(r.ok && r.actor?.name).toBe("Duvan");
  });

  // El número llega como lo ve WhatsApp (con jid, con +, con espacios) y en la ficha está escrito
  // a mano: los dos lados se normalizan antes de comparar.
  it("empareja aunque el formato del número no coincida", async () => {
    for (const forma of ["573118859744@s.whatsapp.net", "+57 311 885 9744", "573118859744:12"]) {
      const r = await applyAgentGateway(req(forma), ctx());
      expect(r.ok && r.ctx.session.id).toBe("u-editor");
    }
  });

  // Lo importante: un número desconocido NO cae al titular de la llave — eso le enseñaría los datos
  // del titular a cualquiera que le escriba al bot.
  it("rechaza un número que no es de nadie, en vez de caer al titular", async () => {
    const r = await applyAgentGateway(req("573001112233"), ctx());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.status).toBe(403);
  });

  it("quien no está habilitado queda en solo lectura aunque la llave permita escribir", async () => {
    const r = await applyAgentGateway(req("573118859744"), ctx({ readOnly: false }));
    expect(r.ok && r.ctx.readOnly).toBe(true);
  });

  it("quien SÍ está habilitado escribe, si la llave también lo permite", async () => {
    const r = await applyAgentGateway(req("573017548378"), ctx({ readOnly: false }));
    expect(r.ok && r.ctx.readOnly).toBe(false);
    expect(r.ok && r.ctx.session.id).toBe("u-jonathan");
  });

  it("una llave de solo lectura nunca deja escribir, ni al habilitado", async () => {
    const r = await applyAgentGateway(req("573017548378"), ctx({ readOnly: true }));
    expect(r.ok && r.ctx.readOnly).toBe(true);
  });

  // Los scopes de la llave siguen recortando: la pasarela nunca amplía lo que esa persona puede.
  it("los permisos son la intersección de los de la persona con los scopes de la llave", async () => {
    const r = await applyAgentGateway(req("573118859744"), ctx({ scopes: ["ver_proyectos", "ver_finanzas"] }));
    expect(r.ok && r.ctx.session.perms).toEqual(["ver_proyectos"]);
  });

  // Al admin se le quita el bypass incondicional cuando la llave tiene scopes; si no, una llave
  // acotada le daría TODO igualmente.
  it("al admin con llave acotada se le quita el bypass de rol", async () => {
    const r = await applyAgentGateway(req("573017548378"), ctx({ scopes: ["ver_proyectos"] }));
    expect(r.ok && r.ctx.session.role).toBe("_apikey");
    expect(r.ok && r.ctx.session.perms).toEqual(["ver_proyectos"]);
  });
});
