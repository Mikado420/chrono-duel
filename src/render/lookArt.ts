/**
 * Art for the themed looks (8 themes × clock face, card back and playmat), drawn as SVG and rasterised once.
 *
 * The pictures themselves are generated from the theme designs into themeArt.ts, which is loaded on its own
 * (it is large) right after the game starts: `artReady` resolves when it is in. This file keeps what the game
 * needs at once (colours, which effects a look has) and turns the generated strings into the parts the game
 * draws.
 *
 * Clock faces are drawn in a small "design" space: centre (195,210), face radius 158, which the dial scales by
 * DIAL_S onto its own centre (360,388) and radius. The dial itself still draws the ticks, the numbers, the hands
 * and the doom band, so every face reads the same in play; the art supplies the face, the rim and the bell marks
 * (r = 122.6, where the dial puts its bells). Parts that move (gears, the zodiac ring) are separate layers.
 *
 * Card backs are 240×336 (scaled to the 340×476 card); the CHRONO DUEL line is added with the game's font.
 * Playmats are 390×414, the player's half of a 390-wide board from the front line (y 366) down.
 */
import type { GenTheme } from './themeArt';

// ------------------------------------------------------------------ helpers
const C = 195, Y = 210;
const f = (n: number) => +n.toFixed(2);
/** The upper half circle of radius r around the dial centre (open path, left to right). */
const arc = (r: number) => `M${f(C - r)} ${Y} A${r} ${r} 0 0 1 ${f(C + r)} ${Y}`;
const semi = (r: number) => `${arc(r)} Z`;
export const BELL_R = 122.6;
/** Evenly spaced ticks along an arc (dial previews only; in play the dial draws its own). */
const tickArc = (r: number, n: number, len: number, w: number, color: string) => { const p = (Math.PI * r) / n; return `<path d="${arc(r)}" fill="none" stroke="${color}" stroke-width="${len}" stroke-dasharray="${w} ${f(p - w)}" stroke-dashoffset="${w / 2}"/>`; };

