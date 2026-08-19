import { describe, expect, it } from "vitest";
import { bloqueBoton, bloqueCaja, bloqueSeparador, bloqueTarjeta, PLANTILLAS_BASE } from "./bloques";
import { sanearSaliente } from "./redactar";

// Los bloques del redactor DEBEN sobrevivir al sanitizador del envío tal cual: si la
// allowlist recorta el estilo del botón, el cliente recibe un enlace azul pelado en vez del
// botón — y nadie se entera hasta que un correo llega feo.

describe("bloques a prueba del sanitizador", () => {
  it("el botón conserva fondo, color y padding (es un botón, no un enlace pelado)", () => {
    const out = sanearSaliente(bloqueBoton("Ver video", "https://os.labstreamsas.com/review/x"));
    expect(out).toContain("background:#18181b");
    expect(out).toContain("color:#ffffff");
    expect(out).toContain("padding:11px 26px");
    expect(out).toContain("border-radius:8px");
    expect(out).toContain('href="https://os.labstreamsas.com/review/x"');
  });

  it("la tarjeta conserva la tabla con su borde", () => {
    const out = sanearSaliente(bloqueTarjeta("Reel — v2", "https://x.co", "Nota corta"));
    expect(out).toContain("<table");
    expect(out).toContain("border:1px solid #e4e4e7");
    expect(out).toContain("Reel — v2");
    expect(out).toContain("Nota corta");
  });

  it("la caja conserva el resaltado y el borde izquierdo", () => {
    const out = sanearSaliente(bloqueCaja("No se puede perder"));
    expect(out).toContain("background:#f4f4f5");
    expect(out).toContain("border-left:3px solid #18181b");
  });

  it("el separador sobrevive", () => {
    expect(sanearSaliente(bloqueSeparador())).toContain("<hr");
  });

  it("títulos, color y centrado del redactor pasan; lo peligroso no", () => {
    const out = sanearSaliente(
      `<h2 style="font-size:18px">Título</h2><p style="text-align:center;color:#0369a1">centrado</p><p style="position:fixed;color:#0369a1">malo</p>`,
    );
    expect(out).toContain("<h2");
    expect(out).toContain("text-align:center");
    expect(out).toContain("color:#0369a1");
    expect(out).not.toContain("position");
  });

  it("los textos del usuario dentro de un bloque van escapados", () => {
    const out = bloqueBoton(`<script>x</script>`, "https://x.co");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("las tres plantillas de fábrica pasan el sanitizador sin perder sus botones", () => {
    for (const p of PLANTILLAS_BASE) {
      const out = sanearSaliente(p.html);
      expect(out).toContain("background:#18181b"); // todas llevan al menos un botón
      expect(out.length).toBeGreaterThan(p.html.length * 0.8); // nada se desplomó
    }
  });
});
