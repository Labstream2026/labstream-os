import { describe, it, expect } from "vitest";
import { parseServiceAccount } from "./google-auth";

// El JSON de la cuenta de servicio lo pega un humano en el .env del NAS, y ahí es donde falla:
// el archivo de Google trae la clave privada con saltos de línea REALES, que un .env parte en
// varias líneas y rompe. Por eso se aceptan los dos formatos (JSON crudo y base64) y se
// restauran los "\n" escapados. Estos casos son exactamente los errores de pegado plausibles.

// Clave de mentira: NO es válida para firmar, solo para comprobar el parseo (no conecta con nada).
const CLAVE = "-----BEGIN PRIVATE KEY-----\nLINEA1\nLINEA2\n-----END PRIVATE KEY-----\n";
const CUENTA = { client_email: "bot@proyecto.iam.gserviceaccount.com", private_key: CLAVE };

describe("parseServiceAccount (lee la credencial de Google como la pegue un humano)", () => {
  it("acepta el JSON tal cual lo descarga Google", () => {
    const sa = parseServiceAccount(JSON.stringify(CUENTA));
    expect(sa?.client_email).toBe("bot@proyecto.iam.gserviceaccount.com");
    expect(sa?.private_key).toBe(CLAVE);
  });

  it("acepta el JSON en base64 (la forma cómoda de meterlo en una línea del .env)", () => {
    const b64 = Buffer.from(JSON.stringify(CUENTA), "utf8").toString("base64");
    expect(parseServiceAccount(b64)?.private_key).toBe(CLAVE);
  });

  it("restaura los saltos de línea escapados: sin esto, la firma falla con «no start line»", () => {
    // Es el caso REAL: al pegar el JSON en un .env, los saltos se escriben como "\\n" literales.
    const escapado = JSON.stringify({ ...CUENTA, private_key: CLAVE.replace(/\n/g, "\\n") });
    expect(parseServiceAccount(escapado)?.private_key).toBe(CLAVE);
  });

  it("tolera espacios y saltos alrededor al copiar y pegar", () => {
    expect(parseServiceAccount(`\n  ${JSON.stringify(CUENTA)}  \n`)?.client_email).toBe(CUENTA.client_email);
  });

  it("devuelve null si no hay credencial: la app debe seguir con la descarga anónima, no romperse", () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount(null)).toBeNull();
    expect(parseServiceAccount("")).toBeNull();
    expect(parseServiceAccount("   ")).toBeNull();
  });

  it("devuelve null ante basura o JSON incompleto, en vez de lanzar", () => {
    expect(parseServiceAccount("no soy json")).toBeNull();
    expect(parseServiceAccount("{roto")).toBeNull();
    // Le falta private_key: sin ella no se puede firmar nada.
    expect(parseServiceAccount(JSON.stringify({ client_email: "a@b.c" }))).toBeNull();
    // Le falta client_email: Google no sabría quién pide el token.
    expect(parseServiceAccount(JSON.stringify({ private_key: CLAVE }))).toBeNull();
  });
});
