/**
 * Art for the themed looks (8 themes × clock face, card back and playmat), drawn as SVG and rasterised once.
 *
 * Clock faces are drawn in a small "design" space: centre (195,210), face radius 158, which the dial scales by
 * DIAL_S onto its own centre (360,388) and radius. The dial itself still draws the ticks, the numbers, the hands
 * and the doom band, so every face reads the same in play; the art supplies the face, the rim and the bell marks
 * (r = 122.6, where the dial puts its bells). Ticks land on r 146–156, numbers on r 135.5: the art keeps those
 * rings calm. Parts that move (gears, the zodiac ring) are separate layers.
 *
 * Card backs are 240×336 (scaled to the 340×476 card); the CHRONO DUEL line is added with the game's font.
 * Playmats are 390×414, the player's half of a 390-wide board from the front line (y 366) down.
 */

// ------------------------------------------------------------------ helpers
const C = 195, Y = 210;
const f = (n: number) => +n.toFixed(2);
/** The upper half circle of radius r around the dial centre (open path, left to right). */
const arc = (r: number) => `M${f(C - r)} ${Y} A${r} ${r} 0 0 1 ${f(C + r)} ${Y}`;
const semi = (r: number) => `${arc(r)} Z`;
const rot = (a: number, body: string) => `<g transform="rotate(${a} ${C} ${Y})">${body}</g>`;
/** Only the second half of an arc (from DOOM_AT = 20 to 40). */
const doomDash = (r: number) => { const h = f((Math.PI * r) / 2); return `stroke-dasharray="0 ${h} ${h} 4"`; };
/** Dots evenly along an arc (rivets, bolts, tooling). */
const dots = (r: number, n: number) => { const p = f((Math.PI * r) / n); return `stroke-linecap="round" stroke-dasharray="0 ${p}" stroke-dashoffset="${f(-p / 2)}"`; };
export const BELL_R = 122.6;
const bells = (glyph: string) => [36, 72, 108, 144].map((a) => rot(a, `<g transform="translate(${f(C - BELL_R)} ${Y}) rotate(${-a})">${glyph}</g>`)).join('');
/** Evenly spaced ticks along an arc (dial previews only; in play the dial draws its own). */
const tickArc = (r: number, n: number, len: number, w: number, color: string) => { const p = (Math.PI * r) / n; return `<path d="${arc(r)}" fill="none" stroke="${color}" stroke-width="${len}" stroke-dasharray="${w} ${f(p - w)}" stroke-dashoffset="${w / 2}"/>`; };

