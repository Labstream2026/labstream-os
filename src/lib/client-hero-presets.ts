// ── Galería de portadas del cliente ──
// Portadas "de fábrica" para la cabecera tipo Notion de la ficha del cliente: degradados y
// texturas en CSS puro (pesan cero, cargan al instante y no gastan disco del NAS). Se guardan
// en la MISMA columna `Client.bannerUrl` con el valor centinela `preset:<key>` — así no hay
// columnas nuevas y quitar/reemplazar funciona igual que con una imagen subida.
// Compartido por el componente (pinta el fondo) y la server action (valida la key).

export type HeroPreset = { key: string; label: string; bg: string };

export const HERO_PRESETS: HeroPreset[] = [
  {
    key: "cine",
    label: "Cine",
    bg: "radial-gradient(85% 80% at 78% 20%, rgba(240,138,60,.55) 0%, transparent 60%), radial-gradient(70% 90% at 12% 85%, rgba(56,130,146,.6) 0%, transparent 65%), linear-gradient(160deg,#17252e 0%,#23343d 52%,#101a20 100%)",
  },
  {
    key: "bokeh",
    label: "Bokeh estudio",
    bg: "radial-gradient(18% 32% at 82% 30%, rgba(240,138,60,.5) 0%, transparent 100%), radial-gradient(10% 18% at 68% 62%, rgba(255,255,255,.28) 0%, transparent 100%), radial-gradient(8% 14% at 90% 70%, rgba(255,196,120,.4) 0%, transparent 100%), radial-gradient(6% 12% at 30% 40%, rgba(255,255,255,.18) 0%, transparent 100%), linear-gradient(150deg,#231c16 0%,#38281c 60%,#191410 100%)",
  },
  {
    key: "paisaje",
    label: "Paisaje",
    bg: "radial-gradient(120% 70% at 15% 12%, #f4efe2 0%, transparent 55%), radial-gradient(90% 60% at 85% 8%, #e9e2ce 0%, transparent 60%), radial-gradient(150% 90% at 50% 108%, #5d6b4a 0%, #7c8a5e 34%, #a3ad7f 58%, transparent 78%), linear-gradient(180deg,#cfd6d8 0%,#dfd9c4 46%,#9aa676 100%)",
  },
  {
    key: "neon",
    label: "Neón",
    bg: "radial-gradient(70% 90% at 80% 15%, rgba(236,72,153,.5) 0%, transparent 60%), radial-gradient(60% 80% at 15% 90%, rgba(124,92,214,.6) 0%, transparent 65%), linear-gradient(150deg,#180f2c 0%,#241640 55%,#120b20 100%)",
  },
  {
    key: "arena",
    label: "Arena",
    bg: "radial-gradient(90% 70% at 20% 0%, #f7ead6 0%, transparent 60%), radial-gradient(110% 80% at 85% 100%, #d9b98c 0%, transparent 65%), linear-gradient(170deg,#f2e3cb 0%,#e6cda4 60%,#cfa877 100%)",
  },
  {
    key: "noche",
    label: "Noche",
    bg: "radial-gradient(2px 2px at 20% 30%, rgba(255,255,255,.9) 50%, transparent 51%), radial-gradient(1.5px 1.5px at 45% 15%, rgba(255,255,255,.7) 50%, transparent 51%), radial-gradient(2px 2px at 70% 40%, rgba(255,255,255,.8) 50%, transparent 51%), radial-gradient(1.5px 1.5px at 85% 20%, rgba(255,255,255,.6) 50%, transparent 51%), radial-gradient(1.5px 1.5px at 60% 70%, rgba(255,255,255,.5) 50%, transparent 51%), radial-gradient(120% 100% at 50% 120%, #1b2c4d 0%, transparent 70%), linear-gradient(180deg,#080d1a 0%,#101c36 100%)",
  },
  {
    key: "malla",
    label: "Malla",
    bg: "repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 1px, transparent 1px 24px), radial-gradient(80% 90% at 80% 10%, rgba(240,138,60,.25) 0%, transparent 60%), linear-gradient(160deg,#20242b 0%,#171a20 100%)",
  },
];

export const HERO_PRESET_KEYS = HERO_PRESETS.map((p) => p.key);

// Si bannerUrl es un preset (`preset:<key>`), devuelve su definición; null para imágenes o vacío.
export function heroPreset(bannerUrl: string | null | undefined): HeroPreset | null {
  if (!bannerUrl || !bannerUrl.startsWith("preset:")) return null;
  const key = bannerUrl.slice("preset:".length);
  return HERO_PRESETS.find((p) => p.key === key) ?? null;
}
