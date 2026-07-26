import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(root, "android/app/src/main/res/drawable-nodpi");
const iconSource = resolve(root, "public/icon.png");
const logoSource = resolve(root, "public/logo.webp");

await mkdir(outputDirectory, { recursive: true });

await sharp(iconSource)
  .resize(512, 512, { fit: "contain" })
  .png()
  .toFile(resolve(outputDirectory, "site_icon.png"));

const bannerLogo = await sharp(logoSource)
  .resize(144, 144, { fit: "contain" })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 320,
    height: 180,
    channels: 4,
    background: "#0c0e14",
  },
})
  .composite([{ input: bannerLogo, left: 88, top: 18 }])
  .png()
  .toFile(resolve(outputDirectory, "site_tv_banner.png"));

console.log("Android brand assets synchronized.");
