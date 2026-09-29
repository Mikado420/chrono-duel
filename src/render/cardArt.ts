import { cardDef, type CardDef } from '../core/cards';
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

const RARITY_EDGE: Record<string, [string, string]> = { C: ['#7d8b8f', '#3b4549'], R: ['#8fd9c8', '#2b6f63'], L: ['#ffe29a', '#a8741f'] };

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
  c.save(); rr(c, ax, ay, aw, ah, 10); c.clip(); c.drawImage(cardArt(id, aw, ah), ax, ay); c.restore();
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
  const kw = (d.keywords ?? []).map((k) => ({ taunt: '挑発', pierce: '貫通', swift: '速攻' })[k]).join('・');
  c.font = `500 17px ${FONTS.body}`; c.fillStyle = e1;
  c.fillText(`${kind}${d.rarity === 'L' ? ' ・ 伝説' : d.rarity === 'R' ? ' ・ 希少' : ''}`, 22, 274);
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

const backCache: { cv?: HTMLCanvasElement } = {};
export function cardBack(): HTMLCanvasElement {
  if (backCache.cv) return backCache.cv;
  const W = CARD_W, H = CARD_H;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  rr(c, 0, 0, W, H, 22); const fg = c.createLinearGradient(0, 0, W, H); fg.addColorStop(0, '#caa057'); fg.addColorStop(1, '#6d4d1c'); c.fillStyle = fg; c.fill();
  rr(c, 8, 8, W - 16, H - 16, 16); const bg = c.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, H * 0.6); bg.addColorStop(0, '#1b3b46'); bg.addColorStop(1, '#060d11'); c.fillStyle = bg; c.fill();
  c.strokeStyle = '#e0b25c'; c.lineWidth = 2; c.globalAlpha = 0.8;
  for (const r of [120, 100, 64]) { c.beginPath(); c.arc(W / 2, H / 2, r, 0, Math.PI * 2); c.stroke(); }
  for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2, l = i % 5 ? 6 : 14; c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * 120, H / 2 + Math.sin(a) * 120); c.lineTo(W / 2 + Math.cos(a) * (120 - l), H / 2 + Math.sin(a) * (120 - l)); c.stroke(); }
  c.lineWidth = 5; c.beginPath(); c.moveTo(W / 2, H / 2); c.lineTo(W / 2, H / 2 - 90); c.moveTo(W / 2, H / 2); c.lineTo(W / 2 + 55, H / 2 + 20); c.stroke();
  c.globalAlpha = 1; c.fillStyle = '#e0b25c'; c.font = `700 26px ${FONTS.display}`; c.textAlign = 'center'; c.fillText('CHRONO DUEL', W / 2, H - 50);
  backCache.cv = cv;
  return cv;
}
