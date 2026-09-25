// Draws the app icons (public/icons) from one SVG design: four tiles of the
// board in the design's colors, two of them done. Run: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

/** The tiles, placed in a square of `size` starting at `pad`. */
function tiles(pad, size) {
  const gap = size * 0.08;
  const t = (size - gap) / 2;
  const r = t * 0.27;
  const at = (i, j) => [pad + i * (t + gap), pad + j * (t + gap)];
  const check = (x, y, color) =>
    `<path d="M${x + t * 0.3} ${y + t * 0.52}l${t * 0.14} ${t * 0.14} ${t * 0.27}-${t * 0.3}" fill="none" stroke="${color}" stroke-width="${t * 0.1}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const [ax, ay] = at(0, 0);
  const [bx, by] = at(1, 0);
  const [cx, cy] = at(0, 1);
  const [dx, dy] = at(1, 1);
  return [
    `<rect x="${ax}" y="${ay}" width="${t}" height="${t}" rx="${r}" fill="#0f4c5c"/>`,
    check(ax, ay, '#ffffff'),
    `<rect x="${bx}" y="${by}" width="${t}" height="${t}" rx="${r}" fill="#fb8b24"/>`,
    check(bx, by, '#1a0b02'),
    `<rect x="${cx}" y="${cy}" width="${t}" height="${t}" rx="${r}" fill="#5f0f40"/>`,
    `<clipPath id="d"><rect x="${dx}" y="${dy}" width="${t}" height="${t}" rx="${r}"/></clipPath>`,
    `<rect x="${dx}" y="${dy}" width="${t}" height="${t}" rx="${r}" fill="#172529"/>`,
    `<rect x="${dx}" y="${dy + t * 0.5}" width="${t}" height="${t * 0.5}" fill="#9a031e" fill-opacity="0.6" clip-path="url(#d)"/>`,
    `<rect x="${dx + t * 0.03}" y="${dy + t * 0.03}" width="${t * 0.94}" height="${t * 0.94}" rx="${r * 0.94}" fill="none" stroke="#2a3d42" stroke-width="${t * 0.06}"/>`,
  ].join('');
}

const svg = (rounded, pad, size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512"${rounded ? ' rx="112"' : ''} fill="#0e1a1d"/>${tiles(pad, size)}</svg>`;

const icon = svg(true, 96, 320);
// Maskable and Apple icons are cut to shape by the system: fill the square, keep the tiles in the middle.
const full = svg(false, 106, 300);
const maskable = svg(false, 136, 240);
writeFileSync('public/icons/icon.svg', icon + '\n');
writeFileSync('public/icons/maskable.svg', maskable + '\n');

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(source, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: `public/icons/${file}`, omitBackground: true });
}
await png(icon, 192, 'icon-192.png');
await png(icon, 512, 'icon-512.png');
await png(maskable, 512, 'maskable-512.png');
await png(full, 180, 'apple-touch-icon.png');
await browser.close();
