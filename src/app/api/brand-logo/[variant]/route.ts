import { NextResponse, type NextRequest } from "next/server";
import { readOrgLogo, type LogoVariant } from "@/lib/org-logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sirve el logo de la organización: el SUBIDO si existe, si no el de fábrica. Un solo URL por
// variante para que el componente Logo no tenga que saber cuál hay. ETag por mtime para que el
// navegador refresque cuando cambies el logo, sin cachear de más.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ variant: string }> }) {
  const { variant } = await ctx.params;
  if (variant !== "light" && variant !== "dark") {
    return new NextResponse("No encontrado", { status: 404 });
  }
  const logo = await readOrgLogo(variant as LogoVariant);
  if (!logo) return new NextResponse("No encontrado", { status: 404 });
  return new NextResponse(new Uint8Array(logo.buf), {
    headers: {
      "Content-Type": "image/png",
      // Revalida siempre (304 barato por ETag) para que un logo recién subido aparezca ya.
      "Cache-Control": "public, max-age=0, must-revalidate",
      ETag: `"${Math.round(logo.mtimeMs)}-${logo.custom ? "c" : "b"}"`,
    },
  });
}
