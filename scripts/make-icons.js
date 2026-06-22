// Genera los iconos PWA a partir del wordmark blanco (public/brand/logo.png) sobre el fondo
// oscuro de la marca (#0b0b0e). Sobrescribe public/icons/*.png. Correr desde la raíz del repo:
//   node scripts/make-icons.js
const sharp = require("sharp");
const fs = require("node:fs");

const BG = { r: 11, g: 11, b: 14, alpha: 1 }; // #0b0b0e (theme_color del manifest)
const LOGO = "public/brand/logo.png";

async function makeIcon(outPath, size, widthRatio) {
  const logoW = Math.round(size * widthRatio);
  const logo = await sharp(LOGO).resize({ width: logoW }).toBuffer();
  const buf = await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
  fs.writeFileSync(outPath, buf);
  console.log("ok", outPath, `${size}x${size}`);
}

(async () => {
  // any-purpose: ~80% de ancho (margen cómodo). maskable: ~60% (zona segura del recorte).
  await makeIcon("public/icons/icon-192.png", 192, 0.8);
  await makeIcon("public/icons/icon-512.png", 512, 0.8);
  await makeIcon("public/icons/maskable-512.png", 512, 0.6);
  await makeIcon("public/icons/apple-touch-icon.png", 180, 0.8);
  console.log("Listo.");
})().catch((e) => { console.error(e); process.exit(1); });
