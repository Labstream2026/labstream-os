import { describe, expect, it } from "vitest";
import { programaEdicion, proyectoEdicionDe } from "./edicion";

// Lo delicado: extraer el proyecto SIN inventar — la pantalla de inicio, el gestor de
// proyectos o un título raro deben dar null, nunca una etiqueta basura.

describe("programaEdicion", () => {
  it("reconoce los tres programas y rechaza el resto", () => {
    expect(programaEdicion("DaVinci Resolve")).toBe("Resolve");
    expect(programaEdicion("Adobe Premiere Pro 2025")).toBe("Premiere");
    expect(programaEdicion("Adobe After Effects 2026")).toBe("After Effects");
    expect(programaEdicion("Google Chrome")).toBeNull();
  });
});

describe("proyectoEdicionDe", () => {
  it("Resolve: el proyecto va antes del nombre del programa", () => {
    expect(proyectoEdicionDe("DaVinci Resolve", "Dermakind agosto - DaVinci Resolve")).toEqual({
      proyecto: "Dermakind agosto",
      programa: "Resolve",
    });
    expect(proyectoEdicionDe("DaVinci Resolve", "Reel Skala v3 - DaVinci Resolve 19")?.proyecto).toBe("Reel Skala v3");
  });

  it("Resolve: también la forma invertida, por si otra versión la usa", () => {
    expect(proyectoEdicionDe("DaVinci Resolve", "DaVinci Resolve 19 - Anuncios Agosto")?.proyecto).toBe("Anuncios Agosto");
  });

  it("Resolve: el gestor de proyectos y la ventana pelada NO son un proyecto", () => {
    expect(proyectoEdicionDe("DaVinci Resolve", "Project Manager - DaVinci Resolve")).toBeNull();
    expect(proyectoEdicionDe("DaVinci Resolve", "DaVinci Resolve")).toBeNull();
  });

  it("Premiere: saca el nombre del .prproj aunque venga con ruta y con asterisco", () => {
    expect(proyectoEdicionDe("Adobe Premiere Pro 2025", "Adobe Premiere Pro 2025 - D:\\Proyectos\\Skala\\Skala_v3.prproj *")).toEqual({
      proyecto: "Skala_v3",
      programa: "Premiere",
    });
  });

  it("After Effects: igual con el .aep", () => {
    expect(proyectoEdicionDe("Adobe After Effects 2026", "Reel agosto.aep * - Adobe After Effects")?.proyecto).toBe("Reel agosto");
  });

  it("sin archivo abierto (pantalla de inicio) no hay proyecto", () => {
    expect(proyectoEdicionDe("Adobe Premiere Pro 2025", "Adobe Premiere Pro 2025 - Inicio")).toBeNull();
    expect(proyectoEdicionDe("Adobe Premiere Pro 2025", "")).toBeNull();
  });

  it("una app que no es de edición devuelve null aunque el título parezca proyecto", () => {
    expect(proyectoEdicionDe("Google Chrome", "Skala_v3.prproj - Drive")).toBeNull();
  });

  it("recorta nombres eternos y limpia el asterisco de cambios sin guardar", () => {
    const largo = "x".repeat(100);
    expect(proyectoEdicionDe("DaVinci Resolve", `${largo} - DaVinci Resolve`)?.proyecto.length).toBe(60);
  });
});
