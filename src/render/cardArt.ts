import { artBack, isArtBack } from './looks';
import { CARD_LIST, cardDef, setOf, type CardDef } from '../core/cards';
import { CSS, FONTS } from './theme';

/** Procedural card art and card faces drawn with Canvas2D, shared by the Pixi board and the DOM deck editor. */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const MOTIF_HUE: Record<CardDef['motif'], [string, string, string]> = {
  gear: ['#1d3b45', '#0a161c', '#e0b25c'],
  hourglass: ['#3d3122', '#120d08', '#f1d18a'],
  pendulum: ['#1f3a3a', '#081414', '#9fe0cf'],
  bell: ['#3a2a1c', '#120c07', '#f0c070'],
  hand: ['#1b2f47', '#070f1a', '#b9d4ff'],
  spiral: ['#2c2145', '#0d0818', '#c9a8ff'],
  eye: ['#20344a', '#08111c', '#8fe3ff'],
  shield: ['#2f3238', '#0c0d10', '#d8dde6'],
  flame: ['#4a1f18', '#150705', '#ffab6b'],
  crown: ['#3e3016', '#130e04', '#ffd66e'],
  wave: ['#16323f', '#050d14', '#8ff0e0'],
};

type Ctx = CanvasRenderingContext2D;

function motifPath(c: Ctx, m: CardDef['motif'], cx: number, cy: number, r: number, R: () => number) {
  c.beginPath();
  switch (m) {
    case 'gear': {
      const teeth = 10 + Math.floor(R() * 6);
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2;
        const rr = i % 2 ? r * 0.82 : r;
        const a2 = a + Math.PI / teeth;
        c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        c.lineTo(cx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr);
      }
      c.closePath();
      c.moveTo(cx + r * 0.32, cy); c.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + R(); c.moveTo(cx + Math.cos(a) * r * 0.32, cy + Math.sin(a) * r * 0.32); c.lineTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); }
      break;
    }
    case 'hourglass':
      c.moveTo(cx - r * 0.6, cy - r); c.lineTo(cx + r * 0.6, cy - r); c.lineTo(cx + r * 0.08, cy); c.lineTo(cx + r * 0.6, cy + r); c.lineTo(cx - r * 0.6, cy + r); c.lineTo(cx - r * 0.08, cy); c.closePath();
      c.moveTo(cx - r * 0.8, cy - r * 1.08); c.lineTo(cx + r * 0.8, cy - r * 1.08);
      c.moveTo(cx - r * 0.8, cy + r * 1.08); c.lineTo(cx + r * 0.8, cy + r * 1.08);
      c.moveTo(cx - r * 0.35, cy + r * 0.95); c.quadraticCurveTo(cx, cy + r * 0.45, cx + r * 0.35, cy + r * 0.95);
      break;
    case 'pendulum':
      c.moveTo(cx, cy - r * 1.1); c.lineTo(cx + r * 0.25, cy + r * 0.45);
      c.moveTo(cx + r * 0.25 + r * 0.3, cy + r * 0.62); c.arc(cx + r * 0.25, cy + r * 0.62, r * 0.3, 0, Math.PI * 2);
      c.moveTo(cx - r * 0.9, cy + r * 0.2); c.quadraticCurveTo(cx, cy + r * 1.05, cx + r * 0.9, cy + r * 0.2);
      break;
    case 'bell':
      c.moveTo(cx - r * 0.85, cy + r * 0.7);
      c.bezierCurveTo(cx - r * 0.7, cy + r * 0.3, cx - r * 0.65, cy - r * 0.9, cx, cy - r * 0.9);
      c.bezierCurveTo(cx + r * 0.65, cy - r * 0.9, cx + r * 0.7, cy + r * 0.3, cx + r * 0.85, cy + r * 0.7);
      c.closePath();
      c.moveTo(cx + r * 0.16, cy + r * 0.9); c.arc(cx, cy + r * 0.9, r * 0.16, 0, Math.PI * 2);
      c.moveTo(cx, cy - r * 0.9); c.lineTo(cx, cy - r * 1.15);
      break;
    case 'hand': {
      c.moveTo(cx + r, cy); c.arc(cx, cy, r, 0, Math.PI * 2);
      const a1 = -Math.PI / 2 + R() * 2, a2 = a1 + 1 + R() * 3;
      c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a1) * r * 0.85, cy + Math.sin(a1) * r * 0.85);
      c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a2) * r * 0.55, cy + Math.sin(a2) * r * 0.55);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.moveTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86); c.lineTo(cx + Math.cos(a) * r * 0.97, cy + Math.sin(a) * r * 0.97); }
      break;
    }
    case 'spiral':
      for (let i = 0; i <= 220; i++) { const t = i / 220, a = t * Math.PI * 7, rr = r * t; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      break;
    case 'eye':
      c.moveTo(cx - r, cy); c.quadraticCurveTo(cx, cy - r * 0.95, cx + r, cy); c.quadraticCurveTo(cx, cy + r * 0.95, cx - r, cy);
      c.moveTo(cx + r * 0.38, cy); c.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
      c.moveTo(cx + r * 0.12, cy); c.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
      break;
    case 'shield':
      c.moveTo(cx - r * 0.8, cy - r * 0.85); c.lineTo(cx + r * 0.8, cy - r * 0.85); c.lineTo(cx + r * 0.8, cy); c.quadraticCurveTo(cx + r * 0.7, cy + r * 0.8, cx, cy + r * 1.05); c.quadraticCurveTo(cx - r * 0.7, cy + r * 0.8, cx - r * 0.8, cy); c.closePath();
      c.moveTo(cx, cy - r * 0.65); c.lineTo(cx, cy + r * 0.75); c.moveTo(cx - r * 0.55, cy - r * 0.15); c.lineTo(cx + r * 0.55, cy - r * 0.15);
      break;
    case 'flame':
      c.moveTo(cx, cy + r);
      c.bezierCurveTo(cx - r * 0.95, cy + r * 0.8, cx - r * 0.6, cy - r * 0.2, cx - r * 0.1, cy - r * 1.05);
      c.bezierCurveTo(cx - r * 0.05, cy - r * 0.45, cx + r * 0.35, cy - r * 0.55, cx + r * 0.25, cy - r * 0.95);
      c.bezierCurveTo(cx + r * 0.95, cy - r * 0.2, cx + r * 0.85, cy + r * 0.8, cx, cy + r);
      c.moveTo(cx, cy + r * 0.8); c.bezierCurveTo(cx - r * 0.4, cy + r * 0.5, cx - r * 0.2, cy, cx, cy - r * 0.35); c.bezierCurveTo(cx + r * 0.25, cy + r * 0.05, cx + r * 0.4, cy + r * 0.5, cx, cy + r * 0.8);
      break;
    case 'crown':
      c.moveTo(cx - r, cy + r * 0.6); c.lineTo(cx - r, cy - r * 0.4); c.lineTo(cx - r * 0.5, cy + r * 0.05); c.lineTo(cx, cy - r * 0.8); c.lineTo(cx + r * 0.5, cy + r * 0.05); c.lineTo(cx + r, cy - r * 0.4); c.lineTo(cx + r, cy + r * 0.6); c.closePath();
      for (const x of [-1, 0, 1]) { const px = cx + x * r * (x ? 1 : 0), py = cy + (x ? -r * 0.4 : -r * 0.8); c.moveTo(px + r * 0.1, py - r * 0.1); c.arc(px, py - r * 0.1, r * 0.1, 0, Math.PI * 2); }
      break;
    case 'wave': {
      // a struck point and the ripples it leaves behind
      const ox = cx - r * 0.75;
      c.moveTo(ox + r * 0.16, cy); c.arc(ox, cy, r * 0.16, 0, Math.PI * 2);
      for (let k = 1; k <= 4; k++) {
        const rr = r * (0.35 + k * 0.3), sp = 0.95 - k * 0.08;
        c.moveTo(ox + Math.cos(-sp) * rr, cy + Math.sin(-sp) * rr); c.arc(ox, cy, rr, -sp, sp);
      }
      break;
    }
  }
}

