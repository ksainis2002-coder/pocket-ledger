// One-off: renders public/icons/*.png from the SVG below. The PNGs are committed,
// so this only needs to run when the icon changes. Requires `sharp`
// (npm install --no-save sharp), which is not a project dependency.
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const BG = "#1f6f5c", INK = "#f3f5f4", GOLD = "#e2b847";
// Ledger bars rising to a coin: income, saving, growth.
const glyph = (s) => `
  <g transform="translate(${s * 0.5} ${s * 0.5}) scale(${s / 512}) translate(-256 -256)">
    <rect x="132" y="292" width="56" height="96" rx="12" fill="${INK}"/>
    <rect x="228" y="232" width="56" height="156" rx="12" fill="${INK}"/>
    <rect x="324" y="268" width="56" height="120" rx="12" fill="${INK}" opacity=".55"/>
    <circle cx="352" cy="176" r="44" fill="${GOLD}"/>
    <rect x="116" y="404" width="280" height="16" rx="8" fill="${INK}" opacity=".85"/>
  </g>`;
const svg = (size, { radius, inset }) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>
  <g transform="translate(${size * inset} ${size * inset}) scale(${1 - 2 * inset})">${glyph(size)}</g>
</svg>`;

const out = "public/icons/";
await writeFile(out + "icon.svg", svg(512, { radius: 112, inset: 0 }));
for (const [name, size, opts] of [
  ["icon-192.png", 192, { radius: 42, inset: 0 }],
  ["icon-512.png", 512, { radius: 112, inset: 0 }],
  ["icon-maskable-512.png", 512, { radius: 0, inset: 0.1 }],
  ["apple-touch-icon.png", 180, { radius: 0, inset: 0.04 }],
]) {
  await sharp(Buffer.from(svg(size, opts))).png().toFile(out + name);
}
console.log("Icons written to " + out);
