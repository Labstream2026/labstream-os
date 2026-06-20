import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { createWithSequentialCode, maxCodeFrom } from "./sequential-code";

const p2002 = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });

describe("createWithSequentialCode (código secuencial a prueba de colisiones)", () => {
  it("deriva el siguiente número del código más alto existente", async () => {
    const codes: string[] = [];
    const out = await createWithSequentialCode({
      prefix: "COT",
      findMaxCode: async () => "COT-0005",
      create: async (code) => { codes.push(code); return code; },
    });
    expect(out).toBe("COT-0006");
    expect(codes).toEqual(["COT-0006"]);
  });

  it("arranca en 0001 cuando no hay ninguno", async () => {
    const out = await createWithSequentialCode({
      prefix: "FAC",
      findMaxCode: async () => null,
      create: async (code) => code,
    });
    expect(out).toBe("FAC-0001");
  });

  it("reintenta con el siguiente número ante P2002 (colisión)", async () => {
    const attempts: string[] = [];
    const out = await createWithSequentialCode({
      prefix: "PROP",
      findMaxCode: async () => "PROP-0010", // el máximo no cambia (par en vuelo aún no visible)
      create: async (code) => {
        attempts.push(code);
        if (code === "PROP-0011") throw p2002(); // el primer intento choca
        return code;
      },
    });
    expect(attempts).toEqual(["PROP-0011", "PROP-0012"]); // avanza el offset
    expect(out).toBe("PROP-0012");
  });

  it("propaga de inmediato un error que NO es P2002 (no reintenta)", async () => {
    let calls = 0;
    await expect(
      createWithSequentialCode({
        prefix: "COT",
        findMaxCode: async () => "COT-0001",
        create: async () => { calls++; throw new Error("boom"); },
      }),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });

  it("se rinde tras agotar los reintentos si todo choca", async () => {
    let calls = 0;
    await expect(
      createWithSequentialCode({
        prefix: "COT",
        retries: 2,
        findMaxCode: async () => "COT-0001",
        create: async () => { calls++; throw p2002(); },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(calls).toBe(3); // intento inicial + 2 reintentos
  });
});

describe("maxCodeFrom (mayor código por NÚMERO, no por orden alfabético)", () => {
  it("elige el de mayor número aunque el ancho cambie (9999 → 10000)", async () => {
    const findMany = async () => [{ code: "LS-9999" }, { code: "LS-10000" }];
    expect(await maxCodeFrom(findMany)).toBe("LS-10000");
  });

  it("devuelve null si no hay filas", async () => {
    expect(await maxCodeFrom(async () => [])).toBeNull();
  });
});