export const svgDoc = (viewBox: string, w: number, h: number, body: string, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;

// ------------------------------------------------------------------ dial
export const DIAL_S = 1.86;
/** The part of design space a face covers. */
export const DIAL_VIEW = { x: 30, y: 45, w: 330, h: 170 };
export interface SpinLayer { body: string; cx: number; cy: number; r: number; speed: number; defs?: string }
export interface DialArt {
  defs: string; under: string; over: string;
  spins?: SpinLayer[];
  /** Radius the spinning layers are clipped to. */
  clip?: number;
  /** A layer whose opacity breathes (light through glass, heat). */
  pulse?: { body: string; min: number; max: number; period: number };
  /** Embers rising from the heated part of the rim. */
  embers?: boolean;
}
export interface DialLook {
  face: number; rim: number; tick: number; minor: number; num: number;
  numStroke?: number; numFont?: 'num' | 'display'; italic?: boolean;
  /** Numbers shown in place of 0, 5, … 40. */
  labels?: string[];
  /** Numbers warm up towards the end of the clock. */
  hot?: boolean;
  art: DialArt;
}

const gear = (r: number, teeth: number, tooth: string, ring: string, hole: number, spokes: string, hub: string, tw = 12) => {
  const p = f((2 * Math.PI * r) / teeth);
  return `<circle r="${r}" fill="none" stroke="${tooth}" stroke-width="${tw}" stroke-dasharray="${f(p / 2)} ${f(p / 2)}"/><circle r="${r - tw / 2 - 1}" fill="#2a2214" stroke="${ring}" stroke-width="2"/><circle r="${hole}" fill="#081014"/>${spokes}${hub}`;
};

export const DIAL_ART: Record<string, DialLook> = {
  'dial:skeleton': {
    face: 0x0b1216, rim: 0xd6b06a, tick: 0xf0cf86, minor: 0xc9a15a, num: 0xf0cf86, numStroke: 0x05090b,
    art: {
      defs: '<radialGradient id="g" cx="50%" cy="100%" r="100%"><stop offset="0" stop-color="#16232a"/><stop offset="1" stop-color="#05090b"/></radialGradient>',
      under: `<path d="${semi(158)}" fill="url(#g)"/><path d="${semi(118)}" fill="#03070a" opacity=".55"/>`,
      clip: 143,
      spins: [
        { cx: 118, cy: 176, r: 62, speed: 0.12, body: gear(54, 20, '#8a6a32', '#a7843f', 35, '<path d="M-36 0 H36 M0 -36 V36 M-25 -25 L25 25 M-25 25 L25 -25" stroke="#a7843f" stroke-width="5"/>', '<circle r="10" fill="#c9a15a"/><circle r="4" fill="#c2304a"/>') },
        { cx: 256, cy: 150, r: 48, speed: -0.17, body: gear(40, 16, '#8a6a32', '#a7843f', 24, '<path d="M-25 0 H25 M0 -25 V25" stroke="#a7843f" stroke-width="5"/>', '<circle r="8" fill="#c9a15a"/><circle r="3" fill="#c2304a"/>', 10) },
        { cx: 190, cy: 182, r: 34, speed: 0.26, body: gear(26, 12, '#6e5428', '#8a6a32', 14, '<path d="M-15 0 H15 M0 -15 V15" stroke="#8a6a32" stroke-width="4"/>', '<circle r="5" fill="#c9a15a"/>', 8) },
      ],
      over: `<path d="${arc(151)}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="14"/>
<path d="${arc(144)}" fill="none" stroke="#6d4d1c" stroke-width="1.5"/>
<path d="${arc(158)}" fill="none" stroke="#d6b06a" stroke-width="3"/><path d="${arc(161)}" fill="none" stroke="#6d4d1c" stroke-width="2.5"/>
<line x1="30" y1="210" x2="360" y2="210" stroke="#a7843f" stroke-width="4"/>
${bells('<circle r="6" fill="#c2304a" stroke="#f0cf86" stroke-width="2"/>')}`,
    },
  },
  'dial:astro': {
    face: 0x18306a, rim: 0xe0b85a, tick: 0xf3d98a, minor: 0xc9a04f, num: 0xf3d98a, numStroke: 0x0b1430,
    art: {
      defs: '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3566b8"/><stop offset=".7" stop-color="#18306a"/><stop offset="1" stop-color="#0f1d44"/></linearGradient><radialGradient id="e" cx="50%" cy="100%" r="100%"><stop offset="0" stop-color="#3a2416"/><stop offset="1" stop-color="#140c07"/></radialGradient>',
      under: `<path d="${semi(158)}" fill="url(#s)"/>
<g fill="#f3d98a"><circle cx="120" cy="120" r="1.4"/><circle cx="150" cy="96" r="1"/><circle cx="236" cy="104" r="1.6"/><circle cx="270" cy="132" r="1"/><circle cx="196" cy="88" r="1.2"/><circle cx="96" cy="160" r="1"/><circle cx="300" cy="170" r="1.3"/><circle cx="170" cy="130" r=".9"/><circle cx="222" cy="150" r="1"/><circle cx="84" cy="128" r="1.1"/><circle cx="312" cy="140" r="1"/></g>`,
      clip: 141,
      spins: [{ cx: 195, cy: 182, r: 106, speed: 0.025, body: '<circle r="96" fill="none" stroke="#6e521c" stroke-opacity=".85" stroke-width="16" stroke-dasharray="48.27 2"/><circle r="104" fill="none" stroke="#f3d98a" stroke-width="1.5" opacity=".7"/><circle r="88" fill="none" stroke="#f3d98a" stroke-width="1.5" opacity=".7"/><g fill="#13285e"><circle cx="0" cy="-96" r="3"/><circle cx="96" cy="0" r="3"/><circle cx="-96" cy="0" r="3"/><circle cx="68" cy="-68" r="2.2"/><circle cx="-68" cy="-68" r="2.2"/><circle cx="0" cy="96" r="3"/></g>' }],
      over: `<path d="${semi(62)}" fill="url(#e)"/><path d="${arc(62)}" fill="none" stroke="#e0b85a" stroke-width="2"/><path d="${arc(45)}" fill="none" stroke="#e0b85a" stroke-width="1" stroke-dasharray="2 3" opacity=".7"/>
<path d="${arc(151)}" fill="none" stroke="#0b0b14" stroke-width="14"/>
<path d="${arc(144)}" fill="none" stroke="#e0b85a" stroke-width="1.5"/><path d="${arc(158)}" fill="none" stroke="#e0b85a" stroke-width="2"/><path d="${arc(161.5)}" fill="none" stroke="#8a6a2a" stroke-width="2.5"/>
<line x1="30" y1="210" x2="360" y2="210" stroke="#8a6a2a" stroke-width="4"/>
${bells('<path d="M0 -9 L2.6 -2.6 L9 0 L2.6 2.6 L0 9 L-2.6 2.6 L-9 0 L-2.6 -2.6 Z" fill="#f3d98a"/>')}`,
    },
  },
  'dial:cathedral': {
    face: 0x16140f, rim: 0xc8bc98, tick: 0xfff3cf, minor: 0xe8dcb8, num: 0xefe3c2, numStroke: 0x0b0a0e,
    art: {
      defs: '<radialGradient id="st" cx="50%" cy="100%" r="100%"><stop offset="0" stop-color="#2e2a24"/><stop offset="1" stop-color="#16140f"/></radialGradient><radialGradient id="ro" cx="50%" cy="100%" r="100%"><stop offset="0" stop-color="#2a4aa8"/><stop offset="1" stop-color="#0f1a44"/></radialGradient><radialGradient id="su" cx="50%" cy="100%" r="100%"><stop offset="0" stop-color="#ffe6a0"/><stop offset=".6" stop-color="#d79a2c"/><stop offset="1" stop-color="#8a5612"/></radialGradient><radialGradient id="bl" cx="50%" cy="100%" r="100%"><stop offset="0" stop-color="#fff6d8" stop-opacity=".45"/><stop offset=".6" stop-color="#fff6d8" stop-opacity=".1"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient>',
      under: (() => {
        const lancet = 'M121 203.8 L100 204.6 Q86 206.6 81 210 Q86 213.4 100 215.4 L121 216.2 Q123 210 121 203.8 Z';
        const cols = ['#22409a', '#8a1a2e', '#22409a', '#c08a2a', '#22409a', '#8a1a2e', '#22409a', '#1a6a55', '#1a6a55', '#22409a', '#8a1a2e', '#22409a', '#c08a2a', '#22409a', '#8a1a2e', '#22409a'];
        const l = cols.map((c, i) => `<path d="${lancet}" fill="${c}" transform="rotate(${5.625 + i * 11.25} ${C} ${Y})"/>`).join('');
        const sp = [1, 2, 3, 4, 5, 6, 7].map((k) => `<path d="M125 210 H171" transform="rotate(${k * 22.5} ${C} ${Y})"/>`).join('');
        const rc = ['#c08a2a', '#8a1a2e', '#c08a2a', '#8a1a2e', '#8a1a2e', '#c08a2a', '#8a1a2e', '#c08a2a'].map((c, i) => `<circle cx="147" cy="210" r="10" fill="${c}" transform="rotate(${11.25 + i * 22.5} ${C} ${Y})"/>`).join('');
        return `<path d="${semi(158)}" fill="url(#st)"/><g stroke="#c8bc98" stroke-width="1.4" stroke-linejoin="round">${l}</g>
<path d="${semi(70)}" fill="url(#ro)" stroke="#c8bc98" stroke-width="2"/><g stroke="#c8bc98" stroke-width="1.2" opacity=".85">${sp}</g><g stroke="#c8bc98" stroke-width="1.4">${rc}</g>
<path d="${semi(24)}" fill="url(#su)" stroke="#c8bc98" stroke-width="1.6"/>`;
      })(),
      pulse: { body: `<path d="${semi(144)}" fill="url(#bl)"/>`, min: 0.35, max: 1, period: 7 },
      over: `<path d="${arc(151)}" fill="none" stroke="#3a352d" stroke-width="14"/>
<path d="${arc(144)}" fill="none" stroke="#c8bc98" stroke-width="1.5"/><path d="${arc(158)}" fill="none" stroke="#c8bc98" stroke-width="1.5"/><path d="${arc(161)}" fill="none" stroke="#6f6857" stroke-width="2.5"/>
<rect x="30" y="206" width="330" height="8" fill="#3a352d"/><line x1="30" y1="206" x2="360" y2="206" stroke="#c8bc98" stroke-width="1.2"/>
${bells('<path d="M-6 4 Q-6 -5 0 -7 Q6 -5 6 4 L8 6 H-8 Z" fill="#d9b25a" stroke="#4a3812" stroke-width="1"/><circle cy="8" r="2" fill="#d9b25a"/>')}`,
    },
  },
  'dial:steam': {
    face: 0xe9e2cf, rim: 0xb8693a, tick: 0x1d1a14, minor: 0x3a3328, num: 0x1d1a14,
    art: {
      defs: '<radialGradient id="c" cx="40%" cy="40%" r="80%"><stop offset="0" stop-color="#f4eedf"/><stop offset="1" stop-color="#d3c8ab"/></radialGradient><linearGradient id="cu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e3a1e"/><stop offset=".5" stop-color="#c47a45"/><stop offset="1" stop-color="#6e3a1e"/></linearGradient><clipPath id="k"><path d="' + semi(156) + '"/></clipPath>',
      under: `<path d="${semi(156)}" fill="url(#c)"/>
<path d="${arc(112)}" fill="none" stroke="#b8322a" stroke-width="9" ${doomDash(112)} opacity=".85"/>
<path d="${arc(104)}" fill="none" stroke="#1d1a14" stroke-width="1" opacity=".4"/>
<text x="195" y="198" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="7" letter-spacing="2" fill="#7a6e58">CHRONO WORKS 1887</text>`,
      over: `<g clip-path="url(#k)"><ellipse cx="140" cy="104" rx="90" ry="32" transform="rotate(-25 140 104)" fill="#fff" opacity=".2"/></g>
<path d="${arc(159.5)}" fill="none" stroke="url(#cu)" stroke-width="7"/>
<path d="${arc(159.5)}" fill="none" stroke="#e8b48a" stroke-width="4" ${dots(159.5, 22)}/>
<path d="${arc(163.5)}" fill="none" stroke="#3a1d0e" stroke-width="2"/>
<rect x="30" y="205" width="330" height="9" rx="2" fill="url(#cu)"/>
${bells('<circle r="6.5" fill="#c9a15a" stroke="#4a3812" stroke-width="1.5"/><path d="M-4.5 0 H4.5 M0 -4.5 V4.5" stroke="#4a3812" stroke-width="1.5"/>')}`,
    },
  },
  'dial:wadokei': {
    face: 0x0c0807, rim: 0xd4a548, tick: 0xf0d58a, minor: 0xd4a548, num: 0xf0d58a, numStroke: 0x0c0807, numFont: 'display',
    labels: ['〇', '五', '十', '十五', '廿', '廿五', '卅', '卅五', '卌'],
    art: {
      defs: '<radialGradient id="g" cx="50%" cy="100%" r="100%"><stop offset="0" stop-color="#22140f"/><stop offset="1" stop-color="#070504"/></radialGradient><clipPath id="k"><path d="' + semi(126) + '"/></clipPath>',
      under: `<path d="${semi(158)}" fill="url(#g)"/>
<g clip-path="url(#k)" fill="#d4a548" fill-opacity=".18" stroke="#d4a548" stroke-opacity=".5" stroke-width="1"><rect x="64" y="122" width="130" height="18" rx="9"/><rect x="206" y="148" width="120" height="16" rx="8"/><rect x="104" y="178" width="96" height="14" rx="7"/><rect x="226" y="98" width="70" height="12" rx="6"/></g>`,
      over: `<path d="${arc(151)}" fill="none" stroke="#9e2a1a" stroke-width="13"/>
<path d="${arc(144.3)}" fill="none" stroke="#d4a548" stroke-width="1.5"/><path d="${arc(157.7)}" fill="none" stroke="#d4a548" stroke-width="1.5"/><path d="${arc(161)}" fill="none" stroke="#d4a548" stroke-width="2"/>
<rect x="30" y="205" width="330" height="5" fill="#9e2a1a"/><line x1="30" y1="212" x2="360" y2="212" stroke="#d4a548" stroke-width="1.2"/>
${bells('<rect x="-4" y="-10" width="8" height="3" rx="1" fill="#d4a548"/><path d="M-6 -7 H6 V5 Q6 7 8 7 H-8 Q-6 7 -6 5 Z" fill="#d4a548"/><path d="M-6 -2 H6" stroke="#0c0807" stroke-width="1"/>')}`,
    },
  },
  'dial:compass': {
    face: 0x04121a, rim: 0xc8a25a, tick: 0xe6fffb, minor: 0xbfe9e4, num: 0xe2c27a, numStroke: 0x03101a,
    art: {
      defs: '<radialGradient id="g" cx="50%" cy="100%" r="100%"><stop offset="0" stop-color="#0f3445"/><stop offset="1" stop-color="#03101a"/></radialGradient>',
      under: `<path d="${semi(158)}" fill="url(#g)"/>
<circle cx="195" cy="210" r="100" fill="none" stroke="#2fb3a6" stroke-opacity=".35" stroke-width="1" stroke-dasharray="3 4"/>
<circle cx="195" cy="210" r="62" fill="none" stroke="#2fb3a6" stroke-opacity=".45" stroke-width="1.2"/>
<g fill="#2fb3a6"><path d="M195 95 L206 198 L195 210 Z" fill-opacity=".55"/><path d="M195 95 L184 198 L195 210 Z" fill-opacity=".25"/><path d="M80 210 L184 199 L195 210 Z" fill-opacity=".55"/><path d="M310 210 L206 199 L195 210 Z" fill-opacity=".25"/><path d="M113.7 128.7 L189 195 L195 210 Z" fill-opacity=".32"/><path d="M113.7 128.7 L180 205 L195 210 Z" fill-opacity=".15"/><path d="M276.3 128.7 L201 195 L195 210 Z" fill-opacity=".32"/><path d="M276.3 128.7 L210 205 L195 210 Z" fill-opacity=".15"/></g>
<g fill="none" stroke="#bfe9e4" stroke-opacity=".45"><circle cx="92" cy="196" r="4"/><circle cx="100" cy="182" r="2.5"/><circle cx="86" cy="176" r="1.8"/><circle cx="300" cy="190" r="3"/><circle cx="292" cy="176" r="1.8"/></g>`,
      over: `<path d="${arc(151)}" fill="none" stroke="#071b26" stroke-width="14"/>
<path d="${arc(144)}" fill="none" stroke="#c8a25a" stroke-width="1.2"/><path d="${arc(157.5)}" fill="none" stroke="#c8a25a" stroke-width="1.2"/>
<path d="${arc(160.5)}" fill="none" stroke="#7d5f2a" stroke-width="6"/><path d="${arc(160.5)}" fill="none" stroke="#d7b46a" stroke-width="5" stroke-dasharray="4 2.5"/>
<line x1="30" y1="210" x2="360" y2="210" stroke="#c8a25a" stroke-width="4"/>
${bells('<path d="M-6 5 L-3.5 -6 H3.5 L6 5 Z" fill="#c8402f"/><rect x="-5" y="-1.5" width="10" height="3" fill="#f0ece2"/><circle cx="0" cy="-8.5" r="2.2" fill="#ffe28a"/>')}`,
    },
  },
  'dial:forge': {
    face: 0x1a1817, rim: 0x77716a, tick: 0xe0dbd2, minor: 0xb8b2aa, num: 0xc9bfb2, numStroke: 0x000000, hot: true,
    art: {
      defs: '<radialGradient id="g" cx="50%" cy="100%" r="100%"><stop offset="0" stop-color="#2c2826"/><stop offset="1" stop-color="#0d0c0b"/></radialGradient><pattern id="p" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".7" fill="#4a4541" fill-opacity=".45"/><circle cx="4.5" cy="4" r=".5" fill="#000" fill-opacity=".5"/></pattern><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>',
      under: `<path d="${semi(158)}" fill="url(#g)"/><path d="${semi(158)}" fill="url(#p)"/>
<path d="${arc(151)}" fill="none" stroke="#2a2624" stroke-width="14"/>
<g fill="none" stroke="#ff7a2a" stroke-width="1.2" stroke-linecap="round" opacity=".7"><path d="M302 116 L290 130 L296 142 L284 156"/><path d="M322 164 L308 172 L312 184"/><path d="M262 88 L256 104 L264 112"/></g>
<path d="${arc(151)}" fill="none" stroke="#ffc46b" stroke-width="3" ${doomDash(151)}/>`,
      pulse: { body: `<path d="${arc(151)}" fill="none" stroke="#ff6a1a" stroke-width="26" ${doomDash(151)} filter="url(#b)"/>`, min: 0.35, max: 0.9, period: 3 },
      embers: true,
      over: `<path d="${arc(159.5)}" fill="none" stroke="#3d3936" stroke-width="7"/>
<path d="${arc(159.5)}" fill="none" stroke="#77716a" stroke-width="5" ${dots(159.5, 16)}/>
<path d="${arc(163)}" fill="none" stroke="#1d1a18" stroke-width="2"/>
<rect x="30" y="205" width="330" height="9" rx="2" fill="#3d3936"/>
${bells('<circle r="7" fill="#1d1a18" stroke="#77716a" stroke-width="1.5"/><circle r="4" fill="#ff8a3a"/><circle r="2" fill="#ffe2a0"/>')}`,
    },
  },
  'dial:archive': {
    face: 0xe3d3ad, rim: 0xc9a04f, tick: 0x2a1d12, minor: 0x5a4630, num: 0x2a1d12, italic: true,
    art: {
      defs: '<radialGradient id="g" cx="45%" cy="60%" r="80%"><stop offset="0" stop-color="#efe1bd"/><stop offset=".75" stop-color="#d6c08f"/><stop offset="1" stop-color="#b49a66"/></radialGradient><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter><clipPath id="k"><path d="' + semi(156) + '"/></clipPath>',
      under: `<path d="${semi(156)}" fill="url(#g)"/>
<g clip-path="url(#k)"><ellipse cx="270" cy="170" rx="40" ry="26" fill="#8a6a3a" opacity=".22" filter="url(#b)"/><ellipse cx="110" cy="120" rx="24" ry="16" fill="#8a6a3a" opacity=".16" filter="url(#b)"/></g>
<path d="${arc(112)}" fill="none" stroke="#7a1f2b" stroke-width="7" ${doomDash(112)} opacity=".6"/>
<text x="195" y="198" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="9" fill="#5a4630">Liber Temporis</text>
<path d="M222 50 H234 V112 L228 105 L222 112 Z" fill="#7a1f2b"/>`,
      over: `<path d="${arc(159.5)}" fill="none" stroke="#4a2a1a" stroke-width="7"/>
<path d="${arc(159.5)}" fill="none" stroke="#c9a04f" stroke-width="2.4" ${dots(159.5, 64)}/>
<path d="${arc(156.2)}" fill="none" stroke="#c9a04f" stroke-width="1"/><path d="${arc(163)}" fill="none" stroke="#c9a04f" stroke-width="1.5"/>
<rect x="30" y="205" width="330" height="9" rx="2" fill="#4a2a1a"/><line x1="30" y1="207" x2="360" y2="207" stroke="#c9a04f" stroke-width="1"/>
${bells('<g fill="#7a1f2b"><ellipse cy="-4" rx="2.6" ry="4.5"/><ellipse cy="4" rx="2.6" ry="4.5"/><ellipse cx="-4" rx="4.5" ry="2.6"/><ellipse cx="4" rx="4.5" ry="2.6"/></g><circle r="2" fill="#c9a04f"/>')}`,
    },
  },
};

const dialView = () => `${DIAL_VIEW.x} ${DIAL_VIEW.y} ${DIAL_VIEW.w} ${DIAL_VIEW.h}`;
/** One part of a face as a full-frame SVG (rendered at `scale` px per design unit). */
export function dialPartSvg(id: string, part: 'under' | 'over' | 'pulse', scale: number): string {
  const a = DIAL_ART[id].art;
  const body = part === 'pulse' ? a.pulse?.body ?? '' : a[part];
  return svgDoc(dialView(), f(DIAL_VIEW.w * scale), f(DIAL_VIEW.h * scale), body, a.defs);
}
export function spinSvg(s: SpinLayer, defs: string, scale: number): string {
  return svgDoc(`${-s.r} ${-s.r} ${s.r * 2} ${s.r * 2}`, f(s.r * 2 * scale), f(s.r * 2 * scale), s.body, defs);
}
/** The whole face in one picture, with ticks (shop and deck previews). */
export function dialPreviewSvg(id: string, w: number): string {
  const L = DIAL_ART[id];
  const a = L.art;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const spins = (a.spins ?? []).map((s) => `<g transform="translate(${s.cx} ${s.cy})">${s.body}</g>`).join('');
  const clip = a.clip ? `<clipPath id="pvk"><path d="${semi(a.clip)}"/></clipPath>` : '';
  const ticks = tickArc(151, 40, 5, 1, hex(L.minor)) + tickArc(150, 8, 12, 2.6, hex(L.tick));
  const body = `${a.under}${spins ? `<g clip-path="url(#pvk)">${spins}</g>` : ''}${a.pulse?.body ?? ''}${a.over}${ticks}`;
  return svgDoc(dialView(), w, f((w * DIAL_VIEW.h) / DIAL_VIEW.w), body, a.defs + clip);
}

// ------------------------------------------------------------------ card backs
export interface BackLook { body: string; defs: string; ink: string; textY: number }
const BACK_VIEW = '0 0 240 336';
export const BACK_ART: Record<string, BackLook> = {
  'back:skeleton': {
    ink: '#e0bb6a', textY: 304,
    defs: '<linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2bd70"/><stop offset=".5" stop-color="#8f6a2a"/><stop offset="1" stop-color="#d0a85c"/></linearGradient><radialGradient id="b" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#2c2213"/><stop offset="1" stop-color="#0b0805"/></radialGradient>',
    body: `<rect width="240" height="336" rx="18" fill="url(#f)"/><rect x="9" y="9" width="222" height="318" rx="12" fill="url(#b)"/><rect x="17" y="17" width="206" height="302" rx="8" fill="none" stroke="#c9a15a" stroke-width="1.5" opacity=".7"/>
<g transform="translate(64 236)"><circle r="28" fill="none" stroke="#8a6a32" stroke-width="8" stroke-dasharray="8.8 8.8"/><circle r="22" fill="#1d160c" stroke="#a7843f" stroke-width="2"/><circle r="14" fill="#0b0805"/><path d="M-15 0 H15 M0 -15 V15" stroke="#a7843f" stroke-width="4"/><circle r="5" fill="#c9a15a"/></g>
<g transform="translate(174 238)"><circle r="38" fill="none" stroke="#a7843f" stroke-width="10" stroke-dasharray="9.95 9.95"/><circle r="31" fill="#241b0e" stroke="#e0bb6a" stroke-width="2"/><circle r="21" fill="#0b0805"/><path d="M-22 0 H22 M0 -22 V22 M-15 -15 L15 15 M-15 15 L15 -15" stroke="#c9a15a" stroke-width="4"/><circle r="7" fill="#e0bb6a"/></g>
<g transform="translate(120 140)"><circle r="74" fill="none" stroke="#c9a15a" stroke-width="15" stroke-dasharray="10.57 10.57"/><circle r="65" fill="#2a1f10" stroke="#f0cf86" stroke-width="2.5"/><circle r="56" fill="none" stroke="#a7843f" stroke-width="1.5" stroke-dasharray="2 4"/><circle r="46" fill="#0d0905"/><path d="M-47 0 H47 M0 -47 V47 M-33 -33 L33 33 M-33 33 L33 -33" stroke="#c9a15a" stroke-width="7"/><circle r="16" fill="#e0bb6a" stroke="#6d4d1c" stroke-width="2"/><circle r="6.5" fill="#c2304a"/></g>
<g fill="#e0bb6a"><circle cx="28" cy="28" r="3"/><circle cx="212" cy="28" r="3"/><circle cx="28" cy="308" r="3"/><circle cx="212" cy="308" r="3"/></g>`,
  },
  'back:astro': {
    ink: '#f3d98a', textY: 304,
    defs: '<linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0d385"/><stop offset=".5" stop-color="#9a7430"/><stop offset="1" stop-color="#e0b85a"/></linearGradient><radialGradient id="b" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#22418c"/><stop offset="1" stop-color="#070d26"/></radialGradient>',
    body: `<rect width="240" height="336" rx="18" fill="url(#f)"/><rect x="9" y="9" width="222" height="318" rx="12" fill="url(#b)"/>
<g fill="#f3d98a"><circle cx="34" cy="40" r="1.3"/><circle cx="60" cy="78" r=".9"/><circle cx="200" cy="50" r="1.5"/><circle cx="186" cy="92" r=".9"/><circle cx="40" cy="200" r="1.1"/><circle cx="206" cy="210" r="1.2"/><circle cx="30" cy="272" r=".9"/><circle cx="210" cy="280" r="1"/><circle cx="96" cy="30" r=".8"/><circle cx="150" cy="34" r="1"/></g>
<circle cx="120" cy="148" r="92" fill="none" stroke="#e0b85a" stroke-width="10" stroke-dasharray="46.17 2" opacity=".45"/><circle cx="120" cy="148" r="98" fill="none" stroke="#f3d98a" stroke-width="1.2" opacity=".7"/>
<g fill="none" stroke="#f3d98a"><circle cx="120" cy="148" r="70" stroke-width="3.5"/><ellipse cx="120" cy="148" rx="70" ry="22" stroke-width="2.5" transform="rotate(-20 120 148)"/><ellipse cx="120" cy="148" rx="22" ry="70" stroke-width="2.5" transform="rotate(-20 120 148)"/><ellipse cx="120" cy="148" rx="70" ry="38" stroke-width="7" stroke-opacity=".55" transform="rotate(28 120 148)"/><ellipse cx="120" cy="148" rx="70" ry="38" stroke-width="1.5" transform="rotate(28 120 148)"/></g>
<circle cx="120" cy="148" r="13" fill="#f3d98a"/><circle cx="120" cy="148" r="18" fill="none" stroke="#f3d98a" stroke-width="1.5" stroke-dasharray="2 3"/>
<path d="M120 218 V258 M96 268 Q120 252 144 268 Z" stroke="#e0b85a" stroke-width="3" fill="#9a7430"/>`,
  },
  'back:cathedral': {
    ink: '#e2c27a', textY: 318,
    defs: '<linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2c27a"/><stop offset=".5" stop-color="#7a5a24"/><stop offset="1" stop-color="#c9a04f"/></linearGradient><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a352d"/><stop offset="1" stop-color="#191713"/></linearGradient><linearGradient id="bl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a64c8"/><stop offset="1" stop-color="#13245e"/></linearGradient><linearGradient id="rd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8344e"/><stop offset="1" stop-color="#5a0f1e"/></linearGradient><pattern id="q" width="14" height="20" patternUnits="userSpaceOnUse"><path d="M0 10 L7 0 L14 10 L7 20 Z" fill="none" stroke="#0a0912" stroke-width="1.3"/></pattern><radialGradient id="gl" cx="50%" cy="35%" r="60%"><stop offset="0" stop-color="#fff6d8" stop-opacity=".28"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient>',
    body: (() => {
      const L = 'M52 292 V196 Q52 160 84 146 Q116 160 116 196 V292 Z', R = 'M124 292 V196 Q124 160 156 146 Q188 160 188 196 V292 Z';
      const foils = [0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => `<circle cx="120" cy="70" r="11" fill="${i % 2 ? '#c8344e' : '#e0a238'}" transform="rotate(${a} 120 96)"/>`).join('');
      return `<rect width="240" height="336" rx="18" fill="url(#f)"/><rect x="7" y="7" width="226" height="322" rx="13" fill="url(#s)"/>
<path d="M40 298 V140 Q40 50 120 24 Q200 50 200 140 V298 Z" fill="#0a0912" stroke="#c8bc98" stroke-width="5"/>
<path d="${L}" fill="url(#bl)"/><path d="${L}" fill="url(#q)"/><path d="${L}" fill="none" stroke="#c8bc98" stroke-width="3"/>
<path d="${R}" fill="url(#rd)"/><path d="${R}" fill="url(#q)"/><path d="${R}" fill="none" stroke="#c8bc98" stroke-width="3"/>
<circle cx="120" cy="96" r="42" fill="#13245e" stroke="#c8bc98" stroke-width="4"/><g stroke="#c8bc98" stroke-width="1.6">${foils}<circle cx="120" cy="96" r="10" fill="#ffe6a0"/></g>
<circle cx="120" cy="96" r="42" fill="url(#gl)"/><path d="M120 138 V292" stroke="#c8bc98" stroke-width="4"/>`;
    })(),
  },
  'back:steam': {
    ink: '#c9cdd1', textY: 302,
    defs: '<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34373a"/><stop offset="1" stop-color="#16181a"/></linearGradient><linearGradient id="pl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ecc77a"/><stop offset=".55" stop-color="#a47a34"/><stop offset="1" stop-color="#d7ad60"/></linearGradient><linearGradient id="pp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a2e16"/><stop offset=".45" stop-color="#d08a55"/><stop offset="1" stop-color="#5a2e16"/></linearGradient>',
    body: `<rect width="240" height="336" rx="18" fill="#4a4d50"/><rect x="6" y="6" width="228" height="324" rx="14" fill="url(#b)"/>
<rect x="18" y="18" width="204" height="300" rx="6" fill="none" stroke="#45494d" stroke-width="10"/><rect x="18" y="18" width="204" height="300" rx="6" fill="none" stroke="#7d8287" stroke-width="6" stroke-linecap="round" stroke-dasharray="0 17"/>
<g fill="#b8693a"><path d="M10 10 H54 V20 H20 V54 H10 Z"/><path d="M230 10 H186 V20 H220 V54 H230 Z"/><path d="M10 326 H54 V316 H20 V282 H10 Z"/><path d="M230 326 H186 V316 H220 V282 H230 Z"/></g>
<rect x="114" y="96" width="12" height="40" fill="url(#pp)"/><circle cx="120" cy="74" r="30" fill="#8f4f2a"/><circle cx="120" cy="74" r="24" fill="#efe7d3"/>
<path d="M102 74 A18 18 0 0 1 138 74" fill="none" stroke="#1d1a14" stroke-width="4" stroke-dasharray="1 5.1"/><path d="M120 74 L106 63" stroke="#b8322a" stroke-width="2.5" stroke-linecap="round"/><circle cx="120" cy="74" r="3" fill="#1d1a14"/>
<ellipse cx="120" cy="178" rx="84" ry="56" fill="url(#pl)" stroke="#5a3f16" stroke-width="3"/><ellipse cx="120" cy="178" rx="72" ry="45" fill="none" stroke="#5a3f16" stroke-width="1.5"/>
<g fill="#5a3f16"><circle cx="44" cy="178" r="3.5"/><circle cx="196" cy="178" r="3.5"/></g>
<g fill="none" stroke="#3a2810" stroke-width="3"><circle cx="120" cy="178" r="26"/><path d="M120 158 V178 L134 186" stroke-linecap="round"/></g>
<rect x="44" y="256" width="152" height="12" rx="2" fill="url(#pp)"/><rect x="60" y="250" width="10" height="24" rx="2" fill="#8f4f2a"/><rect x="170" y="250" width="10" height="24" rx="2" fill="#8f4f2a"/>`,
  },
  'back:wadokei': {
    ink: '#f0d58a', textY: 282,
    defs: '<linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0d58a"/><stop offset=".5" stop-color="#9a7430"/><stop offset="1" stop-color="#d4a548"/></linearGradient><pattern id="w" width="32" height="16" patternUnits="userSpaceOnUse"><g fill="#0f1d3a" stroke="#c9a04f" stroke-opacity=".7" stroke-width="1"><circle r="15"/><circle r="10"/><circle r="5"/><circle cx="32" r="15"/><circle cx="32" r="10"/><circle cx="32" r="5"/><circle cx="16" cy="8" r="15"/><circle cx="16" cy="8" r="10"/><circle cx="16" cy="8" r="5"/><circle cy="16" r="15"/><circle cy="16" r="10"/><circle cy="16" r="5"/><circle cx="32" cy="16" r="15"/><circle cx="32" cy="16" r="10"/><circle cx="32" cy="16" r="5"/></g></pattern>',
    body: `<rect width="240" height="336" rx="18" fill="url(#f)"/><rect x="9" y="9" width="222" height="318" rx="12" fill="url(#w)"/>
<circle cx="120" cy="150" r="70" fill="#0c0807" stroke="#d4a548" stroke-width="3"/><circle cx="120" cy="150" r="62" fill="none" stroke="#b8321f" stroke-width="9"/>
<path d="M120 150 m-50 0 a50 50 0 1 0 100 0 a50 50 0 1 0 -100 0" fill="none" stroke="#f0d58a" stroke-width="7" stroke-dasharray="2 24.18" stroke-dashoffset="1"/>
<circle cx="120" cy="150" r="30" fill="none" stroke="#d4a548" stroke-width="1.2"/>
<g fill="none" stroke="#f0d58a" stroke-width="4" stroke-linecap="round"><path d="M120 150 V126"/><path d="M120 150 L138 160"/></g><circle cx="120" cy="150" r="5" fill="#f0d58a"/>
<rect x="56" y="264" width="128" height="26" rx="13" fill="#0c0807" stroke="#d4a548" stroke-width="1.5"/>`,
  },
  'back:compass': {
    ink: '#e2c27a', textY: 304,
    defs: '<radialGradient id="b" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#11405a"/><stop offset="1" stop-color="#03101a"/></radialGradient>',
    body: `<rect width="240" height="336" rx="18" fill="#7d5f2a"/><rect x="6" y="6" width="228" height="324" rx="14" fill="url(#b)"/>
<rect x="16" y="16" width="208" height="304" rx="8" fill="none" stroke="#d7b46a" stroke-width="6" stroke-dasharray="5 3"/>
<circle cx="120" cy="156" r="80" fill="none" stroke="#c8a25a" stroke-width="2.5"/><circle cx="120" cy="156" r="72" fill="none" stroke="#bfe9e4" stroke-width="7" stroke-dasharray="1.2 6.34" opacity=".7"/><circle cx="120" cy="156" r="64" fill="none" stroke="#c8a25a" stroke-width="1.2"/>
<g fill="#2fb3a6" fill-opacity=".25"><path d="M120 76 L130 146 L120 156 Z"/><path d="M120 236 L110 166 L120 156 Z"/><path d="M40 156 L110 146 L120 156 Z"/><path d="M200 156 L130 166 L120 156 Z"/></g>
<g fill="none" stroke="#e2c27a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><circle cx="120" cy="96" r="10"/><path d="M120 106 V214"/><path d="M94 122 H146"/><path d="M78 180 Q88 216 120 216 Q152 216 162 180"/></g>
<g fill="#e2c27a"><path d="M70 172 L86 170 L80 186 Z"/><path d="M170 172 L154 170 L160 186 Z"/></g>`,
  },
  'back:forge': {
    ink: '#ffb56a', textY: 306,
    defs: '<radialGradient id="b" cx="50%" cy="62%" r="65%"><stop offset="0" stop-color="#7a2a0c"/><stop offset=".45" stop-color="#2a1510"/><stop offset="1" stop-color="#0b0807"/></radialGradient><linearGradient id="bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".3" stop-color="#ffb04a"/><stop offset=".6" stop-color="#c8501a"/><stop offset="1" stop-color="#6d6a66"/></linearGradient>',
    body: `<rect width="240" height="336" rx="18" fill="#3d3936"/><rect x="8" y="8" width="224" height="320" rx="12" fill="url(#b)"/>
<path d="M18 18 H222 V318 H18 Z" fill="none" stroke="#2a2523" stroke-width="6"/><path d="M18 18 H222 V318 H18 Z" fill="none" stroke="#77716a" stroke-width="6" stroke-linecap="round" stroke-dasharray="0 34"/>
<path d="M48 290 V150 Q48 70 120 50 Q192 70 192 150 V290" fill="none" stroke="#3d3936" stroke-width="5"/><path d="M58 290 V152 Q58 82 120 64 Q182 82 182 152 V290" fill="none" stroke="#ff7a2a" stroke-opacity=".35" stroke-width="2"/>
<g stroke="#ffc46b" stroke-width="1.6" stroke-linecap="round"><path d="M120 214 L82 168"/><path d="M120 214 L158 168"/><path d="M120 214 L70 196"/><path d="M120 214 L170 196"/><path d="M120 214 L96 156"/><path d="M120 214 L144 156"/></g>
<g fill="#ffe2a0"><circle cx="80" cy="164" r="2"/><circle cx="160" cy="164" r="2"/><circle cx="66" cy="194" r="1.6"/><circle cx="174" cy="194" r="1.6"/><circle cx="94" cy="150" r="1.4"/><circle cx="146" cy="150" r="1.4"/></g>
<path d="M112 196 V92 L120 72 L128 92 V196 Z" fill="url(#bd)" stroke="#1d1a18" stroke-width="1.5"/><path d="M120 76 V194" stroke="#fff3d0" stroke-width="1" opacity=".6"/>
<rect x="94" y="194" width="52" height="9" rx="3" fill="#77716a" stroke="#1d1a18" stroke-width="1.5"/><rect x="115" y="203" width="10" height="22" fill="#4a2e1a"/>
<path d="M62 232 H168 Q190 232 200 220 L206 232 Q194 250 164 252 L154 268 H172 V284 H68 V268 H86 L76 252 Q60 250 62 240 Z" fill="#0a0908" stroke="#ff9a4a" stroke-width="2"/>`,
  },
  'back:archive': {
    ink: '#e3c27a', textY: 298,
    defs: '<radialGradient id="l" cx="45%" cy="40%" r="75%"><stop offset="0" stop-color="#6a3c22"/><stop offset="1" stop-color="#2a150c"/></radialGradient><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0d58a"/><stop offset=".5" stop-color="#9a7430"/><stop offset="1" stop-color="#d4a548"/></linearGradient>',
    body: `<rect width="240" height="336" rx="18" fill="#2a150c"/><rect x="5" y="5" width="230" height="326" rx="14" fill="url(#l)"/>
<rect x="18" y="18" width="204" height="300" rx="4" fill="none" stroke="#c9a04f" stroke-width="2"/><rect x="26" y="26" width="188" height="284" rx="2" fill="none" stroke="#c9a04f" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="0 7"/>
<g fill="#c9a04f"><path d="M26 26 L44 30 L30 44 Z"/><path d="M214 26 L196 30 L210 44 Z"/><path d="M26 310 L44 306 L30 292 Z"/><path d="M214 310 L196 306 L210 292 Z"/></g>
<g fill="url(#g)"><rect x="210" y="96" width="30" height="20" rx="3"/><rect x="210" y="220" width="30" height="20" rx="3"/></g><g fill="#5a3a12"><circle cx="226" cy="106" r="3"/><circle cx="226" cy="230" r="3"/></g>
<circle cx="120" cy="156" r="62" fill="none" stroke="#c9a04f" stroke-width="2"/><circle cx="120" cy="156" r="54" fill="none" stroke="#c9a04f" stroke-width="1" stroke-dasharray="2 3"/>
<path d="M104 104 H136 L120 128 L136 152 H104 L120 128 Z" fill="none" stroke="url(#g)" stroke-width="4" stroke-linejoin="round"/><path d="M110 146 H130 L120 136 Z" fill="#f0d58a"/>
<path d="M72 196 Q96 180 120 192 Q144 180 168 196 V170 Q144 156 120 168 Q96 156 72 170 Z" fill="#e3d3ad" stroke="#c9a04f" stroke-width="2.5"/><path d="M120 168 V192" stroke="#8a6a3a" stroke-width="1.5"/>
<g stroke="#8a6a3a" stroke-width="1"><path d="M82 176 Q98 168 112 175 M82 183 Q98 175 112 182 M128 175 Q142 168 158 176 M128 182 Q142 175 158 183"/></g>
<path d="M114 196 H126 V262 L120 254 L114 262 Z" fill="#7a1f2b"/>`,
  },
};
export const backSvg = (id: string, w: number, h: number, withText = false) => {
  const b = BACK_ART[id];
  const text = withText ? `<text x="120" y="${b.textY}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="13" letter-spacing="3" fill="${b.ink}">CHRONO DUEL</text>` : '';
  return svgDoc(BACK_VIEW, w, h, b.body + text, b.defs);
};

// ------------------------------------------------------------------ playmats
export const MAT_VIEW = { x: 0, y: 366, w: 390, h: 414 };
export interface MatLook {
  defs: string; under: string; over: string;
  spins?: SpinLayer[];
  /** A layer that breathes (forge glow, candle light). */
  glow?: { body: string; min: number; max: number; period: number };
  /** A layer that drifts slowly (light through coloured glass). */
  drift?: string;
  fx?: { embers?: boolean; ripple?: { x: number; y: number }; steam?: { x: number; y: number }[] };
}
const vig = (id: string, a: number) => `<radialGradient id="${id}" cx="50%" cy="25%" r="60%"><stop offset="0" stop-color="#000" stop-opacity="${a}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
const MR = 'x="0" y="366" width="390" height="414"';
const sei = (id: string, w: number, h: number, bg: string, line: string) => {
  const r1 = w / 2 - 1, r2 = r1 * 0.68, r3 = r1 * 0.37;
  const ring = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="${r1}"/><circle cx="${x}" cy="${y}" r="${f(r2)}"/><circle cx="${x}" cy="${y}" r="${f(r3)}"/>`;
  return `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><g fill="${bg}" stroke="${line}" stroke-width="1">${ring(0, 0)}${ring(w, 0)}${ring(w / 2, h / 2)}${ring(0, h)}${ring(w, h)}</g></pattern>`;
};
const matGear = (r: number, teeth: number, tw: number) => {
  const p = f((2 * Math.PI * r) / teeth);
  return `<circle r="${r}" fill="none" stroke="#5a4626" stroke-width="${tw}" stroke-dasharray="${f(p / 2)} ${f(p / 2)}"/><circle r="${r - tw / 2 - 2}" fill="#1d170e" stroke="#8a6a32" stroke-width="3"/><circle r="${f(r * 0.68)}" fill="#0e1214" stroke="#6d5428" stroke-width="2"/><path d="M${-r + 14} 0 H${r - 14} M0 ${-r + 14} V${r - 14} M${f(-r * 0.64)} ${f(-r * 0.64)} L${f(r * 0.64)} ${f(r * 0.64)} M${f(-r * 0.64)} ${f(r * 0.64)} L${f(r * 0.64)} ${f(-r * 0.64)}" stroke="#4a3a20" stroke-width="${f(r * 0.09)}"/><circle r="${f(r * 0.17)}" fill="#6d5428"/>`;
};

