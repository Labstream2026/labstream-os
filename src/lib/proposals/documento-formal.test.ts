import { describe, expect, it } from "vitest";
import { documentoFormalHtml, documentoFormalWord } from "./documento-formal";
import { BRAND_DEFAULT, type Block } from "./types";

const datosBase = {
  brand: { ...BRAND_DEFAULT, company: "Labstream", accent: "#2563eb" },
  code: "PROP-0009",
  title: "Contenido para la Clínica",
  clientName: "Clínica Vital",
  fecha: "21 de agosto de 2026",
  validez: "15 días",
};

describe("documentoFormalHtml", () => {
  const blocks: Block[] = [
    { type: "hero", title: "Contenido", subtitle: "Educa y genera confianza." },
    { type: "cards", title: "Qué incluye", items: [{ icon: "🎬", t: "Rodaje mensual", d: "Una jornada." }] },
    { type: "entregables", title: "Entregables", items: [{ q: "8", t: "Reels al mes", d: "Listos para publicar." }] },
    { type: "timeline", title: "Proceso", steps: [{ phase: "Estrategia", dur: "Semana 1", desc: "Plan editorial." }] },
    {
      type: "budget",
      title: "Inversión",
      price: 2100000,
      discountPct: 10,
      iva: 19,
      cur: "COP",
      showIncluded: true,
      sections: [{ s: "Producción", items: [{ t: "Jornada de rodaje", d: "", u: "día", q: 1, v: 999999 }] }],
      note: "Valores antes de IVA.",
    },
  ];

  const html = documentoFormalHtml({ ...datosBase, blocks });

  it("incluye el encabezado, el cliente y las secciones numeradas", () => {
    expect(html).toContain("Labstream");
    expect(html).toContain("PROP-0009");
    expect(html).toContain("Clínica Vital");
    expect(html).toContain("1. Objeto");
    expect(html).toContain("Entregables");
    expect(html).toContain("Inversión");
    expect(html).toContain("Condiciones");
  });

  it("muestra los entregables estructurados", () => {
    expect(html).toContain("Reels al mes");
    expect(html).toContain("8");
  });

  it("muestra el TOTAL al cliente pero NUNCA el costo interno", () => {
    // 2.100.000 − 10% = 1.890.000; +19% IVA = 2.249.100.
    expect(html).toContain("2.249.100");
    // El valor interno del catálogo (999.999) jamás debe aparecer.
    expect(html).not.toContain("999.999");
    expect(html).not.toContain("999999");
  });

  it("lista los servicios incluidos por NOMBRE (sin su precio)", () => {
    expect(html).toContain("Jornada de rodaje");
  });

  it("no tiene secciones vacías: sin entregables no se pinta esa sección", () => {
    const sinEntregables = documentoFormalHtml({ ...datosBase, blocks: [{ type: "hero", title: "X", subtitle: "Y" }] });
    expect(sinEntregables).not.toContain("Entregables");
    expect(sinEntregables).toContain("1. Objeto");
  });

  it("escapa el HTML del contenido (no se inyecta markup)", () => {
    const html2 = documentoFormalHtml({ ...datosBase, title: "<script>x</script>", blocks: [] });
    expect(html2).not.toContain("<script>x</script>");
    expect(html2).toContain("&lt;script&gt;");
  });
});

describe("documentoFormalWord", () => {
  it("envuelve el contenido en un documento HTML completo para Word", () => {
    const w = documentoFormalWord({ ...datosBase, blocks: [{ type: "hero", title: "X", subtitle: "Y" }] });
    expect(w).toMatch(/^<!DOCTYPE html>/);
    expect(w).toContain("<body>");
    expect(w).toContain("@page");
  });
});
