import { describe, expect, it } from "vitest";
import { sanearSaliente, extraerInlines, bloqueFirma, aplicarPlantillaFirma, textoDeHtml, htmlDeTexto } from "./redactar";

// El pipeline del redactor: lo que escribe el equipo se sanea igual que lo hostil, las
// imágenes del cuerpo se vuelven partes CID, y la firma se compone con su imagen incrustada.

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("sanearSaliente", () => {
  it("deja el formato del redactor y mata lo peligroso", () => {
    const html = `<div><b>Hola</b> <script>alert(1)</script><a href="javascript:x" >mal</a><a href="https://ok.co">bien</a></div>`;
    const out = sanearSaliente(html);
    expect(out).toContain("<b>Hola</b>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("javascript:");
    expect(out).toContain('href="https://ok.co"');
    expect(out).toContain('target="_blank"');
  });
  it("permite img con data: y cid: (el vehículo hacia el CID)", () => {
    const out = sanearSaliente(`<img src="data:image/png;base64,${PNG_1PX}"><img src="cid:x@y">`);
    expect(out.match(/<img/g)?.length).toBe(2);
  });
});

describe("extraerInlines", () => {
  const sinGifs = async () => null;
  it("data: → parte CID y el src reescrito", async () => {
    const r = await extraerInlines(`<p>hola</p><img src="data:image/png;base64,${PNG_1PX}" alt="x">`, sinGifs);
    expect(r.inlines).toHaveLength(1);
    expect(r.inlines[0].mime).toBe("image/png");
    expect(r.html).toContain(`src="cid:${r.inlines[0].cid}"`);
    expect(r.html).not.toContain("data:image");
  });
  it("referencia de la biblioteca /api/correo/gif/<id> → bytes vía cargarGif", async () => {
    const r = await extraerInlines(`<img src="/api/correo/gif/abc123">`, async (id) =>
      id === "abc123" ? { nombre: "saludo.gif", mime: "image/gif", contenido: Buffer.from("GIF89a") } : null,
    );
    expect(r.inlines).toHaveLength(1);
    expect(r.inlines[0].nombre).toBe("saludo.gif");
    expect(r.html).toContain("cid:");
  });
  it("una URL remota se queda como está (no se incrusta lo ajeno)", async () => {
    const html = `<img src="https://otro.com/x.png">`;
    const r = await extraerInlines(html, sinGifs);
    expect(r.inlines).toHaveLength(0);
    expect(r.html).toBe(html);
  });
});

describe("bloqueFirma", () => {
  it("sin firma personalizada: la institucional con nombre y cargo", () => {
    const f = bloqueFirma({ nombre: "Diana Ruiz", cargo: "Productora" });
    expect(f.html).toContain("<b>Diana Ruiz</b>");
    expect(f.html).toContain("Productora");
    expect(f.html).toContain("labstreamsas.com");
    expect(f.cidImagen).toBeNull();
  });
  it("con imagen: el <img cid:firma>", () => {
    const f = bloqueFirma({ nombre: "D", tieneImagen: true });
    expect(f.cidImagen).toBe("firma@labstream");
    expect(f.html).toContain('src="cid:firma@labstream"');
  });
  it("la firma personalizada se sanea (nada de scripts en la firma)", () => {
    const f = bloqueFirma({ nombre: "D", firmaHtml: `<b>Yo</b><script>x</script>` });
    expect(f.html).toContain("<b>Yo</b>");
    expect(f.html).not.toContain("script");
  });
});

describe("aplicarPlantillaFirma", () => {
  it("sustituye {{nombre}} y {{cargo}} con y sin espacios, sin distinguir mayúsculas", () => {
    const out = aplicarPlantillaFirma("<b>{{nombre}}</b> · {{ Cargo }} · {{NOMBRE}}", { nombre: "Diana", cargo: "Productora" });
    expect(out).toBe("<b>Diana</b> · Productora · Diana");
  });
  it("escapa los valores: un nombre jamás inyecta HTML en la firma corporativa", () => {
    const out = aplicarPlantillaFirma("{{nombre}}", { nombre: `<img src=x onerror=1>` });
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
  it("cargo vacío desaparece limpio", () => {
    expect(aplicarPlantillaFirma("{{nombre}}{{cargo}}", { nombre: "D", cargo: null })).toBe("D");
  });
});

describe("texto ↔ html", () => {
  it("textoDeHtml conserva los saltos de párrafo y viñetas", () => {
    const t = textoDeHtml("<p>Hola</p><p>Chao</p><ul><li>uno</li><li>dos</li></ul>");
    expect(t).toContain("Hola\n");
    expect(t).toContain("· uno");
    expect(t).toContain("· dos");
  });
  it("htmlDeTexto escapa y convierte saltos", () => {
    expect(htmlDeTexto("a<b\nc")).toBe("a&lt;b<br>c");
  });
});