// ------------------------------------------------------------------ illustrations
/**
 * Painted illustrations (public/cards/<id>.webp, 640×400). A card without one (tokens, sets still being drawn)
 * keeps its drawn emblem. The game waits for them briefly at start-up, since card faces are drawn once and kept.
 */
const pics = new Map<string, HTMLImageElement>();
let picBase = './cards/';
/** Where the pictures are, relative to the page (the wiki lives one folder down). */
export function setCardPicBase(base: string) { picBase = base; }
let picsLoading: Promise<void> | null = null;
export function loadCardPics(maxMs = 6000): Promise<void> {
  picsLoading ??= Promise.all(CARD_LIST.filter((c) => !c.token && setOf(c) !== 'gear').map((c) => new Promise<void>((res) => {
    const img = new Image();
    img.onload = () => { pics.set(c.id, img); res(); };
    img.onerror = () => res();
    img.src = `${picBase}${c.id}.webp`;
  }))).then(() => undefined);
  return Promise.race([picsLoading, new Promise<void>((r) => setTimeout(r, maxMs))]);
}
/** Draws the picture over the whole canvas, cropped to fill it, centred. */
function drawPic(c: Ctx, img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

const artCache = new Map<string, HTMLCanvasElement>();
/** Square-ish illustration for a card. */
export function cardArt(id: string, w = 300, h = 230): HTMLCanvasElement {
  const key = `${id}:${w}x${h}`;
  const hit = artCache.get(key);
  if (hit) return hit;
  const d = cardDef(id);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  const pic = pics.get(id);
  if (pic) {
    drawPic(c, pic, w, h);
    // a light vignette so the frame and the text around it sit well on any picture
    const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
    artCache.set(key, cv);
    return cv;
  }
  const R = rng(hash(id));
  const [bgA, bgB, glow] = MOTIF_HUE[d.motif];
  const cx = w / 2 + (R() - 0.5) * w * 0.12, cy = h / 2 + (R() - 0.5) * h * 0.1;
  const g = c.createRadialGradient(cx, cy * 0.9, 4, cx, cy, Math.max(w, h) * 0.75);
  g.addColorStop(0, bgA); g.addColorStop(1, bgB);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // rays
  c.save(); c.translate(cx, cy); c.globalAlpha = 0.09;
  const rays = 12 + Math.floor(R() * 12);
  for (let i = 0; i < rays; i++) { c.rotate((Math.PI * 2) / rays); c.fillStyle = glow; c.beginPath(); c.moveTo(0, 0); c.lineTo(w, -6 - R() * 10); c.lineTo(w, 6 + R() * 10); c.fill(); }
  c.restore();
  // dial rings
  c.strokeStyle = glow; c.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    const rr = Math.min(w, h) * (0.32 + k * 0.16 + R() * 0.04);
    c.globalAlpha = 0.18 - k * 0.04;
    c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.stroke();
    const n = [60, 24, 12][k];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const l = i % 5 === 0 ? 8 : 4; c.beginPath(); c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); c.lineTo(cx + Math.cos(a) * (rr - l), cy + Math.sin(a) * (rr - l)); c.stroke(); }
  }
  c.globalAlpha = 1;
  // motif, glowing line art
  const r = Math.min(w, h) * (d.kind === 'unit' ? 0.3 : 0.27) * (d.rarity === 'L' ? 1.12 : 1);
  if (setOf(d) === 'echo') {
    // the set's signature: an after-image trailing the emblem
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    for (const [dx, al] of [[-w * 0.09, 0.28], [-w * 0.17, 0.14]] as const) {
      motifPath(c, d.motif, cx + dx, cy, r, rng(hash(id) + 7));
      c.globalAlpha = al; c.strokeStyle = glow; c.lineWidth = 2; c.stroke();
    }
    c.restore();
  }
  c.save();
  c.shadowColor = glow; c.shadowBlur = 18;
  c.lineJoin = 'round'; c.lineCap = 'round';
  motifPath(c, d.motif, cx, cy, r, rng(hash(id) + 7));
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill('evenodd');
  c.strokeStyle = glow; c.lineWidth = 3.2; c.stroke();
  c.shadowBlur = 0; c.globalAlpha = 0.7; c.strokeStyle = '#fff8e6'; c.lineWidth = 1; c.stroke();
  c.restore();
  // dust
  for (let i = 0; i < 40; i++) { c.globalAlpha = R() * 0.6; c.fillStyle = glow; c.beginPath(); c.arc(R() * w, R() * h, R() * 1.6 + 0.3, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = 1;
  // vignette
  const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
  c.fillStyle = v; c.fillRect(0, 0, w, h);
  artCache.set(key, cv);
  return cv;
}

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function wrapText(c: Ctx, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    if (c.measureText(cur + ch).width > maxW && cur) {
      // avoid starting a line with closing punctuation
      if ('。、）」'.includes(ch)) { cur += ch; lines.push(cur); cur = ''; continue; }
      lines.push(cur); cur = ch;
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Frame metal by rarity (light, mid, dark): steel, teal, violet, gold. The rarity is shown by this alone. */
const RARITY_FRAME: Record<string, [string, string, string]> = {
  C: ['#d5dde0', '#5b666b', '#2e3538'], R: ['#c4f5e8', '#2b8f7c', '#14463d'],
  E: ['#ead8ff', '#7444c0', '#331a5c'], L: ['#fff3c2', '#c08a22', '#5e3f05'],
};
/** Units and spells: the plate under the art, and the crest (top right) that names the kind. */
const KIND_LOOK = {
  unit: { plate: '#13232a', crest: '#3a2414', ring: '#e9a061' },
  spell: { plate: '#1b1730', crest: '#241a46', ring: '#c9a8ff' },
};
const BELL_PATH = 'M22 2c2.2 0 3 1.6 3 3.2 7.5 1.6 11 8 11 17 0 6 2 9 6 12v3H2v-3c4-3 6-6 6-12 0-9 3.5-15.4 11-17C19 3.6 19.8 2 22 2z';
const SWORD_PATH = 'M19 3l2 0 0 2-9.5 9.5-2-2z M6 13l5 5-1.5 1.5-1.5-1.5-3 3-1.5-1.5 3-3-1.5-1.5z';
const GLASS_PATH = 'M6 2h12v2c0 4-3 6-4.5 8C15 14 18 16 18 20v2H6v-2c0-4 3-6 4.5-8C9 10 6 8 6 4z';
const SAND_PATH = 'M9 20c0-2 2-3.5 3-4.5 1 1 3 2.5 3 4.5z';

export const CARD_W = 340, CARD_H = 476;
/** The card's outline, `i` pixels in: units are rounded, spells have their corners cut (an octagon). */
function cardShape(c: Ctx, spell: boolean, i: number) {
  const x0 = i, y0 = i, x1 = CARD_W - i, y1 = CARD_H - i;
  if (!spell) { rr(c, x0, y0, x1 - x0, y1 - y0, Math.max(4, 24 - i)); return; }
  const k = 30 - i * 0.414; // keeps the cut edges parallel
  c.beginPath();
  c.moveTo(x0 + k, y0); c.lineTo(x1 - k, y0); c.lineTo(x1, y0 + k); c.lineTo(x1, y1 - k);
  c.lineTo(x1 - k, y1); c.lineTo(x0 + k, y1); c.lineTo(x0, y1 - k); c.lineTo(x0, y0 + k); c.closePath();
}
const faceCache = new Map<string, HTMLCanvasElement>();
/**
 * Full card face at 2x (logical 170x238), in the 透かし機構 style: a metal frame whose colour is the rarity, the
 * art over the top half fading into a notched plate, the cost in a brass bell, and the kind told twice — by the
 * outline (units rounded, spells octagonal) and by the crest (a sword or an hourglass).
 */
export function cardFace(id: string): HTMLCanvasElement {
  const hit = faceCache.get(id);
  if (hit) return hit;
  const d = cardDef(id);
  const W = CARD_W, H = CARD_H, F = 9;
  const spell = d.kind === 'spell';
  const look = KIND_LOOK[d.kind];
  const [r1, r2, r3] = RARITY_FRAME[d.rarity] ?? RARITY_FRAME.C;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  // frame
  const fg = c.createLinearGradient(0, 0, W, H);
  fg.addColorStop(0, r1); fg.addColorStop(0.45, r2); fg.addColorStop(0.6, r1); fg.addColorStop(1, r3);
  cardShape(c, spell, 0); c.fillStyle = fg; c.fill();
  // inside: art, then the plate
  c.save(); cardShape(c, spell, F); c.clip();
  c.fillStyle = look.plate; c.fillRect(0, 0, W, H);
  const artH = 292;
  c.drawImage(cardArt(id, W - 2 * F, artH), F, F);
  if (d.rarity === 'L' || d.rarity === 'E') {
    // foil: a soft prismatic sheen across the art
    const fo = c.createLinearGradient(F, F, W - F, F + artH);
    const hues = d.rarity === 'L' ? ['255,120,120', '255,220,120', '140,255,190', '120,190,255', '220,140,255'] : ['190,140,255', '140,200,255', '230,160,255'];
    hues.forEach((hu, i) => fo.addColorStop(i / (hues.length - 1), `rgba(${hu},0.14)`));
    c.globalCompositeOperation = 'overlay'; c.fillStyle = fo; c.fillRect(F, F, W - 2 * F, artH); c.globalCompositeOperation = 'source-over';
  }
  const fade = c.createLinearGradient(0, F + artH * 0.58, 0, F + artH);
  fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, look.plate);
  c.fillStyle = fade; c.fillRect(F, F + artH * 0.58, W - 2 * F, artH * 0.42 + 1);
  const pt = F + 255, notch = 27;
  c.beginPath();
  c.moveTo(0, pt + notch); c.lineTo(W * 0.28, pt + notch); c.lineTo(W * 0.34, pt); c.lineTo(W * 0.66, pt); c.lineTo(W * 0.72, pt + notch); c.lineTo(W, pt + notch); c.lineTo(W, H); c.lineTo(0, H); c.closePath();
  c.fillStyle = look.plate; c.fill();
  c.restore();
  if (d.rarity === 'L') {
    // a legend's frame glows a little on its inner edge
    c.save(); cardShape(c, spell, F); c.shadowColor = 'rgba(255,214,110,0.9)'; c.shadowBlur = 10; c.strokeStyle = 'rgba(255,240,190,0.85)'; c.lineWidth = 1.5; c.stroke(); c.restore();
  } else {
    c.save(); cardShape(c, spell, F); c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.5; c.stroke(); c.restore();
  }
  // name
  c.fillStyle = CSS.ivory; c.textAlign = 'center'; c.textBaseline = 'middle';
  let fs = 24; c.font = `700 ${fs}px ${FONTS.display}`;
  while (c.measureText(d.name).width > W - 60 && fs > 16) { fs -= 1; c.font = `700 ${fs}px ${FONTS.display}`; }
  c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 6;
  c.fillText(d.name, W / 2, pt + 21);
  c.shadowBlur = 0; c.textAlign = 'left';
  // rules text: as large as fits above the stats (units) or the bottom edge (spells)
  const tx = 26, tw = W - 52, top = pt + 50, bottom = spell ? H - 22 : H - 78;
  const kw = (d.keywords ?? []).map((k) => ({ taunt: '挑発', pierce: '貫通', swift: '速攻', shift: '転移' })[k]).join('・');
  const kwOnly = !spell && !!kw && d.text === kw;
  let size = 18;
  type Block = { lines: string[]; lh: number; font: string; color: string; label?: boolean };
  let blocks: Block[] = [];
  for (; size >= 13; size--) {
    const lh = Math.round(size * 1.42);
    blocks = [];
    c.font = `500 ${size}px ${FONTS.body}`;
    if (d.text) blocks.push({ lines: kwOnly ? [kw] : wrapText(c, d.text, tw), lh, font: kwOnly ? `700 ${size}px ${FONTS.body}` : `500 ${size}px ${FONTS.body}`, color: kwOnly ? CSS.brass : CSS.ivory });
    if (spell && d.resvText) blocks.push({ lines: wrapText(c, d.resvText, tw - size * 3.4), lh, font: `500 ${size}px ${FONTS.body}`, color: '#e9d9ae', label: true });
    const used = blocks.reduce((n, b) => n + b.lines.length * b.lh, 0) + (blocks.length > 1 ? 4 : 0);
    if (top + used <= bottom) break;
  }
  let y = top;
  c.textBaseline = 'middle';
  blocks.forEach((b, bi) => {
    if (bi) y += 4;
    if (b.label) { c.font = `700 ${size}px ${FONTS.body}`; c.fillStyle = CSS.brass; c.fillText('予約時', tx, y); }
    c.font = b.font; c.fillStyle = b.color;
    b.lines.forEach((l, i) => c.fillText(l, b.label ? tx + size * 3.4 : tx, y + i * b.lh));
    y += b.lines.length * b.lh;
  });
  // flavor, when there is room
  c.font = `italic 400 15px ${FONTS.display}`;
  const fl = wrapText(c, d.flavor, tw).slice(0, 2);
  if (y + 6 + fl.length * 20 <= bottom + 4) { c.fillStyle = 'rgba(241,231,208,0.5)'; fl.forEach((l, i) => c.fillText(l, tx, y + 8 + i * 20)); }
  // stats: attack and health jewels, the reload as dots between them
  if (!spell) {
    const sy = H - 46;
    const jewel = (x: number, color: string, v: number) => {
      c.save(); c.translate(x, sy);
      c.beginPath(); c.moveTo(0, -31); c.lineTo(31, 0); c.lineTo(0, 31); c.lineTo(-31, 0); c.closePath();
      const gg = c.createLinearGradient(-22, -22, 22, 22); gg.addColorStop(0, color); gg.addColorStop(1, '#0d1518');
      c.fillStyle = gg; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#fff'; c.font = `700 26px ${FONTS.num}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(v), 0, 2);
      c.restore();
    };
    jewel(52, '#e9674f', d.atk!);
    jewel(W - 52, '#5fd0b5', d.hp!);
    const n = Math.max(4, d.reload ?? 0);
    for (let i = 0; i < n; i++) {
      const x = W / 2 + (i - (n - 1) / 2) * 17;
      c.beginPath(); c.arc(x, sy, 5.5, 0, Math.PI * 2);
      if (i < (d.reload ?? 0)) { c.fillStyle = '#8fa9ad'; c.fill(); }
      c.strokeStyle = '#8fa9ad'; c.lineWidth = 2; c.stroke();
    }
  }
  // cost: a brass bell
  c.save(); c.translate(5, 3); c.scale(1.7, 1.7);
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
  const bg = c.createRadialGradient(15, 14, 1, 22, 22, 33); bg.addColorStop(0, '#fff3cf'); bg.addColorStop(0.55, '#d4a24a'); bg.addColorStop(1, '#6d4813');
  c.fillStyle = bg; c.fill(new Path2D(BELL_PATH));
  c.shadowColor = 'transparent';
  c.strokeStyle = '#3b2a0e'; c.lineWidth = 1.4; c.stroke(new Path2D(BELL_PATH));
  c.beginPath(); c.arc(22, 41.5, 3.6, 0, Math.PI * 2); c.fill(); c.lineWidth = 1.2; c.stroke();
  c.restore();
  c.fillStyle = '#22170a'; c.font = `700 32px ${FONTS.num}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(d.cost), 5 + 22 * 1.7, 3 + 23 * 1.7);
  // kind crest: a sword for units, an hourglass for spells
  const kx = W - 44, ky = 44;
  c.save();
  c.beginPath(); c.arc(kx, ky, 25, 0, Math.PI * 2);
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  c.fillStyle = look.crest; c.fill();
  c.shadowColor = 'transparent'; c.strokeStyle = look.ring; c.lineWidth = 2.5; c.stroke();
  c.translate(kx - 17, ky - 17); c.scale(34 / 24, 34 / 24);
  if (spell) {
    c.strokeStyle = '#e5d6ff'; c.lineWidth = 1.8; c.lineJoin = 'round'; c.stroke(new Path2D(GLASS_PATH));
    c.fillStyle = '#e5d6ff'; c.fill(new Path2D(SAND_PATH));
  } else { c.fillStyle = '#ffd2a8'; c.fill(new Path2D(SWORD_PATH)); }
  c.restore();
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  faceCache.set(id, cv);
  return cv;
}

const backCache = new Map<string, HTMLCanvasElement>();
/**
 * Card back. `style` is a look id ('back:gear', …) bought in the shop; unknown ids fall back to the brass clock.
 * Every back keeps the brass frame and the CHRONO DUEL line so a card is always recognisable from behind.
 */
export function cardBack(style = 'back:brass'): HTMLCanvasElement {
  const hit = backCache.get(style);
  if (hit) return hit;
  // themed backs are pictures (lookArt.ts); until one has loaded, show the brass back without remembering it
  if (isArtBack(style)) return artBack(style) ?? cardBack('back:brass');
  const W = CARD_W, H = CARD_H, cx = W / 2, cy = H / 2;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const pal: Record<string, [string, string, string, string, string]> = {
    // frame light, frame dark, field centre, field edge, ink
    'back:brass': ['#caa057', '#6d4d1c', '#1b3b46', '#060d11', '#e0b25c'],
  };
  const [f0, f1, b0, b1, ink] = pal[style] ?? pal['back:brass'];
  rr(c, 0, 0, W, H, 22); const fg = c.createLinearGradient(0, 0, W, H); fg.addColorStop(0, f0); fg.addColorStop(1, f1); c.fillStyle = fg; c.fill();
  rr(c, 8, 8, W - 16, H - 16, 16); const bg = c.createRadialGradient(cx, cy, 10, cx, cy, H * 0.6); bg.addColorStop(0, b0); bg.addColorStop(1, b1); c.fillStyle = bg; c.fill();
  c.save(); rr(c, 8, 8, W - 16, H - 16, 16); c.clip();
  c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 2; c.globalAlpha = 0.8;
  const dial = (r: number) => {
    for (const k of [r, r - 20, r - 56]) { c.beginPath(); c.arc(cx, cy, k, 0, Math.PI * 2); c.stroke(); }
    for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2, l = i % 5 ? 6 : 14; c.beginPath(); c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.lineTo(cx + Math.cos(a) * (r - l), cy + Math.sin(a) * (r - l)); c.stroke(); }
  };
  {
    dial(120);
    c.lineWidth = 5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy - 90); c.moveTo(cx, cy); c.lineTo(cx + 55, cy + 20); c.stroke();
  }
  c.restore();
  c.globalAlpha = 1; c.fillStyle = ink; c.font = `700 26px ${FONTS.display}`; c.textAlign = 'center'; c.fillText('CHRONO DUEL', cx, H - 50);
  backCache.set(style, cv);
  return cv;
}

export const PACK_W = 360, PACK_H = 560;
const packCache = new Map<string, HTMLCanvasElement>();
/** Booster pack wrapper: foil gradient, crimped ends, the set emblem and title. The top 64px is the tear-off strip. */
export function packArt(name: string, sub: string): HTMLCanvasElement {
  const key = name + sub;
  const hit = packCache.get(key);
  if (hit) return hit;
  const W = PACK_W, H = PACK_H;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  // body silhouette with crimped ends
  c.beginPath(); c.moveTo(0, 14);
  for (let x = 0; x <= W; x += 12) c.lineTo(x, ((x / 12) % 2 ? 0 : 14));
  c.lineTo(W, H - 14);
  for (let x = W; x >= 0; x -= 12) c.lineTo(x, H - (((W - x) / 12) % 2 ? 0 : 14));
  c.closePath();
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0f3b46'); g.addColorStop(0.45, '#15213f'); g.addColorStop(1, '#2a1244');
  c.fillStyle = g; c.fill();
  c.save(); c.clip();
  // foil streaks
  for (let i = 0; i < 9; i++) {
    const sg = c.createLinearGradient(0, 0, W, H);
    const a = 0.05 + (i % 3) * 0.03;
    sg.addColorStop(Math.max(0, i / 9 - 0.05), 'rgba(255,255,255,0)'); sg.addColorStop(i / 9, `rgba(160,255,240,${a})`); sg.addColorStop(Math.min(1, i / 9 + 0.05), 'rgba(255,255,255,0)');
    c.fillStyle = sg; c.fillRect(0, 0, W, H);
  }
  // emblem: clock face with ripples and an after-image
  const cx = W / 2, cy = H * 0.44;
  c.strokeStyle = '#8ff0e0'; c.shadowColor = '#8ff0e0'; c.shadowBlur = 16;
  for (const [r, a, lw] of [[118, 0.9, 3], [96, 0.5, 1.5], [150, 0.25, 1.2], [182, 0.14, 1]] as const) { c.globalAlpha = a; c.lineWidth = lw; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); }
  c.globalAlpha = 0.9; c.lineWidth = 2;
  for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2, l = i % 5 ? 6 : 14; c.beginPath(); c.moveTo(cx + Math.cos(a) * 118, cy + Math.sin(a) * 118); c.lineTo(cx + Math.cos(a) * (118 - l), cy + Math.sin(a) * (118 - l)); c.stroke(); }
  for (const [dx, al] of [[0, 1], [-18, 0.35], [-34, 0.15]] as const) {
    c.globalAlpha = al; c.lineWidth = 5; c.strokeStyle = '#e0b25c'; c.shadowColor = '#e0b25c';
    c.beginPath(); c.moveTo(cx + dx, cy); c.lineTo(cx + dx, cy - 86); c.moveTo(cx + dx, cy); c.lineTo(cx + dx + 58, cy + 26); c.stroke();
  }
  c.globalAlpha = 1; c.shadowBlur = 0; c.fillStyle = '#e0b25c'; c.beginPath(); c.arc(cx, cy, 8, 0, Math.PI * 2); c.fill();
  // ripples to the right of the emblem
  c.strokeStyle = '#8ff0e0'; c.lineWidth = 2;
  for (let k = 1; k <= 3; k++) { c.globalAlpha = 0.5 - k * 0.12; c.beginPath(); c.arc(cx, cy, 118 + k * 22, -0.5, 0.5); c.stroke(); c.beginPath(); c.arc(cx, cy, 118 + k * 22, Math.PI - 0.5, Math.PI + 0.5); c.stroke(); }
  c.globalAlpha = 1;
  // title block
  c.textAlign = 'center';
  c.fillStyle = 'rgba(4,10,14,0.55)'; c.fillRect(0, H * 0.7, W, 112);
  c.fillStyle = '#e0b25c'; c.fillRect(0, H * 0.7, W, 2); c.fillRect(0, H * 0.7 + 110, W, 2);
  c.font = `700 16px ${FONTS.num}`; c.fillStyle = '#8ff0e0'; c.fillText('CHRONO DUEL ・ SET I', cx, H * 0.7 + 26);
  c.font = `800 46px ${FONTS.display}`; c.fillStyle = '#f7ecd2'; c.shadowColor = '#000'; c.shadowBlur = 10; c.fillText(name, cx, H * 0.7 + 74); c.shadowBlur = 0;
  c.font = `500 16px ${FONTS.body}`; c.fillStyle = '#d8c9a5'; c.fillText(sub, cx, H * 0.7 + 100);
  c.font = `700 15px ${FONTS.num}`; c.fillStyle = 'rgba(241,231,208,0.7)'; c.fillText('5 CARDS', cx, H - 34);
  // tear line
  c.setLineDash([8, 7]); c.strokeStyle = 'rgba(241,231,208,0.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(10, 64); c.lineTo(W - 10, 64); c.stroke(); c.setLineDash([]);
  c.restore();
  // edge highlight
  c.strokeStyle = 'rgba(224,178,92,0.8)'; c.lineWidth = 3; c.strokeRect(1.5, 16, W - 3, H - 32);
  packCache.set(key, cv);
  return cv;
}