export const svgDoc = (viewBox: string, w: number, h: number, body: string, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;

// ------------------------------------------------------------------ the generated pictures (loaded on their own)
let GEN: Record<string, GenTheme> | null = null;
/** Resolves once the theme pictures are loaded (they fill in DIAL_ART, BACK_ART and MAT_ART). */
export const artReady: Promise<void> = import('./themeArt').then((m) => { GEN = m.THEME_ART; fill(); }).catch(() => {});
export const artLoaded = () => GEN !== null;

/** Theme ids (kept from the first themes, so whoever owns one keeps it) → the design each now shows. */
const THEME_IDS = ['skeleton', 'astro', 'cathedral', 'steam', 'wadokei', 'compass', 'forge', 'archive'] as const;
/** The theme of a look id ('dial:forge' → 'forge'). */
export const themeOf = (id: string | undefined) => (id ? id.slice(id.indexOf(':') + 1) : '');

// ------------------------------------------------------------------ dial
export const DIAL_S = 1.86;
/** The part of design space a face covers. */
export const DIAL_VIEW = { x: 30, y: 45, w: 330, h: 170 };
export interface SpinLayer { body: string; cx: number; cy: number; r: number; speed: number; defs?: string }
export interface DialArt {
  defs: string; under: string; over: string;
  /** Defs for the `over` layer (bells and the light on the glass), when it has its own. */
  overDefs?: string;
  spins?: SpinLayer[];
  /** Defs for the spinning layers. */
  spinDefs?: string;
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
const blankArt = (): DialArt => ({ defs: '', under: '', over: '' });

export const DIAL_ART: Record<string, DialLook> = {
  'dial:skeleton': { face: 0x0b1216, rim: 0xd6b06a, tick: 0xf6dc98, minor: 0xa9864a, num: 0xf0cf86, numStroke: 0x05090b, art: blankArt() },
  'dial:astro': { face: 0x18306a, rim: 0xe0b85a, tick: 0xf6dc98, minor: 0xb8954a, num: 0xf3d98a, numStroke: 0x0b1430, art: blankArt() },
  'dial:cathedral': { face: 0x041019, rim: 0x9ab4c4, tick: 0xeefbff, minor: 0x7ad8ff, num: 0xe8fbff, numStroke: 0x020a12, art: blankArt() },
  'dial:steam': { face: 0xe9e2cf, rim: 0xb8693a, tick: 0x1d1a14, minor: 0x3a3328, num: 0x1d1a14, numStroke: 0xf4eedf, art: blankArt() },
  'dial:wadokei': {
    face: 0x14081a, rim: 0x4a3038, tick: 0xffe0ea, minor: 0xc88aa0, num: 0xffe8f0, numStroke: 0x14060e, numFont: 'display',
    labels: ['〇', '五', '十', '十五', '廿', '廿五', '卅', '卅五', '卌'], art: blankArt(),
  },
  'dial:compass': { face: 0x0a0a30, rim: 0x6a70b8, tick: 0xeef0ff, minor: 0x8a90d0, num: 0xeef0ff, numStroke: 0x03021a, art: blankArt() },
  'dial:forge': { face: 0x1a1817, rim: 0x77716a, tick: 0xf2ede6, minor: 0x9a948c, num: 0xe0d6c8, numStroke: 0x000000, hot: true, art: { ...blankArt(), embers: true } },
  'dial:archive': { face: 0xe3d3ad, rim: 0xc9a04f, tick: 0x2a1d12, minor: 0x5a4630, num: 0x2a1d12, numStroke: 0xf6ead0, italic: true, art: blankArt() },
};

const dialView = () => `${DIAL_VIEW.x} ${DIAL_VIEW.y} ${DIAL_VIEW.w} ${DIAL_VIEW.h}`;
/** One part of a face as a full-frame SVG (rendered at `scale` px per design unit). */
export function dialPartSvg(id: string, part: 'under' | 'over' | 'pulse', scale: number): string {
  const a = DIAL_ART[id].art;
  const body = part === 'pulse' ? a.pulse?.body ?? '' : a[part];
  const defs = part === 'over' ? a.overDefs ?? a.defs : a.defs;
  return svgDoc(dialView(), f(DIAL_VIEW.w * scale), f(DIAL_VIEW.h * scale), body, defs);
}
export function spinSvg(s: SpinLayer, defs: string, scale: number): string {
  return svgDoc(`${-s.r} ${-s.r} ${s.r * 2} ${s.r * 2}`, f(s.r * 2 * scale), f(s.r * 2 * scale), s.body, s.defs ?? defs);
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
  return svgDoc(dialView(), w, f((w * DIAL_VIEW.h) / DIAL_VIEW.w), body, a.defs + (a.overDefs ?? '') + (a.spinDefs ?? '') + clip);
}

// ------------------------------------------------------------------ card backs
export interface BackLook { body: string; defs: string; ink: string; textY: number }
const BACK_VIEW = '0 0 240 336';
const back = (ink: string): BackLook => ({ body: '', defs: '', ink, textY: 306 });
export const BACK_ART: Record<string, BackLook> = {
  'back:skeleton': back('#f6dc98'),
  'back:astro': back('#f6dc98'),
  'back:cathedral': back('#bff0ff'),
  'back:steam': back('#f0c890'),
  'back:wadokei': back('#f0cc90'),
  'back:compass': back('#c8d0ff'),
  'back:forge': back('#f0c89a'),
  'back:archive': back('#f0cc80'),
};
/** Size and spacing of the CHRONO DUEL line, in back units (240 wide). */
export const BACK_TEXT = { size: 14, spacing: 3.2 };
export const backSvg = (id: string, w: number, h: number, withText = false) => {
  const b = BACK_ART[id];
  const text = withText ? `<text x="120" y="${b.textY}" text-anchor="middle" font-family="Cinzel, Georgia, 'Times New Roman', serif" font-weight="700" font-size="${BACK_TEXT.size}" letter-spacing="${BACK_TEXT.spacing}" fill="${b.ink}">CHRONO DUEL</text>` : '';
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
  fx?: { embers?: boolean; ripple?: { x: number; y: number }; steam?: { x: number; y: number }[]; petals?: boolean; rise?: boolean; frost?: boolean };
}
const mat = (fx?: MatLook['fx']): MatLook => ({ defs: '', under: '', over: '', fx });
export const MAT_ART: Record<string, MatLook> = {
  'mat:skeleton': mat(),
  'mat:astro': mat(),
  'mat:cathedral': mat({ frost: true }),
  'mat:steam': mat({ steam: [{ x: 352, y: 470 }, { x: 98, y: 744 }] }),
  'mat:wadokei': mat({ petals: true }),
  'mat:compass': mat({ rise: true }),
  'mat:forge': mat({ embers: true }),
  'mat:archive': mat(),
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

// ------------------------------------------------------------------ filling in the generated pictures
function fill() {
  if (!GEN) return;
  for (const t of THEME_IDS) {
    const g = GEN[t];
    if (!g) continue;
    const d = DIAL_ART[`dial:${t}`].art;
    Object.assign(d, { defs: g.dial.defs, under: g.dial.under, over: g.dial.over, overDefs: g.dial.overDefs, clip: g.dial.clip, spinDefs: g.dial.spinDefs, spins: g.dial.spins?.map((s) => ({ ...s, defs: g.dial.spinDefs })) });
    Object.assign(BACK_ART[`back:${t}`], { body: g.back.body, defs: g.back.defs });
    Object.assign(MAT_ART[`mat:${t}`], { defs: g.mat.defs, under: g.mat.under, over: g.mat.over ?? '', spins: g.mat.spins });
  }
}
