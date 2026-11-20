// Renders the wordmark and app icons from src/design/logoPaths.ts (uses sharp from server/).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('../server/node_modules/sharp');
const src = readFileSync('src/design/logoPaths.ts', 'utf8');
const get = (name) => JSON.parse(src.match(new RegExp(`export const ${name} = (.*);`))[1].replace(/(\w+):/g, '"$1":'));
const VB = get('LOGO_VIEWBOX'), LETTERS = get('LOGO_LETTERS'), WAVE = get('LOGO_WAVE'), W = get('WAVE_WEIGHT'), MVB = get('MARK_VIEWBOX'), MARK = get('MARK_WAVE');
const INDIGO = '#4F46E5', BLACK = '#0E0E10';

const wordmark = (guides = false) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 ${VB.width + 120} ${VB.height + 120}" width="${(VB.width + 120) / 2}" height="${(VB.height + 120) / 2}">
<rect x="-60" y="-60" width="${VB.width + 120}" height="${VB.height + 120}" fill="#fff"/>
${guides ? `<line x1="-60" x2="${VB.width + 60}" y1="760" y2="760" stroke="#f00" stroke-width="3"/><line x1="-60" x2="${VB.width + 60}" y1="${760 - 546}" y2="${760 - 546}" stroke="#f00" stroke-width="3"/>` : ''}
${LETTERS.map((d) => `<path d="${d}" fill="${BLACK}"/>`).join('')}
<path d="${WAVE}" fill="none" stroke="${INDIGO}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// App icon: indigo wave-v on white, centred, about 58% of the canvas wide.
const icon = (size, scale = 0.58, bg = '#FFFFFF') => {
  const pad = 0;
  const w = MVB.width + W, h = MVB.height + W;
  const s = (size * scale) / w;
  const tx = (size - w * s) / 2 + (W / 2) * s, ty = (size - h * s) / 2 + (W / 2) * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="${bg}"/>
<g transform="translate(${tx} ${ty}) scale(${s})"><path d="${MARK}" fill="none" stroke="${INDIGO}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
};

const out = process.argv[2] ?? 'preview';
if (out === 'preview') {
  await sharp(Buffer.from(wordmark(true))).png().toFile(process.argv[3] + '/logo-guides.png');
  await sharp(Buffer.from(wordmark(false))).png().toFile(process.argv[3] + '/logo.png');
  await sharp(Buffer.from(icon(512))).png().toFile(process.argv[3] + '/icon.png');
} else {
  await sharp(Buffer.from(icon(1024))).png().toFile('assets/images/icon.png');
  await sharp(Buffer.from(icon(1024, 0.58))).png().toFile('assets/images/adaptive-icon.png');
  await sharp(Buffer.from(icon(196, 0.62))).png().toFile('assets/images/favicon.png');
  // Splash: transparent background, the native splash colour is white.
  const t = icon(512, 0.8, 'none').replace('<rect width="512" height="512" fill="none"/>', '');
  await sharp(Buffer.from(t)).png().toFile('assets/images/splash-icon.png');
  writeFileSync('assets/images/logo.svg', wordmark(false));
  console.log('assets written');
}