export const MAT_ART: Record<string, MatLook> = {
  'mat:skeleton': {
    defs: '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12181b"/><stop offset="1" stop-color="#0a0d0f"/></linearGradient>' + vig('v', 0.55),
    under: `<rect ${MR} fill="url(#g)"/>`,
    spins: [
      { cx: 18, cy: 800, r: 162, speed: 0.04, body: matGear(150, 36, 22) },
      { cx: 392, cy: 476, r: 102, speed: -0.07, body: matGear(92, 24, 16) },
      { cx: 312, cy: 742, r: 58, speed: 0.1, body: matGear(50, 15, 10) },
      { cx: -6, cy: 470, r: 46, speed: -0.12, body: matGear(40, 15, 9) },
    ],
    over: `<rect ${MR} fill="url(#v)"/>
<line x1="0" y1="368" x2="390" y2="368" stroke="#a7843f" stroke-width="4"/><line x1="8" y1="376" x2="390" y2="376" stroke="#c9a15a" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 16" opacity=".7"/>
<g stroke="#a7843f" stroke-width="2" opacity=".85"><path d="M10 386 V770 M380 386 V770"/></g><g fill="#c9a15a"><circle cx="10" cy="386" r="4"/><circle cx="380" cy="386" r="4"/></g>`,
  },
  'mat:astro': {
    defs: '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141827"/><stop offset="1" stop-color="#0b0d17"/></linearGradient>' + vig('v', 0.5),
    under: `<rect ${MR} fill="url(#g)"/>
<g fill="none" stroke="#2c3550" stroke-linecap="round"><path d="M-10 430 C60 410 90 470 160 450 S270 400 400 440" stroke-width="2.5"/><path d="M-10 640 C80 600 140 680 230 640 S330 600 400 620" stroke-width="3.5"/><path d="M40 780 C70 700 140 720 150 660" stroke-width="2"/><path d="M300 366 C320 420 290 470 330 520" stroke-width="2"/></g>
<g fill="none" stroke="#c9a04f"><circle cx="195" cy="880" r="492" stroke-width="2.5" stroke-opacity=".85"/><circle cx="195" cy="880" r="470" stroke-width="1.5" stroke-opacity=".85"/><circle cx="195" cy="880" r="481" stroke-width="18" stroke-opacity=".14"/><circle cx="195" cy="880" r="481" stroke-width="18" stroke-dasharray="1.6 20" stroke-opacity=".8"/><circle cx="195" cy="880" r="320" stroke-width="2" stroke-opacity=".7"/><circle cx="195" cy="880" r="300" stroke-width="1" stroke-opacity=".6"/>
<path d="M195 880 L-260 366 M195 880 L55 366 M195 880 L195 366 M195 880 L335 366 M195 880 L650 366" stroke-width="1.5" stroke-opacity=".6"/></g>
<g fill="none" stroke="#e0b85a" stroke-opacity=".5" stroke-width="1"><path d="M40 610 L78 586 L112 600 L130 566"/><path d="M262 640 L292 612 L330 622 L350 590 L372 600"/></g>
<g fill="#f3d98a"><circle cx="40" cy="610" r="2.4"/><circle cx="78" cy="586" r="1.8"/><circle cx="112" cy="600" r="2"/><circle cx="130" cy="566" r="2.6"/><circle cx="262" cy="640" r="2"/><circle cx="292" cy="612" r="2.6"/><circle cx="330" cy="622" r="1.8"/><circle cx="350" cy="590" r="2.2"/><circle cx="372" cy="600" r="1.6"/></g>
<g fill="#e0b85a"><circle cx="195" cy="560" r="5"/><circle cx="195" cy="560" r="10" fill="none" stroke="#e0b85a" stroke-width="1"/></g>`,
    over: `<rect ${MR} fill="url(#v)"/><line x1="0" y1="368" x2="390" y2="368" stroke="#a0823f" stroke-width="3"/><line x1="0" y1="373" x2="390" y2="373" stroke="#a0823f" stroke-width="1" opacity=".6"/>`,
  },
  'mat:cathedral': {
    defs: '<pattern id="t" width="64" height="96" patternUnits="userSpaceOnUse"><rect width="64" height="96" fill="#100f0d"/><rect x="2" y="2" width="60" height="44" fill="#211f1b"/><rect x="34" y="50" width="60" height="44" fill="#1d1b18"/><rect x="-30" y="50" width="60" height="44" fill="#23201c"/></pattern><filter id="b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>' + vig('v', 0.55),
    under: (() => {
      const rs = [30, 48, 66, 84, 102, 120, 138, 156, 174, 192, 210, 228, 246, 264];
      const turn = [0, 140, 40, 200, 90, 250, 10, 170, 60, 300, 120, 30, 220, 100];
      const rings = rs.map((r, i) => `<circle cx="195" cy="470" r="${r}" stroke-dasharray="${f(2 * Math.PI * r - 14)} 14" transform="rotate(${turn[i]} 195 470)"/>`).join('');
      return `<rect ${MR} fill="url(#t)"/><g fill="none" stroke="#8a7f68" stroke-opacity=".75" stroke-width="3.5">${rings}</g>
<g fill="#8a7f68" fill-opacity=".8"><circle cx="195" cy="456" r="7"/><circle cx="207" cy="463" r="7"/><circle cx="207" cy="477" r="7"/><circle cx="195" cy="484" r="7"/><circle cx="183" cy="477" r="7"/><circle cx="183" cy="463" r="7"/></g>`;
    })(),
    drift: `<g filter="url(#b)"><ellipse cx="60" cy="470" rx="80" ry="34" fill="#c0283f" opacity=".45" transform="rotate(-32 60 470)"/><ellipse cx="190" cy="580" rx="96" ry="34" fill="#2f5fd0" opacity=".42" transform="rotate(-32 190 580)"/><ellipse cx="330" cy="680" rx="90" ry="34" fill="#e0a238" opacity=".38" transform="rotate(-32 330 680)"/><ellipse cx="110" cy="720" rx="70" ry="26" fill="#22a070" opacity=".32" transform="rotate(-32 110 720)"/><ellipse cx="330" cy="440" rx="60" ry="22" fill="#2f5fd0" opacity=".3" transform="rotate(-32 330 440)"/></g>`,
    over: `<rect ${MR} fill="url(#v)"/><rect x="0" y="366" width="390" height="9" fill="#3a352d"/><line x1="0" y1="375" x2="390" y2="375" stroke="#c8bc98" stroke-width="1.2"/>`,
  },
  'mat:steam': {
    defs: '<linearGradient id="p" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a2e16"/><stop offset=".45" stop-color="#d08a55"/><stop offset="1" stop-color="#5a2e16"/></linearGradient><linearGradient id="cu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e3a1e"/><stop offset=".5" stop-color="#c47a45"/><stop offset="1" stop-color="#6e3a1e"/></linearGradient>' + vig('v', 0.5),
    under: `<rect ${MR} fill="#1c1d1f"/>
<rect x="0" y="366" width="130" height="160" fill="#232527"/><rect x="260" y="526" width="130" height="160" fill="#212325"/><rect x="130" y="686" width="130" height="100" fill="#242628"/><rect x="130" y="366" width="130" height="160" fill="#1a1b1d"/>
<g stroke="#070808" stroke-width="4"><path d="M130 366 V780 M260 366 V780 M0 526 H390 M0 686 H390"/></g><g stroke="#3d4044" stroke-width="1.2"><path d="M133 366 V780 M263 366 V780 M0 529 H390 M0 689 H390"/></g>
<g stroke="#5c6066" stroke-width="6" stroke-linecap="round" stroke-dasharray="0 16"><path d="M122 380 V780 M138 380 V780 M252 380 V780 M268 380 V780 M0 518 H390 M0 534 H390 M0 678 H390 M0 694 H390"/></g>
<g fill="#3a2a20" opacity=".5"><ellipse cx="60" cy="620" rx="30" ry="14"/><ellipse cx="320" cy="430" rx="22" ry="10"/></g>
<rect x="0" y="750" width="390" height="20" fill="#7a3f20"/><rect x="0" y="753" width="390" height="6" fill="#d08a55" opacity=".7"/>
<rect x="6" y="366" width="18" height="400" fill="url(#p)"/><rect x="366" y="366" width="18" height="400" fill="url(#p)"/>
<g fill="#8f4f2a" stroke="#3a1d0e" stroke-width="1.5"><rect x="0" y="470" width="30" height="14" rx="2"/><rect x="0" y="640" width="30" height="14" rx="2"/><rect x="360" y="470" width="30" height="14" rx="2"/><rect x="360" y="640" width="30" height="14" rx="2"/><rect x="90" y="744" width="14" height="32" rx="2"/><rect x="286" y="744" width="14" height="32" rx="2"/></g>
<g transform="translate(375 600)"><circle r="16" fill="#8f4f2a"/><circle r="12" fill="#efe7d3"/><path d="M0 0 L-8 -5" stroke="#b8322a" stroke-width="2" stroke-linecap="round"/><circle r="2" fill="#1d1a14"/></g>`,
    over: `<rect ${MR} fill="url(#v)"/><rect x="0" y="366" width="390" height="8" fill="url(#cu)"/><path d="M6 370 H390" stroke="#e8b48a" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 20" opacity=".8"/>`,
    fx: { steam: [{ x: 352, y: 470 }, { x: 98, y: 744 }] },
  },
  'mat:wadokei': {
    defs: '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140d0a"/><stop offset="1" stop-color="#080504"/></linearGradient>' + sei('s', 40, 20, '#0c0807', '#d4a548') + vig('v', 0.5),
    under: `<rect ${MR} fill="url(#g)"/>
<path d="M110 780 Q240 690 390 520 V780 Z" fill="url(#s)" opacity=".75"/><path d="M110 780 Q240 690 390 520" fill="none" stroke="#d4a548" stroke-width="2.5"/>
<path d="M0 366 H200 Q100 430 0 500 Z" fill="url(#s)" opacity=".6"/><path d="M200 366 Q100 430 0 500" fill="none" stroke="#d4a548" stroke-width="2"/>
<g fill="#d4a548" fill-opacity=".3" stroke="#f0d58a" stroke-opacity=".6" stroke-width="1.2"><rect x="-20" y="600" width="190" height="22" rx="11"/><rect x="40" y="632" width="130" height="18" rx="9"/><rect x="230" y="420" width="180" height="20" rx="10"/></g>
<g transform="translate(330 470)" fill="#b8321f"><circle r="16"/><circle r="16" fill="none" stroke="#f0d58a" stroke-width="1.5"/><circle r="6" fill="#f0d58a"/></g>
<g fill="#e6c26a" opacity=".6"><circle cx="40" cy="520" r="1"/><circle cx="72" cy="580" r=".8"/><circle cx="210" cy="600" r="1"/><circle cx="330" cy="520" r=".9"/><circle cx="290" cy="410" r=".8"/><circle cx="120" cy="720" r="1"/><circle cx="180" cy="690" r=".8"/><circle cx="20" cy="700" r=".9"/></g>`,
    over: `<rect ${MR} fill="url(#v)"/><rect x="0" y="366" width="390" height="5" fill="#9e2a1a"/><line x1="0" y1="374" x2="390" y2="374" stroke="#d4a548" stroke-width="1.2"/>`,
  },
  'mat:compass': {
    defs: '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#062431"/><stop offset="1" stop-color="#020b10"/></linearGradient><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>' + vig('v', 0.45),
    under: `<rect ${MR} fill="url(#g)"/>
<g filter="url(#b)" fill="#bfe9e4" opacity=".32"><ellipse cx="318" cy="600" rx="16" ry="6"/><ellipse cx="312" cy="640" rx="22" ry="5"/><ellipse cx="322" cy="684" rx="28" ry="6"/><ellipse cx="316" cy="730" rx="34" ry="6"/></g>
<g fill="none" stroke="#2fb3a6" stroke-opacity=".16" stroke-width="1"><path d="M0 430 H390 M0 500 H390 M0 570 H390 M0 640 H390 M0 710 H390 M65 366 V780 M130 366 V780 M195 366 V780 M260 366 V780 M325 366 V780"/></g>
<g transform="translate(70 700)" opacity=".55"><circle r="58" fill="none" stroke="#c8a25a" stroke-width="1.5"/><circle r="50" fill="none" stroke="#c8a25a" stroke-width="5" stroke-dasharray="1 4.24"/>
<g fill="#2fb3a6"><path d="M0 -56 L7 -7 L0 0 Z" fill-opacity=".9"/><path d="M0 -56 L-7 -7 L0 0 Z" fill-opacity=".45"/><path d="M0 56 L-7 7 L0 0 Z" fill-opacity=".9"/><path d="M0 56 L7 7 L0 0 Z" fill-opacity=".45"/><path d="M-56 0 L-7 -7 L0 0 Z" fill-opacity=".45"/><path d="M-56 0 L-7 7 L0 0 Z" fill-opacity=".9"/><path d="M56 0 L7 7 L0 0 Z" fill-opacity=".45"/><path d="M56 0 L7 -7 L0 0 Z" fill-opacity=".9"/></g></g>
<g fill="none" stroke="#2fb3a6"><ellipse cx="195" cy="456" rx="70" ry="22" stroke-opacity=".45" stroke-width="1.8"/><ellipse cx="195" cy="456" rx="130" ry="40" stroke-opacity=".34" stroke-width="1.5"/><ellipse cx="195" cy="456" rx="200" ry="62" stroke-opacity=".24" stroke-width="1.2"/></g>
<g fill="none" stroke="#2fb3a6" stroke-opacity=".22" stroke-width="1.2" stroke-linecap="round"><path d="M14 640 q10 -5 20 0 t20 0"/><path d="M60 700 q10 -5 20 0 t20 0 t20 0"/><path d="M230 740 q10 -5 20 0 t20 0"/><path d="M300 420 q10 -5 20 0 t20 0"/></g>`,
    over: `<rect ${MR} fill="url(#v)"/><line x1="0" y1="368" x2="390" y2="368" stroke="#d7b46a" stroke-width="5" stroke-dasharray="5 3"/>`,
    fx: { ripple: { x: 195, y: 456 } },
  },
  'mat:forge': {
    defs: '<pattern id="br" width="80" height="40" patternUnits="userSpaceOnUse"><rect width="80" height="40" fill="#080605"/><rect x="2" y="2" width="76" height="16" rx="2" fill="#241914"/><rect x="-38" y="22" width="76" height="16" rx="2" fill="#1f1611"/><rect x="42" y="22" width="76" height="16" rx="2" fill="#271b15"/></pattern><radialGradient id="gl" cx="18%" cy="100%" r="95%"><stop offset="0" stop-color="#ff6a1a" stop-opacity=".6"/><stop offset=".45" stop-color="#ff6a1a" stop-opacity=".18"/><stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/></radialGradient><radialGradient id="m" cx="50%" cy="100%" r="90%"><stop offset="0" stop-color="#ffe2a0"/><stop offset=".35" stop-color="#ff9a3a"/><stop offset=".75" stop-color="#b8400e"/><stop offset="1" stop-color="#3a1206"/></radialGradient>' + vig('v', 0.5),
    under: `<rect ${MR} fill="url(#br)"/>
<path d="M-10 780 V690 Q-10 610 70 610 Q150 610 150 690 V780 Z" fill="#050403" stroke="#3a2a20" stroke-width="10"/><path d="M4 780 V694 Q4 626 70 626 Q136 626 136 694 V780 Z" fill="url(#m)"/>
<path d="M250 712 H360 Q378 712 386 702 L394 712 Q382 730 352 732 L342 750 H362 V780 H268 V750 H288 L278 732 Q262 730 250 724 Z" fill="#070605"/><path d="M250 712 H360 Q378 712 386 702" fill="none" stroke="#ff9a4a" stroke-opacity=".55" stroke-width="2"/>`,
    glow: { body: `<rect ${MR} fill="url(#gl)"/>`, min: 0.6, max: 1, period: 2.6 },
    over: `<rect ${MR} fill="url(#v)"/><rect x="0" y="366" width="390" height="8" fill="#3d3936"/><path d="M8 370 H390" stroke="#77716a" stroke-width="5" stroke-linecap="round" stroke-dasharray="0 24"/>`,
    fx: { embers: true },
  },
  'mat:archive': {
    defs: '<linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c1810"/><stop offset="1" stop-color="#170c07"/></linearGradient><linearGradient id="pl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#55452e"/><stop offset=".85" stop-color="#6e5c3e"/><stop offset="1" stop-color="#3a2d1d"/></linearGradient><linearGradient id="pr" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#55452e"/><stop offset=".85" stop-color="#6e5c3e"/><stop offset="1" stop-color="#3a2d1d"/></linearGradient><radialGradient id="c" cx="10%" cy="0%" r="90%"><stop offset="0" stop-color="#ffb860" stop-opacity=".28"/><stop offset="1" stop-color="#ffb860" stop-opacity="0"/></radialGradient>' + vig('v', 0.35),
    under: `<rect ${MR} fill="url(#d)"/>
<path d="M8 392 Q100 380 195 396 V770 Q100 756 8 766 Z" fill="url(#pl)"/><path d="M382 392 Q290 380 195 396 V770 Q290 756 382 766 Z" fill="url(#pr)"/>
<g stroke="#1f160c" stroke-opacity=".75" stroke-width="1.2"><path d="M28 600 H176 M28 614 H176 M28 628 H176 M28 642 H150 M214 600 H362 M214 614 H362 M214 628 H330 M60 720 H176 M60 734 H176 M28 748 H120 M214 720 H362 M214 734 H362 M214 748 H300"/></g>
<g transform="translate(28 706)"><rect width="26" height="30" fill="#7a1f2b"/><rect x="2" y="2" width="22" height="26" fill="none" stroke="#c9a04f" stroke-width="1"/><path d="M7 8 H19 M13 8 V25" stroke="#e3c27a" stroke-width="3" stroke-linecap="round"/></g>
<g transform="translate(290 660)" fill="none" stroke="#2a1d12" stroke-opacity=".7" stroke-width="1.2"><circle r="24"/><circle r="17" stroke-dasharray="1.5 3"/><path d="M0 0 L-10 -14 M0 0 L14 -3"/></g>
<g transform="translate(100 440)" fill="none" stroke="#2a1d12" stroke-opacity=".6" stroke-width="1.2"><path d="M-14 -20 H14 L0 0 L14 20 H-14 L0 0 Z"/></g>
<rect x="186" y="396" width="18" height="374" fill="#000" opacity=".35"/><path d="M190 750 H200 V786 L195 780 L190 786 Z" fill="#7a1f2b"/>`,
    glow: { body: `<rect ${MR} fill="url(#c)"/>`, min: 0.65, max: 1, period: 3.4 },
    over: `<rect ${MR} fill="url(#v)"/><rect x="0" y="366" width="390" height="5" fill="#4a2a1a"/><path d="M6 375 H390" stroke="#c9a04f" stroke-width="2" stroke-linecap="round" stroke-dasharray="0 7" opacity=".8"/>`,
  },
};
const matView = () => `${MAT_VIEW.x} ${MAT_VIEW.y} ${MAT_VIEW.w} ${MAT_VIEW.h}`;
export function matPartSvg(id: string, part: 'under' | 'over' | 'glow' | 'drift', scale: number): string {
  const m = MAT_ART[id];
  const body = part === 'glow' ? m.glow?.body ?? '' : part === 'drift' ? m.drift ?? '' : m[part];
  return svgDoc(matView(), f(MAT_VIEW.w * scale), f(MAT_VIEW.h * scale), body, m.defs);
}
/** The whole mat in one picture (previews, and the opponent's mat which does not move). */
export function matFlatSvg(id: string, w: number, h = (w * MAT_VIEW.h) / MAT_VIEW.w, lanes = false): string {
  const m = MAT_ART[id];
  const spins = (m.spins ?? []).map((s) => `<g transform="translate(${s.cx} ${s.cy})">${s.body}</g>`).join('');
  const lane = lanes ? '<g fill="#000" fill-opacity=".38" stroke="#e8dcc0" stroke-opacity=".35" stroke-width="1.5"><rect x="30" y="392" width="100" height="128" rx="10"/><rect x="145" y="392" width="100" height="128" rx="10"/><rect x="260" y="392" width="100" height="128" rx="10"/></g>' : '';
  return svgDoc(matView(), f(w), f(h), m.under + spins + (m.drift ?? '') + (m.glow?.body ?? '') + m.over + lane, m.defs);
}
