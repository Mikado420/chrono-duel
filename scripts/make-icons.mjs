// Regenerates the PNG icons in public/icons from the SVG below.
// Needs `sharp` (npm i -D sharp). Run: node scripts/make-icons.mjs
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const ticks = (r1, r2) => Array.from({ length: 60 }, (_, i) => {
  const a = (i / 60) * Math.PI * 2 - Math.PI / 2, major = i % 5 === 0;
  const rr = major ? r2 - 10 : r2;
  return `<line x1="${256 + Math.cos(a) * r1}" y1="${256 + Math.sin(a) * r1}" x2="${256 + Math.cos(a) * rr}" y2="${256 + Math.sin(a) * rr}" stroke="#e0b25c" stroke-width="${major ? 6 : 2.5}" stroke-linecap="round" opacity="${major ? 1 : .55}"/>`;
}).join('');

/** scale < 1 shrinks the artwork toward the centre (maskable icons need a safe zone). */
const svg = ({ scale = 1, rounded = true }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#173746"/><stop offset="1" stop-color="#08141c"/></radialGradient></defs>
<rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#g)"/>
<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
<circle cx="256" cy="256" r="196" fill="none" stroke="#9c7432" stroke-width="18"/>
<circle cx="256" cy="256" r="196" fill="none" stroke="#e0b25c" stroke-width="6"/>
<path d="M256 60 A196 196 0 0 1 452 256" fill="none" stroke="#d6334a" stroke-width="18" opacity=".55"/>
${ticks(176, 158)}
<line x1="256" y1="256" x2="${256 + Math.cos(-2.3) * 150}" y2="${256 + Math.sin(-2.3) * 150}" stroke="#5fd0b5" stroke-width="20" stroke-linecap="round"/>
<line x1="256" y1="256" x2="${256 + Math.cos(-0.75) * 112}" y2="${256 + Math.sin(-0.75) * 112}" stroke="#e9674f" stroke-width="16" stroke-linecap="round"/>
<circle cx="256" cy="256" r="26" fill="#9c7432" stroke="#e0b25c" stroke-width="8"/><circle cx="256" cy="256" r="8" fill="#f1e7d0"/>
</g></svg>`;

const out = 'public/icons';
writeFileSync(`${out}/icon.svg`, svg({}));
const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { scale: 0.78, rounded: false }],
  ['apple-touch-icon.png', 180, { rounded: false }],
  ['favicon-32.png', 32, {}],
];
for (const [name, size, opt] of jobs) await sharp(Buffer.from(svg(opt))).resize(size, size).png().toFile(`${out}/${name}`);
console.log('icons written');
