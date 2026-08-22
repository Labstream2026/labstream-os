import * as React from "react";
import type { Block, Brand } from "@/lib/proposals/types";
import { deckSectionsHtml } from "@/lib/proposals/deck";
import { DECK_CSS } from "@/lib/proposals/deck-assets";
import { DeckEngine } from "./deck-engine";

// URL de las fuentes del referente (Playfair Display + Inter + Poppins).
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600&family=Poppins:wght@500;600;700&display=swap";

// Renderiza el DECK completo (barra de progreso, barra superior, puntos, secciones, flechas y el
// motor). El <style> es de PÁGINA (solo existe en el HTML de esta página, no en el layout global),
// así el CSS del deck no choca con Tailwind del resto de la app. `footer` permite al portal
// añadir la zona de decisión/adjuntos DESPUÉS del deck sin romper el selector `main > section`.
export function DeckView({ blocks, brand, footer }: { blocks: Block[]; brand: Brand; footer?: React.ReactNode }) {
  const sections = deckSectionsHtml(blocks, brand);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={FONTS_HREF} />
      <style dangerouslySetInnerHTML={{ __html: DECK_CSS }} />
      <div id="progress" />
      <header id="topbar">
        <div className="brand">
          <span style={{ fontWeight: 800, letterSpacing: ".02em" }}>{brand.company}</span>
        </div>
        <div className="tag">{brand.tagline || "Propuesta"}</div>
      </header>
      <nav id="dots" />
      <main id="main" dangerouslySetInnerHTML={{ __html: sections }} />
      <button id="navprev" aria-label="Anterior" type="button">‹</button>
      <button id="navnext" aria-label="Siguiente" type="button">›</button>
      {footer}
      <DeckEngine />
    </>
  );
}
