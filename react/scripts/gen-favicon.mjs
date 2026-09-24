/**
 * Generates favicon and iOS/PWA PNG icons from the SVG sources.
 * Run: npm run gen:favicon
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const svgPath = path.join(root, "public", "favicon.svg");
const appIconSvgPath = path.join(root, "public", "app-icon.svg");
const ogImageSvgPath = path.join(root, "public", "og-image.svg");
const outPath = path.join(root, "public", "favicon.ico");

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.error("Missing:", svgPath);
    process.exit(1);
  }
  if (!fs.existsSync(appIconSvgPath)) {
    console.error("Missing:", appIconSvgPath);
    process.exit(1);
  }
  if (!fs.existsSync(ogImageSvgPath)) {
    console.error("Missing:", ogImageSvgPath);
    process.exit(1);
  }
  const base = sharp(svgPath).flatten({ background: "#ffffff" });
  const buf16 = await base
    .clone()
    .resize(16, 16, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
  const buf32 = await base
    .clone()
    .resize(32, 32, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
  const ico = await toIco([buf16, buf32]);
  fs.writeFileSync(outPath, ico);

  const iconOutputs = [
    ["apple-touch-icon.png", 180],
    ["pwa-192.png", 192],
    ["pwa-512.png", 512],
    ["pwa-maskable-512.png", 512],
  ];
  for (const [filename, size] of iconOutputs) {
    await sharp(appIconSvgPath)
      .resize(size, size)
      .png()
      .toFile(path.join(root, "public", filename));
  }

  await sharp(ogImageSvgPath)
    .resize(1200, 630)
    .png()
    .toFile(path.join(root, "public", "og-image.png"));

  console.log("Wrote favicon, PWA icons, and social preview");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
