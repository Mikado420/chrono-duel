import { RARITY_NAMES, cardDef, setOf, type CardDef } from '../core/cards';
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

const RARITY_EDGE: Record<string, [string, string]> = { C: ['#7d8b8f', '#3b4549'], R: ['#8fd9c8', '#2b6f63'], E: ['#d9b8ff', '#5a2f94'], L: ['#ffe29a', '#a8741f'] };

export const CARD_W = 340, CARD_H = 476;
const faceCache = new Map<string, HTMLCanvasElement>();
/** Full card face at 2x (logical 170x238). */
export function cardFace(id: string): HTMLCanvasElement {
  const hit = faceCache.get(id);
  if (hit) return hit;
  const d = cardDef(id);
  const W = CARD_W, H = CARD_H;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const [e1, e2] = RARITY_EDGE[d.rarity];
  // outer frame
  const fg = c.createLinearGradient(0, 0, W, H); fg.addColorStop(0, e1); fg.addColorStop(0.5, e2); fg.addColorStop(1, e1);
  rr(c, 0, 0, W, H, 22); c.fillStyle = fg; c.fill();
  rr(c, 6, 6, W - 12, H - 12, 17);
  const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, d.kind === 'unit' ? '#132a33' : '#1d1a33'); bg.addColorStop(1, '#070e12');
  c.fillStyle = bg; c.fill();
  // art window
  const ax = 18, ay = 64, aw = W - 36, ah = 190;
  c.save(); rr(c, ax, ay, aw, ah, 10); c.clip(); c.drawImage(cardArt(id, aw, ah), ax, ay);
  if (d.rarity === 'L' || d.rarity === 'E') {
    // foil: a soft prismatic sheen across the art
    const fo = c.createLinearGradient(ax, ay, ax + aw, ay + ah);
    const hues = d.rarity === 'L' ? ['255,120,120', '255,220,120', '140,255,190', '120,190,255', '220,140,255'] : ['190,140,255', '140,200,255', '230,160,255'];
    hues.forEach((hu, i) => fo.addColorStop(i / (hues.length - 1), `rgba(${hu},0.16)`));
    c.globalCompositeOperation = 'overlay'; c.fillStyle = fo; c.fillRect(ax, ay, aw, ah); c.globalCompositeOperation = 'source-over';
  }
  c.restore();
  rr(c, ax, ay, aw, ah, 10); c.strokeStyle = e1; c.globalAlpha = 0.7; c.lineWidth = 2; c.stroke(); c.globalAlpha = 1;
  // name
  c.fillStyle = CSS.ivory; c.font = `700 30px ${FONTS.display}`; c.textBaseline = 'middle';
  let fs = 30; while (c.measureText(d.name).width > W - 130 && fs > 20) { fs -= 1; c.font = `700 ${fs}px ${FONTS.display}`; }
  c.fillText(d.name, 96, 36);
  // cost medallion (a tiny clock)
  const mx = 50, my = 38;
  c.beginPath(); c.arc(mx, my, 30, 0, Math.PI * 2); const mg = c.createRadialGradient(mx - 8, my - 8, 2, mx, my, 30); mg.addColorStop(0, '#fff1c9'); mg.addColorStop(1, '#b8862f'); c.fillStyle = mg; c.fill();
  c.strokeStyle = '#3b2a0e'; c.lineWidth = 2; c.stroke();
  c.strokeStyle = 'rgba(59,42,14,0.7)'; c.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.moveTo(mx + Math.cos(a) * 24, my + Math.sin(a) * 24); c.lineTo(mx + Math.cos(a) * 28, my + Math.sin(a) * 28); c.stroke(); }
  c.fillStyle = '#23180a'; c.font = `700 32px ${FONTS.num}`; c.textAlign = 'center'; c.fillText(String(d.cost), mx, my + 2); c.textAlign = 'left';
  // kind + rarity strip
  const kind = d.kind === 'unit' ? 'ユニット' : '術';
  const kw = (d.keywords ?? []).map((k) => ({ taunt: '挑発', pierce: '貫通', swift: '速攻', shift: '転移' })[k]).join('・');
  c.font = `500 17px ${FONTS.body}`; c.fillStyle = e1;
  c.fillText(`${kind}${d.rarity !== 'C' ? ` ・ ${RARITY_NAMES[d.rarity]}` : ''}`, 22, 274);
  if (setOf(d) !== 'base') {
    // set mark: a small ripple and the set's number
    c.save(); c.translate(W - 34, 268); c.strokeStyle = e1; c.lineWidth = 1.6; c.globalAlpha = 0.9;
    c.beginPath(); c.arc(-8, 0, 3, 0, Math.PI * 2); c.stroke();
    for (const rr2 of [7, 11]) { c.beginPath(); c.arc(-8, 0, rr2, -0.8, 0.8); c.stroke(); }
    c.font = `700 14px ${FONTS.num}`; c.fillStyle = e1; c.textAlign = 'right'; c.fillText('I', 14, 1);
    c.restore();
  }
  // rules text
  const tx = 22, tw = W - 44;
  let y = 304;
  c.font = `500 19px ${FONTS.body}`; c.fillStyle = CSS.ivory;
  const body = d.kind === 'unit' ? d.text : d.text;
  const lines = body ? wrapText(c, body, tw) : [];
  if (kw && d.kind === 'unit' && d.text === kw) lines.splice(0, lines.length, kw);
  for (const l of lines) { c.fillText(l, tx, y); y += 25; }
  if (d.kind === 'spell' && d.resvText) {
    y += 4;
    c.font = `700 16px ${FONTS.body}`; c.fillStyle = CSS.brass; c.fillText('予約時', tx, y);
    c.font = `500 18px ${FONTS.body}`; c.fillStyle = '#e9d9ae';
    const rl = wrapText(c, d.resvText, tw - 58);
    rl.forEach((l, i) => c.fillText(l, tx + 58, y + i * 23));
    y += rl.length * 23;
  }
  // flavor
  if (y < 390) {
    c.font = `italic 400 16px ${FONTS.display}`; c.fillStyle = 'rgba(241,231,208,0.55)';
    wrapText(c, d.flavor, tw).slice(0, 2).forEach((l, i) => c.fillText(l, tx, Math.max(y + 8, 372) + i * 21));
  }
  // stats
  if (d.kind === 'unit') {
    const gem = (x: number, color: string, label: string, v: number) => {
      c.save(); c.translate(x, H - 44);
      c.beginPath(); c.moveTo(0, -28); c.lineTo(28, 0); c.lineTo(0, 28); c.lineTo(-28, 0); c.closePath();
      const gg = c.createLinearGradient(0, -28, 0, 28); gg.addColorStop(0, color); gg.addColorStop(1, '#10181b');
      c.fillStyle = gg; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#fff'; c.font = `700 30px ${FONTS.num}`; c.textAlign = 'center'; c.fillText(String(v), 0, 2);
      c.font = `500 13px ${FONTS.body}`; c.fillStyle = color; c.fillText(label, 0, -36); c.restore();
    };
    gem(52, CSS.atk, '攻撃', d.atk!);
    gem(W - 52, CSS.hp, '体力', d.hp!);
    // reload: small dial
    c.save(); c.translate(W / 2, H - 44);
    c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); c.fillStyle = '#0b1519'; c.fill(); c.strokeStyle = CSS.mute; c.lineWidth = 1.5; c.stroke();
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * d.reload!) / 4); c.closePath(); c.fillStyle = 'rgba(143,169,173,0.35)'; c.fill();
    c.fillStyle = CSS.ivory; c.font = `700 22px ${FONTS.num}`; c.textAlign = 'center'; c.fillText(String(d.reload), 0, 2);
    c.font = `500 13px ${FONTS.body}`; c.fillStyle = CSS.mute; c.fillText('間隔', 0, -30);
    c.restore();
  }
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
  const W = CARD_W, H = CARD_H, cx = W / 2, cy = H / 2;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const pal: Record<string, [string, string, string, string, string]> = {
    // frame light, frame dark, field centre, field edge, ink
    'back:brass': ['#caa057', '#6d4d1c', '#1b3b46', '#060d11', '#e0b25c'],
    'back:gear': ['#d8b066', '#7a5418', '#2c2414', '#0b0905', '#f0c46a'],
    'back:ember': ['#e08a4a', '#6e2a12', '#3a140c', '#0c0503', '#ffb07a'],
    'back:tide': ['#8fd9c8', '#1f6b5c', '#0f3a40', '#030b0e', '#8ff0e0'],
    'back:star': ['#c9c6e6', '#4a4a7a', '#1a1d45', '#04050f', '#e6e2ff'],
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
  if (style === 'back:gear') {
    // two meshing gears
    const gear = (x: number, y: number, r: number, teeth: number, rot: number) => {
      c.beginPath();
      for (let i = 0; i < teeth * 2; i++) { const a = rot + (i / (teeth * 2)) * Math.PI * 2, k = i % 2 ? r * 0.84 : r; c.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k); c.lineTo(x + Math.cos(a + Math.PI / teeth) * k, y + Math.sin(a + Math.PI / teeth) * k); }
      c.closePath(); c.stroke();
      c.beginPath(); c.arc(x, y, r * 0.3, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * Math.PI * 2; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3); c.lineTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); c.stroke(); }
    };
    c.lineWidth = 3; gear(cx - 34, cy - 40, 92, 14, 0.1); c.lineWidth = 2.5; gear(cx + 70, cy + 96, 58, 10, 0.32); gear(cx - 92, cy + 132, 36, 8, 0);
  } else if (style === 'back:ember') {
    dial(120);
    c.globalAlpha = 0.35;
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.22; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 210, cy + Math.sin(a) * 210); c.stroke(); }
    c.globalAlpha = 0.95; c.lineWidth = 6; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx - 40, cy - 88); c.stroke(); c.lineWidth = 4; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + 66, cy + 10); c.stroke();
  } else if (style === 'back:tide') {
    const ox = cx - 70;
    c.beginPath(); c.arc(ox, cy, 14, 0, Math.PI * 2); c.fill();
    for (let k = 1; k <= 7; k++) { c.globalAlpha = 0.85 - k * 0.09; c.beginPath(); c.arc(ox, cy, 22 + k * 30, -1.05, 1.05); c.stroke(); c.beginPath(); c.arc(ox + 140, cy, 22 + k * 30, Math.PI - 1.05, Math.PI + 1.05); c.stroke(); }
  } else if (style === 'back:star') {
    const R = rng(7);
    for (let i = 0; i < 90; i++) { c.globalAlpha = 0.25 + R() * 0.75; c.beginPath(); c.arc(16 + R() * (W - 32), 16 + R() * (H - 32), R() * 1.8 + 0.4, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 0.7;
    const pts = [[cx - 90, cy - 120], [cx - 30, cy - 70], [cx + 40, cy - 100], [cx + 80, cy - 20], [cx + 20, cy + 50], [cx - 60, cy + 30], [cx - 30, cy + 130]];
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
    for (const [x, y] of pts) { c.globalAlpha = 1; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 0.5; c.beginPath(); c.arc(cx, cy, 150, 0, Math.PI * 2); c.stroke();
  } else {
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
