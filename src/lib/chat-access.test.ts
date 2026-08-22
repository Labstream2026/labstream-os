import { describe, it, expect } from "vitest";
import { canAccessChannel } from "./chat-access";
import type { SessionUser } from "@/lib/session";

// ── Fase 4 · el aislamiento del cliente en el chat ──
// La regla más delicada de todo el portal: el cliente solo puede alcanzar canales de audiencia
// CLIENT donde participa, y JAMÁS lo interno del equipo. El fallo aquí filtra conversaciones
// privadas, así que estas pruebas fijan las paredes: si alguien afloja la compuerta, se rompen.

const sess = (id: string, role: string): SessionUser => ({ id, role } as unknown as SessionUser);

const cliente = sess("cli1", "cliente");
const otroCliente = sess("cli2", "cliente");
const editor = sess("ed1", "editor");
const admin = sess("adm", "admin");
const demo = sess("d", "demo");

// Un canal con los campos que mira canAccessChannel; por defecto sin sección.
type Ch = Parameters<typeof canAccessChannel>[0];
const ch = (p: Partial<Ch>): Ch => ({ isPublic: false, audience: null, section: null, project: null, members: [], ...p });

describe("canAccessChannel · el cliente NUNCA ve lo interno", () => {
  it("NIEGA el canal INTERNAL del proyecto aunque el cliente figure como MIEMBRO", () => {
    // Este es el caso real: hoy el invitado del portal es ChannelMember del canal del proyecto,
    // que es audience=INTERNAL. La membresía NO puede darle acceso.
    const canal = ch({
      audience: "INTERNAL",
      project: { leadId: "ed1", members: [{ userId: "cli1" }, { userId: "ed1" }] },
      members: [{ userId: "cli1" }, { userId: "ed1" }],
    });
    expect(canAccessChannel(canal, cliente)).toBe(false);
  });

  it("NIEGA un canal GENERAL público", () => {
    expect(canAccessChannel(ch({ isPublic: true, audience: null }), cliente)).toBe(false);
  });

  it("NIEGA un DIRECT (los directos llegan en un paso posterior, no en el arranque)", () => {
    expect(canAccessChannel(ch({ audience: null, members: [{ userId: "cli1" }, { userId: "ed1" }] }), cliente)).toBe(false);
  });
});

describe("canAccessChannel · el cliente SÍ ve lo suyo (audience CLIENT)", () => {
  it("PERMITE el canal con-cliente de SU proyecto (es miembro del proyecto)", () => {
    const canal = ch({ audience: "CLIENT", project: { leadId: "ed1", members: [{ userId: "cli1" }, { userId: "ed1" }] }, members: [{ userId: "ed1" }] });
    expect(canAccessChannel(canal, cliente)).toBe(true);
  });

  it("PERMITE un canal CLIENT donde es miembro directo del canal (p. ej. el general del cliente)", () => {
    expect(canAccessChannel(ch({ audience: "CLIENT", members: [{ userId: "cli1" }] }), cliente)).toBe(true);
  });

  it("NIEGA el canal CLIENT de OTRO cliente (no es miembro ni de ese proyecto)", () => {
    const canal = ch({ audience: "CLIENT", project: { leadId: "ed1", members: [{ userId: "cli2" }, { userId: "ed1" }] }, members: [{ userId: "cli2" }] });
    expect(canAccessChannel(canal, cliente)).toBe(false);
    expect(canAccessChannel(canal, otroCliente)).toBe(true);
  });
});

describe("canAccessChannel · el equipo no cambia", () => {
  it("admin entra a cualquier canal", () => {
    expect(canAccessChannel(ch({ audience: "INTERNAL" }), admin)).toBe(true);
    expect(canAccessChannel(ch({ audience: "CLIENT" }), admin)).toBe(true);
  });

  it("demo sigue sin chat", () => {
    expect(canAccessChannel(ch({ isPublic: true }), demo)).toBe(false);
  });

  it("un miembro del proyecto entra a su canal INTERNAL", () => {
    const canal = ch({ audience: "INTERNAL", project: { leadId: "otro", members: [{ userId: "ed1" }] }, members: [] });
    expect(canAccessChannel(canal, editor)).toBe(true);
  });

  it("el equipo entra a un canal público, y NO a uno privado donde no está", () => {
    expect(canAccessChannel(ch({ isPublic: true }), editor)).toBe(true);
    expect(canAccessChannel(ch({ isPublic: false, members: [{ userId: "otro" }] }), editor)).toBe(false);
  });

  it("el canal con-cliente (audience CLIENT) también lo ve su equipo por pertenecer al proyecto", () => {
    const canal = ch({ audience: "CLIENT", project: { leadId: "otro", members: [{ userId: "ed1" }] }, members: [] });
    expect(canAccessChannel(canal, editor)).toBe(true);
  });
});
